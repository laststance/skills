import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Mailbox, startBridge } from '../scripts/lib/bridge.mjs';
import { idFor, makeFixture, newSession } from './helpers.mjs';

const assetsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets');

/** Raw HTTP request so tests control Host/Origin/headers exactly. */
function request(port, { method = 'GET', route, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port, method, path: route, headers: { Host: `127.0.0.1:${port}`, ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}), ...headers } }, (res) => {
      let text = '';
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, json: text.startsWith('{') ? JSON.parse(text) : null, text }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function liveBridge() {
  const fx = await makeFixture();
  const session = await newSession(fx);
  await session.startScan();
  const bridge = await startBridge(session, { assetsDir });
  const origin = bridge.origin;
  const token = new URL(bridge.viewerUrl).hash.slice(3);
  const json = { 'Content-Type': 'application/json' };
  const login = await request(bridge.port, { method: 'POST', route: '/api/session', headers: { ...json, Origin: origin }, body: { token } });
  const viewer = { Authorization: `Bearer ${login.json.viewerToken}`, Origin: origin, ...json };
  const agent = { Authorization: `Bearer ${bridge.agentToken}`, ...json };
  const close = async () => {
    bridge.server.close();
    clearInterval(session.timer);
    await fx.cleanup();
  };
  return { fx, session, bridge, origin, viewer, agent, token, close, port: bridge.port };
}

// protects: agent and viewer roles differ | fails_when: the agent credential can confirm or the viewer can assess | no_claim: compromised same-user process
test('the agent credential cannot use viewer endpoints and the viewer cannot submit assessments', async () => {
  // Arrange
  const live = await liveBridge();
  // Act
  const agentConfirms = await request(live.port, { method: 'POST', route: '/api/plans/11111111-1111-4111-8111-111111111111/confirm', headers: { ...live.agent, Origin: live.origin }, body: { manifestHash: 'x', nonce: 'y' } });
  const viewerAssesses = await request(live.port, { method: 'POST', route: '/agent/assessments', headers: { Authorization: live.viewer.Authorization, 'Content-Type': 'application/json' }, body: { scanId: live.session.scanId, revision: 0, assessments: [] } });
  // Assert
  assert.deepEqual([agentConfirms.status, agentConfirms.json.error.code], [403, 'wrong-role']);
  assert.deepEqual([viewerAssesses.status, viewerAssesses.json.error.code], [403, 'wrong-role']);
  await live.close();
});

// protects: the local API resists other origins | fails_when: a wrong Host, Origin or token can read or mutate | no_claim: same-user malware
test('wrong Host, foreign or null Origin, reused bootstrap token and missing credentials are rejected', async () => {
  // Arrange
  const live = await liveBridge();
  const chat = { scanId: live.session.scanId, candidateIds: [], text: 'hello' };
  // Act
  const results = await Promise.all([
    request(live.port, { route: '/api/state', headers: { ...live.viewer, Host: `localhost:${live.port}` } }),
    request(live.port, { method: 'POST', route: '/api/chat', headers: { ...live.viewer, Origin: 'https://evil.example' }, body: chat }),
    request(live.port, { method: 'POST', route: '/api/chat', headers: { ...live.viewer, Origin: 'null' }, body: chat }),
    request(live.port, { method: 'POST', route: '/api/chat', headers: { Authorization: live.viewer.Authorization, 'Content-Type': 'application/json' }, body: chat }),
    request(live.port, { method: 'POST', route: '/api/session', headers: { 'Content-Type': 'application/json', Origin: live.origin }, body: { token: live.token } }),
    request(live.port, { route: '/api/state' }),
    request(live.port, { route: '/agent/status', headers: { ...live.agent, Origin: live.origin } }),
  ]);
  // Assert
  assert.deepEqual(results.map((result) => [result.status, result.json.error.code]), [
    [403, 'bad-host'], [403, 'bad-origin'], [403, 'bad-origin'], [403, 'origin-required'], [401, 'session-expired'], [401, 'no-session'], [403, 'bad-origin'],
  ]);
  assert.equal(results.some((result) => /CORS|access-control/i.test(JSON.stringify(result.headers))), false);
  assert.equal(live.session.chat.length, 0);
  await live.close();
});

