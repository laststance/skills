// Local HTTP API (loopback only) with separate viewer/agent roles, plus the
// invoking-agent mailbox with leases. No model is called from here: the agent
// that ran `start` polls `next` and answers with `respond` / `assess`.
import http from 'node:http';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { RECIPES } from './recipes.mjs';
import { UUID_RE, appendJsonl, newId, newSecret, secretEquals } from './util.mjs';

export const LEASE_MS = 60_000;
const SMALL_BODY = 64 * 1024;
const ASSESS_BODY = 1024 * 1024;

/** Error carrying an HTTP status and a stable code; message is safe to show. */
export class HttpError extends Error {
  constructor(status, code, message = code, extra = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

/**
 * Persistent mailbox between the viewer and the invoking agent.
 *
 * Messages are leased to one consumer at a time. An expired lease makes the
 * same message ID deliverable again; answers are idempotent per ID.
 *
 * @example
 * const box = new Mailbox({ file: '/tmp/run/mailbox.jsonl' });
 * await box.post('chat', { text: 'What is this folder?' });
 * const event = await box.next(25_000); // { messageId, kind: 'chat', delivery: 1, ... }
 * await box.answer(event.messageId);    // 'ok', later calls → 'duplicate'
 */
export class Mailbox {
  constructor({ file, leaseMs = LEASE_MS, onChange = () => {}, now = Date.now }) {
    this.file = file;
    this.leaseMs = leaseMs;
    this.onChange = onChange;
    this.now = now;
    this.messages = new Map();
    this.waiters = new Set();
    this.closed = false;
  }

  async post(kind, payload) {
    const message = { id: newId(), kind, payload, createdAt: new Date().toISOString(), state: 'pending', deliveries: 0, leaseUntil: 0 };
    this.messages.set(message.id, message);
    await appendJsonl(this.file, { type: 'message', id: message.id, kind, payload, createdAt: message.createdAt });
    this.wake();
    this.onChange();
    return message;
  }

  /** Lease the oldest pending (or lease-expired) message, or return null. */
  take() {
    const now = this.now();
    for (const message of this.messages.values()) {
      if (message.state === 'pending' || (message.state === 'leased' && message.leaseUntil <= now)) {
        message.state = 'leased';
        message.leaseUntil = now + this.leaseMs;
        message.deliveries += 1;
        this.onChange();
        return { messageId: message.id, kind: message.kind, delivery: message.deliveries, redelivered: message.deliveries > 1, createdAt: message.createdAt, payload: message.payload };
      }
    }
    return null;
  }

  /** Wait up to `timeoutMs` for a message; null on timeout or close. */
  next(timeoutMs) {
    const ready = this.take();
    if (ready || this.closed) return Promise.resolve(ready);
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.waiters.delete(done);
        resolve(this.take());
      };
      const timer = setTimeout(done, timeoutMs);
      this.waiters.add(done);
    });
  }

  wake() {
    for (const waiter of [...this.waiters]) waiter();
  }

  /** Extend every active lease (agent heartbeat during long investigations). */
  renew() {
    const now = this.now();
    for (const message of this.messages.values()) {
      if (message.state === 'leased' && message.leaseUntil > now) message.leaseUntil = now + this.leaseMs;
    }
  }

  /** Mark a delivered message answered: 'ok' | 'duplicate' | 'unknown' | 'not-delivered'. */
  async answer(id) {
    const message = this.messages.get(id);
    if (!message) return 'unknown';
    if (message.state === 'answered') return 'duplicate';
    if (message.state !== 'leased') return 'not-delivered';
    message.state = 'answered';
    await appendJsonl(this.file, { type: 'answered', id, at: new Date().toISOString() });
    this.onChange();
    return 'ok';
  }

  get(id) {
    return this.messages.get(id);
  }

  counts() {
    const counts = { pending: 0, leased: 0, answered: 0 };
    for (const message of this.messages.values()) counts[message.state] += 1;
    return counts;
  }

  close() {
    this.closed = true;
    this.wake();
  }
}

// ---------------------------------------------------------------------------
// Request validation

