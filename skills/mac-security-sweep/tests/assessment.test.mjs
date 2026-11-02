import test from 'node:test';
import assert from 'node:assert/strict';
import { assessmentStatus, coverageKind, prioritizeFindings, compareAssessments, planLockfiles, normalizeScanRoots, evidenceScope } from '../scripts/assessment.mjs';

test('探索ルートが未設定なら個人名や組織名を含まない既定値を使う', () => {
  // Arrange
  const userHome = '/Users/example';
  // Act
  const roots = normalizeScanRoots(undefined, userHome);
  // Assert
  assert.deepEqual(roots, [{ path: '/Users/example/Projects', scope: 'personal' }, { path: '/Users/example/repository', scope: 'personal' }, { path: '/Users/example/work', scope: 'work' }]);
});

test('承認済みの個人用と仕事用ルートはローカル設定から復元する', () => {
  // Arrange
  const configured = [{ path: '~/client-projects', scope: 'work' }, { path: '~/personal-projects/', scope: 'personal' }];
  // Act
  const roots = normalizeScanRoots(configured, '/Users/example');
  const scope = evidenceScope(['/Users/example/client-projects/app/package-lock.json'], { projectRoots: roots });
  // Assert
  assert.deepEqual(roots, [{ path: '/Users/example/client-projects', scope: 'work' }, { path: '/Users/example/personal-projects', scope: 'personal' }]);
  assert.equal(scope, '仕事');
});

test('ホーム全体・認証領域・親参照・URLを探索ルートへ持ち込まない', () => {
  // Arrange
  const configured = ['~/', '/Users/example/', '~/.ssh', '~/Library', '~/Projects/../work', '/private/work', 'https://example.test', '~/token=SENTINEL'].map(path => ({ path, scope: 'work' }));
  // Act
  const roots = normalizeScanRoots(configured, '/Users/example');
  // Assert
  assert.deepEqual(roots, []);
});

test('不正なルート設定は暗黙に別の領域へ置き換えない', () => {
  // Arrange
  const configured = [{ path: '~/.config', scope: 'work' }];
  // Act
  const roots = normalizeScanRoots(configured, '/Users/example');
  // Assert
  assert.deepEqual(roots, []);
});

test('鍵本文の非読取だけなら取得失敗を示さず方針上の対象外と報告する', () => {
  // Arrange
  const coverage = [{ area: 'ioc-authorized-keys', status: 'not-read', policyExcluded: true }];
  // Act
  const status = assessmentStatus(coverage);
  // Assert
  assert.equal(status, 'complete-with-exclusions');
  assert.equal(coverageKind(coverage[0]), 'excluded');
});

test('ログ取得失敗と未確認記事が残れば方針上の対象外があってもpartialを維持する', () => {
  // Arrange
  const coverage = [{ status: 'not-read', policyExcluded: true }, { area: 'ioc-logs', status: 'unavailable' }];
  // Act
  const failed = assessmentStatus(coverage);
  const unreviewed = assessmentStatus([{ status: 'complete' }], 1);
  // Assert
  assert.equal(failed, 'partial');
  assert.equal(unreviewed, 'partial');
});

test('古い重大告知が新しい軽微告知より先に表示され悪性配布はさらに優先される', () => {
  // Arrange
  const findings = [{ id: 'new-low', severity: 'LOW', modified: '2026-11-02' },
    { id: 'old-critical', severity: 'CRITICAL', modified: '2026-01-01' }, { id: 'malware', advisoryType: 'malware' }];
  // Act
  const ranked = prioritizeFindings(findings);
  // Assert
  assert.deepEqual(ranked.map(finding => finding.id), ['malware', 'old-critical', 'new-low']);
});

test('前回の未処理115ファイルを2回目の処理の先頭へ回す', () => {
  // Arrange
  const files = Array.from({ length: 515 }, (_, index) => ({ path: `/example/${index}/pnpm-lock.yaml`, size: 1, modifiedAt: '2026-11-02' }));
  const pendingLockfiles = files.slice(400).map(file => file.path);
  // Act
  const next = planLockfiles(files, { pendingLockfiles });
  // Assert
  assert.equal(next[0].path, '/example/400/pnpm-lock.yaml');
  assert.equal(next[114].path, '/example/514/pnpm-lock.yaml');
  assert.equal(next[115].path, '/example/0/pnpm-lock.yaml');
});

test('stateにしか存在しないパスを次の走査対象へ追加しない', () => {
  // Arrange
  const files = [{ path: '/example/pnpm-lock.yaml' }];
  // Act
  const next = planLockfiles(files, { pendingLockfiles: ['/private/credential.json'] });
  // Assert
  assert.deepEqual(next, [{ path: '/example/pnpm-lock.yaml' }]);
});

test('今回走査しなかった依存を解消にせず確認不能として次回にも残す', () => {
  // Arrange
  const previous = [{ id: 'old-hit', title: 'example', status: '可能性高', package: { name: 'example', ecosystem: 'npm' }, evidence: ['/example/pnpm-lock.yaml'] }];
  // Act
  const changes = compareAssessments(previous, [], { coverage: [{ area: 'osv-query', status: 'complete' }] });
  // Assert
  assert.equal(changes.resolved.length, 0);
  assert.equal(changes.unconfirmed.length, 1);
  assert.equal(changes.snapshot[0].id, 'old-hit');
});

test('同じ依存元の再走査とOSV照会が完了した場合だけ以前の一致を解消する', () => {
  // Arrange
  const previous = [{ id: 'old-hit', status: '可能性高', package: { name: 'example', ecosystem: 'npm' }, evidence: ['/example/package-lock.json'] }];
  const packages = { coverage: [{ area: 'lockfile', path: '/example/package-lock.json', status: 'complete' }, { area: 'osv-query', status: 'complete' }] };
  // Act
  const changes = compareAssessments(previous, [], packages);
  // Assert
  assert.equal(changes.resolved.length, 1);
  assert.equal(changes.unconfirmed.length, 0);
});

test('悪性配布や確定IOCは現在の版が対象外になっただけでは解消しない', () => {
  // Arrange
  const previous = [{ id: 'incident', status: '確定', incident: true, evidence: [] }];
  // Act
  const changes = compareAssessments(previous, [{ id: 'incident', status: '影響なし' }]);
  // Assert
  assert.equal(changes.resolved.length, 0);
  assert.equal(changes.unconfirmed.length, 1);
});

test('OSVに追加ページが残れば以前の一致を解消しない', () => {
  // Arrange
  const previous = [{ id: 'old', status: '可能性高', package: { name: 'example' }, evidence: ['/example/lock'] }];
  const packages = { coverage: [{ area: 'lockfile', path: '/example/lock', status: 'complete' }, { area: 'osv-query', status: 'complete' }, { area: 'osv-pagination', status: 'partial' }] };
  // Act
  const changes = compareAssessments(previous, [], packages);
  // Assert
  assert.equal(changes.resolved.length, 0);
  assert.equal(changes.unconfirmed.length, 1);
});