// protects: browser actions take only declared fields and bounded bodies | fails_when: a path/command field, wrong type or huge body is accepted | no_claim: every parser bug
test('unknown fields, non-JSON bodies and oversized bodies are rejected with stable codes', async () => {
  // Arrange
  const live = await liveBridge();
  const base = { scanId: live.session.scanId, revision: 0, candidateIds: [] };
  // Act
  const unknownField = await request(live.port, { method: 'POST', route: '/api/plans', headers: live.viewer, body: { ...base, path: '/Users/me' } });
  const wrongType = await request(live.port, { method: 'POST', route: '/api/chat', headers: { ...live.viewer, 'Content-Type': 'text/plain' }, body: 'hi' });
  const tooLarge = await request(live.port, { method: 'POST', route: '/api/chat', headers: live.viewer, body: { scanId: live.session.scanId, candidateIds: [], text: 'x'.repeat(70 * 1024) } });
  const agentCommand = await request(live.port, { method: 'POST', route: '/agent/assessments', headers: live.agent, body: { scanId: live.session.scanId, revision: 0, assessments: [{ candidateId: idFor(live.session, live.fx.project), risk: 'safe', purpose: 'x', reason: 'x', consequences: [], evidence: [], recipe: 'npm-cache', argv: ['rm', '-rf', '/'] }] } });
  // Assert
  assert.deepEqual([unknownField.status, unknownField.json.error.code], [400, 'unknown-field']);
  assert.deepEqual([wrongType.status, wrongType.json.error.code], [415, 'unsupported-media-type']);
  assert.deepEqual([tooLarge.status, tooLarge.json.error.code], [413, 'payload-too-large']);
  assert.deepEqual([agentCommand.status, agentCommand.json.error.code], [400, 'unknown-field']);
  await live.close();
});

// protects: the viewer is served with a strict CSP | fails_when: inline script or foreign connections are allowed | no_claim: browser CSP bugs
test('the viewer page is served with a self-only content security policy and no-store caching', async () => {
  // Arrange
  const live = await liveBridge();
  // Act
  const page = await request(live.port, { route: '/' });
  // Assert
  assert.equal(page.status, 200);
  assert.match(page.headers['content-security-policy'], /default-src 'none'; script-src 'self'; style-src 'self'/);
  assert.equal(page.headers['cache-control'], 'no-store');
  assert.equal(page.text.includes(live.bridge.agentToken), false);
  await live.close();
});

// protects: the same mailbox carries a question and its answer | fails_when: a reply reaches the wrong candidate or session | no_claim: any provider beyond the fixture
test('a viewer question reaches the agent with its candidate path and the reply appears in the same session', async () => {
  // Arrange
  const live = await liveBridge();
  const target = path.join(live.fx.project, '.next');
  const candidateId = idFor(live.session, target);
  await request(live.port, { route: '/agent/next?timeout=1', headers: live.agent });
  // Act
  const asked = await request(live.port, { method: 'POST', route: '/api/chat', headers: live.viewer, body: { scanId: live.session.scanId, candidateIds: [candidateId], text: 'Can I delete this?' } });
  const event = await request(live.port, { route: '/agent/next?timeout=2', headers: live.agent });
  const reply = await request(live.port, { method: 'POST', route: '/agent/responses', headers: live.agent, body: { messageId: event.json.messageId, revision: 0, text: 'It is Next.js build output.', candidateIds: [candidateId] } });
  const state = await request(live.port, { route: '/api/state?after=-1', headers: live.viewer });
  // Assert
  assert.equal(event.json.messageId, asked.json.id);
  assert.deepEqual(event.json.payload.candidates.map((candidate) => candidate.path), [target]);
  assert.equal(reply.json.duplicate, false);
  assert.deepEqual(state.json.chat.map((message) => [message.role, message.text, message.candidateIds]), [['user', 'Can I delete this?', [candidateId]], ['agent', 'It is Next.js build output.', [candidateId]]]);
  await live.close();
});

// protects: reconnecting causes no duplicates | fails_when: a leased message gets a new ID or a repeated reply shows twice | no_claim: host auto-resume
test('an expired lease redelivers the same message ID and a repeated answer is ignored', async () => {
  // Arrange
  let clock = 1_000;
  const fx = await makeFixture();
  const box = new Mailbox({ file: path.join(fx.base, 'mailbox.jsonl'), leaseMs: 60_000, now: () => clock });
  const posted = await box.post('chat', { text: 'hi' });
  const first = await box.next(10);
  // Act
  const whileLeased = await box.next(10);
  clock += 60_001;
  const again = await box.next(10);
  const answers = [await box.answer(posted.id), await box.answer(posted.id)];
  const afterAnswer = await box.next(10);
  // Assert
  assert.deepEqual([first.messageId, first.delivery], [posted.id, 1]);
  assert.equal(whileLeased, null);
  assert.deepEqual([again.messageId, again.delivery, again.redelivered], [posted.id, 2, true]);
  assert.deepEqual(answers, ['ok', 'duplicate']);
  assert.equal(afterAnswer, null);
  await fx.cleanup();
});

// protects: a stale agent is shown as disconnected | fails_when: an expired lease still reads as connected | no_claim: viewer polling latency
test('the agent shows as disconnected once its lease expires', async () => {
  // Arrange
  const fx = await makeFixture();
  const session = await newSession(fx);
  const connected = session.agentStatus().connected;
  // Act
  session.agent.leaseUntil = Date.now() - 1;
  session.tick();
  // Assert
  assert.deepEqual([connected, session.agentStatus().connected, session.agentStatus().everConnected], [true, false, true]);
  clearInterval(session.timer);
  await fx.cleanup();
});