const isString = (value, max) => typeof value === 'string' && value.length <= max;
const RULES = {
  uuid: (value) => typeof value === 'string' && UUID_RE.test(value),
  uuids: (value) => Array.isArray(value) && value.length <= 500 && value.every((item) => typeof item === 'string' && UUID_RE.test(item)),
  text: (value) => isString(value, 8000) && value.trim().length > 0,
  longText: (value) => isString(value, 16000) && value.trim().length > 0,
  int: (value) => Number.isSafeInteger(value) && value >= 0,
  bool: (value) => typeof value === 'boolean',
  token: (value) => isString(value, 200),
};

/**
 * Validate a JSON body against a flat shape; unknown fields are rejected so
 * browser actions cannot smuggle paths or commands.
 *
 * @example
 * validate(body, { scanId: 'uuid', text: 'text' }, ['scanId', 'text']);
 */
export function validate(body, shape, required = Object.keys(shape)) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'invalid-body', 'Body must be a JSON object.');
  for (const key of Object.keys(body)) {
    if (!(key in shape)) throw new HttpError(400, 'unknown-field', `Unknown field "${key.slice(0, 40)}".`);
  }
  for (const [key, rule] of Object.entries(shape)) {
    if (body[key] === undefined) {
      if (required.includes(key)) throw new HttpError(400, 'missing-field', `Missing field "${key}".`);
      continue;
    }
    const ok = Array.isArray(rule) ? rule.includes(body[key]) : RULES[rule](body[key]);
    if (!ok) throw new HttpError(400, 'invalid-field', `Invalid field "${key}".`);
  }
  return body;
}

const ASSESSMENT_KEYS = new Set(['candidateId', 'risk', 'purpose', 'reason', 'consequences', 'evidence', 'recipe', 'question', 'reclaimableBytes']);

/**
 * Validate one agent assessment. Rejects unknown fields (for example `argv`,
 * `command` or `path`), so an assessment can never carry executable input.
 */
export function validateAssessment(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) throw new HttpError(400, 'invalid-assessment', 'Assessment must be an object.');
  for (const key of Object.keys(item)) {
    if (!ASSESSMENT_KEYS.has(key)) throw new HttpError(400, 'unknown-field', `Unknown assessment field "${key.slice(0, 40)}".`);
  }
  const fail = (field) => {
    throw new HttpError(400, 'invalid-field', `Invalid assessment field "${field}".`);
  };
  if (!RULES.uuid(item.candidateId)) fail('candidateId');
  if (!['safe', 'review', 'protected', 'blocked'].includes(item.risk)) fail('risk');
  if (!isString(item.purpose, 500)) fail('purpose');
  if (!isString(item.reason, 2000)) fail('reason');
  if (!Array.isArray(item.consequences) || item.consequences.length > 10 || !item.consequences.every((text) => isString(text, 500))) fail('consequences');
  if (!Array.isArray(item.evidence) || item.evidence.length > 12) fail('evidence');
  for (const evidence of item.evidence) {
    const keys = Object.keys(evidence ?? {});
    if (keys.some((key) => !['kind', 'reference', 'checkedAt'].includes(key))) fail('evidence');
    if (!['local', 'documentation'].includes(evidence.kind) || !isString(evidence.reference, 1000) || !isString(evidence.checkedAt, 40)) fail('evidence');
    if (evidence.kind === 'documentation' && !/^https:\/\/[^\s]+$/.test(evidence.reference)) fail('evidence');
  }
  if (item.recipe !== null && item.recipe !== undefined && !RECIPES.includes(item.recipe)) fail('recipe');
  if (item.question !== null && item.question !== undefined && !isString(item.question, 1000)) fail('question');
  if (item.reclaimableBytes !== null && item.reclaimableBytes !== undefined && !/^\d{1,20}$/.test(String(item.reclaimableBytes))) fail('reclaimableBytes');
  return { ...item, recipe: item.recipe ?? null, question: item.question ?? null, reclaimableBytes: item.reclaimableBytes ?? null };
}

async function readJson(req, limit) {
  const type = req.headers['content-type'] ?? '';
  if (!/^application\/json(\s*;|$)/i.test(type)) throw new HttpError(415, 'unsupported-media-type', 'Use Content-Type: application/json.');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'payload-too-large', `Body exceeds ${limit} bytes.`);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new HttpError(400, 'invalid-json', 'Body is not valid JSON.');
  }
}

const SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const ASSETS = { '/': ['viewer.html', 'text/html; charset=utf-8'], '/viewer.css': ['viewer.css', 'text/css; charset=utf-8'], '/viewer.mjs': ['viewer.mjs', 'text/javascript; charset=utf-8'], '/treemap.mjs': ['treemap.mjs', 'text/javascript; charset=utf-8'] };

const send = (res, status, body) => {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};

/**
 * Start the loopback HTTP server for one session.
 *
 * Called by `disk-map.mjs serve`. Binds 127.0.0.1 on an OS-assigned port,
 * enforces exact Host/Origin, separates the agent credential from viewer
 * credentials, and maps routes onto {@link Session} methods.
 *
 * @returns `{ server, port, origin, agentToken, viewerUrl }`.
 * @example
 * const bridge = await startBridge(session, { assetsDir });
 * bridge.viewerUrl; // http://127.0.0.1:PORT/#t=<one-use token>
 */
export async function startBridge(session, { assetsDir }) {
  const agentToken = newSecret();
  const bootstrap = { token: newSecret(), used: false };
  const viewers = new Map();
  let port = 0;
  let origin = '';

  const bearer = (req) => /^Bearer ([A-Za-z0-9_-]{20,200})$/.exec(req.headers.authorization ?? '')?.[1] ?? null;

  const viewerFor = (req) => {
    const token = bearer(req);
    if (!token) throw new HttpError(401, 'no-session', 'Viewer session required.');
    if (secretEquals(token, agentToken)) throw new HttpError(403, 'wrong-role', 'Agent credentials cannot use viewer endpoints.');
    for (const [known, viewer] of viewers) if (secretEquals(token, known)) return viewer;
    throw new HttpError(401, 'session-expired', 'Viewer session is missing or expired.');
  };

  const requireAgent = (req) => {
    const token = bearer(req);
    if (!token) throw new HttpError(401, 'no-session', 'Agent credential required.');
    if (!secretEquals(token, agentToken)) {
      for (const known of viewers.keys()) if (secretEquals(token, known)) throw new HttpError(403, 'wrong-role', 'Viewer credentials cannot use agent endpoints.');
      throw new HttpError(401, 'session-expired', 'Agent credential is invalid.');
    }
    session.touchAgent();
  };

  const routes = async (req, res, url) => {
    const { pathname } = url;
    const method = req.method;
    if (method === 'GET' && ASSETS[pathname]) {
      const [file, type] = ASSETS[pathname];
      const body = await fsp.readFile(path.join(assetsDir, file));
      res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': type, 'Content-Security-Policy': CSP });
      return res.end(body);
    }

    if (pathname.startsWith('/api/')) {
      // Browser role: exact Origin on every mutation, never a foreign Origin.
      const requestOrigin = req.headers.origin;
      if (requestOrigin !== undefined && requestOrigin !== origin) throw new HttpError(403, 'bad-origin', 'Cross-origin request rejected.');
      if (method !== 'GET' && requestOrigin !== origin) throw new HttpError(403, 'origin-required', 'Same-origin request required.');
      const site = req.headers['sec-fetch-site'];
      if (site && !['same-origin', 'none'].includes(site)) throw new HttpError(403, 'bad-origin', 'Cross-site request rejected.');

      if (method === 'POST' && pathname === '/api/session') {
        const body = validate(await readJson(req, SMALL_BODY), { token: 'token' });
        if (bootstrap.used || !secretEquals(body.token, bootstrap.token)) throw new HttpError(401, 'session-expired', 'This viewer link was already used. Ask the agent for the session status.');
        bootstrap.used = true;
        const token = newSecret();
        viewers.set(token, { id: newId(), createdAt: Date.now() });
        return send(res, 200, { viewerToken: token, locale: session.config.locale });
      }
      const viewer = viewerFor(req);
      if (method === 'GET' && pathname === '/api/state') return send(res, 200, session.getState(Number(url.searchParams.get('after') ?? -1)));
      if (method === 'GET' && pathname === '/api/tree') {
        const parentId = url.searchParams.get('parentId');
        if (parentId && !UUID_RE.test(parentId)) throw new HttpError(400, 'invalid-field', 'Invalid parentId.');
        return send(res, 200, session.getTree({ parentId, cursor: Number(url.searchParams.get('cursor') ?? 0) || 0, q: (url.searchParams.get('q') ?? '').slice(0, 200) }));
      }
      if (method !== 'POST') throw new HttpError(404, 'not-found', 'Not found.');
      const confirm = /^\/api\/plans\/([0-9a-f-]{36})\/confirm$/.exec(pathname);
      const body = await readJson(req, SMALL_BODY);
      if (confirm) return send(res, 202, await session.confirmPlan(confirm[1], validate(body, { manifestHash: 'token', nonce: 'token' }), viewer));
      switch (pathname) {
        case '/api/chat':
          return send(res, 201, await session.postChat(validate(body, { scanId: 'uuid', candidateIds: 'uuids', text: 'text' })));
        case '/api/selection':
          return send(res, 200, session.setSelection(validate(body, { scanId: 'uuid', revision: 'int', candidateIds: 'uuids', selected: 'bool' })));
        case '/api/decisions':
          return send(res, 200, await session.decide(validate(body, { candidateId: 'uuid', revision: 'int', choice: ['keep', 'trash', 'investigate'] })));
        case '/api/plans':
          return send(res, 201, await session.createPlan(validate(body, { scanId: 'uuid', revision: 'int', candidateIds: 'uuids' }), viewer));
        case '/api/restores':
          return send(res, 201, await session.createRestore(validate(body, { operationId: 'uuid', destinationMode: ['original', 'sibling'] }), viewer));
        case '/api/rescan':
          return send(res, 202, await session.rescan(validate(body, { scanId: 'uuid' })));
        case '/api/export':
          validate(body, {});
          return send(res, 201, await session.exportSnapshot());
        case '/api/end':
          validate(body, {});
          return send(res, 200, await session.end());
        default:
          throw new HttpError(404, 'not-found', 'Not found.');
      }
    }

    if (pathname.startsWith('/agent/')) {
      // Agent role: never reachable from a browser page.
      if (req.headers.origin !== undefined || req.headers['sec-fetch-site'] || req.headers['sec-fetch-dest']) throw new HttpError(403, 'bad-origin', 'Browser requests cannot use agent endpoints.');
      requireAgent(req);
      if (method === 'GET' && pathname === '/agent/next') {
        const timeout = Math.min(Math.max(Number(url.searchParams.get('timeout') ?? 25) || 25, 1), 25);
        return send(res, 200, await session.nextEvent(timeout * 1000));
      }
      if (method === 'GET' && pathname === '/agent/status') return send(res, 200, session.agentSummary());
      if (method !== 'POST') throw new HttpError(404, 'not-found', 'Not found.');
      if (pathname === '/agent/assessments') {
        return send(res, 200, await session.assess(await readJson(req, ASSESS_BODY)));
      }
      const body = await readJson(req, SMALL_BODY);
      switch (pathname) {
        case '/agent/heartbeat':
          validate(body, {});
          return send(res, 200, session.heartbeat());
        case '/agent/responses':
          return send(res, 200, await session.respond(validate(body, { messageId: 'uuid', revision: 'int', text: 'longText', candidateIds: 'uuids' }, ['messageId', 'revision', 'text'])));
        case '/agent/stop':
          validate(body, {});
          return send(res, 200, await session.stop());
        default:
          throw new HttpError(404, 'not-found', 'Not found.');
      }
    }
    throw new HttpError(404, 'not-found', 'Not found.');
  };

  const server = http.createServer((req, res) => {
    (async () => {
      if (req.headers.host !== `127.0.0.1:${port}`) throw new HttpError(403, 'bad-host', 'Unexpected Host header.');
      await routes(req, res, new URL(req.url, origin));
    })().catch((error) => {
      if (res.headersSent) return res.destroy();
      if (error instanceof HttpError) {
        if (error.status === 413) res.setHeader('Connection', 'close');
        return send(res, error.status, { error: { code: error.code, message: error.message, ...error.extra } });
      }
      session.log?.(`internal error: ${error.stack ?? error}`);
      return send(res, 500, { error: { code: 'internal', message: 'Internal error. See the run log.' } });
    });
  });
  server.requestTimeout = 60_000;
  server.headersTimeout = 30_000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  port = server.address().port;
  origin = `http://127.0.0.1:${port}`;
  return { server, port, origin, agentToken, viewerUrl: `${origin}/#t=${bootstrap.token}` };
}
