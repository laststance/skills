import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunContext, validateCommand, validatePublicRequest } from '../scripts/runtime.mjs';
import { diagnostic } from '../scripts/diagnostics.mjs';

test('closing the news phase cancels and drains its body while leaving the global run usable', async () => {
  // Arrange
  let cancelled = false, started;
  const bodyStarted = new Promise(resolve => { started = resolve; });
  const context = createRunContext({ budgetMs: 120000, fetchImpl: async address => {
    if (address.includes('known_exploited')) { started(); return new Response(new ReadableStream({ cancel() { cancelled = true; } })); }
    return new Response('[]');
  } });
  const phase = context.newsPhase();
  const request = phase.context.request('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json').catch(error => error);
  // Act
  await bodyStarted;
  await phase.close();
  const failed = await request;
  const later = await context.request('https://api.github.com/advisories?type=reviewed&per_page=100');
  await context.close();
  // Assert
  assert.equal(cancelled, true); assert.equal(failed.diagnostic.code, 'MSS_HTTP');
  assert.equal(later.status, 200); assert.equal(phase.budgetMs <= 36000, true);
});

test('aggregate decoded network capacity stops further requests even when each body is below its limit', async () => {
  // Arrange
  const chunk = new Uint8Array(1024 * 1024).fill(32); let calls = 0;
  const context = createRunContext({ budgetMs: 120000, fetchImpl: async () => {
    calls += 1; let chunks = 0;
    return new Response(new ReadableStream({ pull(controller) { if (chunks++ < 5) controller.enqueue(chunk); else controller.close(); } }));
  } });
  const ids = new Set(Array.from({ length: 30 }, (_, index) => `CVE-2026-${1000 + index}`));
  let error;
  // Act
  for (const id of ids) {
    try { await context.request(`https://api.osv.dev/v1/vulns/${id}`, { authorizedIds: ids }); }
    catch (failure) { error = failure; break; }
  }
  const priorCalls = calls;
  await assert.rejects(context.request('https://api.osv.dev/v1/vulns/CVE-2026-1029', { authorizedIds: ids }), failure => failure.diagnostic.code === 'MSS_CAPACITY');
  await context.close();
  // Assert
  assert.equal(error.diagnostic.code, 'MSS_CAPACITY'); assert.equal(calls, 20); assert.equal(calls, priorCalls);
  assert.equal(context.metrics.networkBytes, 97 * 1024 * 1024);
});

test('a short news deadline drains a stalled response without consuming the later local phase budget', async () => {
  // Arrange
  let cancelled = false;
  const context = createRunContext({ budgetMs: 12000, fetchImpl: async () => new Response(new ReadableStream({ cancel() { cancelled = true; } })) });
  const phase = context.newsPhase();
  // Act
  // Keep the test process alive while the runtime's deliberately unref'ed deadline fires.
  const keepAlive = setInterval(() => {}, 100);
  let failure;
  try { await phase.context.request('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json'); }
  catch (error) { failure = error; }
  finally { clearInterval(keepAlive); await phase.close(); }
  const globalAborted = context.signal.aborted, remaining = context.remainingMs();
  await context.close();
  // Assert
  assert.equal(cancelled, true); assert.equal(failure.diagnostic.cause, 'timeout');
  assert.equal(globalAborted, false); assert.equal(remaining > 0, true);
});

test('retired incident endpoints and log predicates cannot be invoked by a collector', () => {
  // Arrange / Act / Assert
  assert.equal(validatePublicRequest('https://cursor.com/blog/claude-code-extension-security-notice'), false);
  assert.equal(validateCommand('log', ['show', '--style', 'json', '--predicate', 'eventMessage CONTAINS "fixture"']), false);
  assert.equal(validateCommand('lsof', ['-nP', '-iTCP:4444']), false);
});

test('unexpected errors identify distinct static boundaries without retaining arbitrary exception context', () => {
  // Arrange
  const first = diagnostic('INTERNAL', { operation: 'news', module: 'SENTINEL_PRIVATE', callsite: 'SENTINEL_PRIVATE' });
  const second = diagnostic('INTERNAL', { operation: 'inventory' });
  // Act / Assert
  assert.equal(first.trace.module, 'sources'); assert.equal(first.trace.callsite, 'news:boundary');
  assert.equal(second.trace.module, 'collectors'); assert.equal(second.trace.callsite, 'inventory:boundary');
  assert.notEqual(first.trace.id, second.trace.id); assert.equal(JSON.stringify(first).includes('SENTINEL'), false);
});
