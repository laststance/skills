import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSeverity, prioritizeFindings, aggregateAdvisories, assessPackageImpact, compareAssessments, normalizeScanRoots } from '../scripts/assessment.mjs';
import { matchInventory } from '../scripts/match.mjs';

test('未計算CVSS vectorはLOWより後ろへ降格せずrawと方式を保持する', () => {
  // Arrange
  const vector = { type: 'CVSS_V3', score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H' };
  // Act
  const severity = normalizeSeverity(vector, 'OSV');
  const ranked = prioritizeFindings([{ id: 'vector', severity: vector }, { id: 'low', severity: 'LOW' }, { id: 'critical', severity: '9.8' }]);
  // Assert
  assert.deepEqual(severity, { level: 'UNKNOWN', rank: 1, score: null, method: 'CVSS_V3', raw: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H', source: 'OSV', evaluated: false });
  assert.deepEqual(ranked.map(value => value.id), ['critical', 'vector', 'low']);
  assert.equal(normalizeSeverity('SENTINEL_UNKNOWN_SEVERITY').raw, null);
  assert.equal(normalizeSeverity(7.1).level, 'HIGH');
  assert.equal(normalizeSeverity('MODERATE').level, 'MEDIUM');
});

test('aliasは推移結合するがrelatedとupstreamは独立告知を維持する', () => {
  // Arrange
  const findings = [
    { id: 'a', advisoryId: 'GHSA-one', aliases: ['CVE-2026-1111'], package: { name: 'example', ecosystem: 'npm' }, version: '1.0.0', localEvidence: ['/p/a'], sources: ['https://osv.dev/a'] },
    { id: 'b', advisoryId: 'OSV-two', aliases: ['GHSA-one'], package: { name: 'example', ecosystem: 'npm' }, version: '2.0.0', localEvidence: ['/p/b'], sources: ['https://osv.dev/b'] },
    { id: 'c', advisoryId: 'GHSA-other', upstream: ['CVE-2026-1111'], related: ['OSV-two'], package: { name: 'example', ecosystem: 'npm' }, version: '1.0.0', localEvidence: ['/p/a'] },
  ];
  // Act
  const result = aggregateAdvisories(findings);
  // Assert
  assert.equal(result.uniqueAdvisoryCount, 2);
  assert.equal(result.affectedTargetCount, 2);
  assert.equal(result.advisoryTargetCount, 3);
  assert.deepEqual(result.groups[0].advisoryIds, ['CVE-2026-1111', 'GHSA-one', 'OSV-two']);
  assert.deepEqual(result.groups[0].sources, ['https://osv.dev/a', 'https://osv.dev/b']);
  assert.equal(result.groups[0].affectedTargets.length, 2);
});

test('同一aliasの同じ版を一つの判定へまとめ二つの場所と出典を残す', () => {
  // Arrange
  const packages = { findings: [
    { id: 'GHSA-one', package: { name: 'example', ecosystem: 'npm' }, version: '1.0.0', evidence: ['/p/a'] },
    { id: 'CVE-2026-1111', package: { name: 'example', ecosystem: 'npm' }, version: '1.0.0', evidence: ['/p/b'] },
  ] };
  const details = { details: [{ id: 'GHSA-one', aliases: ['CVE-2026-1111'], severity: 'HIGH' }] };
  // Act
  const result = matchInventory({}, {}, { packages, advisoryDetails: details });
  // Assert
  assert.equal(result.findings.length, 1);
  assert.equal(result.uniqueAdvisoryCount, 1);
  assert.equal(result.affectedTargetCount, 2);
  assert.deepEqual(result.findings[0].localEvidence, ['/p/a', '/p/b']);
  assert.equal(result.findings[0].sources.length, 2);
});

test('告知IDがaliasへ変わっても前回陽性は新規や解消に分裂しない', () => {
  // Arrange
  const before = [{ id: 'old', advisoryId: 'GHSA-one', package: { name: 'example', ecosystem: 'npm' }, version: '1.0.0', status: '可能性高' }];
  const after = [{ id: 'new', advisoryId: 'CVE-2026-1111', aliases: ['GHSA-one'], package: { name: 'example', ecosystem: 'npm' }, version: '1.0.0', status: '可能性高' }];
  // Act
  const changes = compareAssessments(before, after);
  // Assert
  assert.equal(changes.continuing.length, 1);
  assert.equal(changes.new.length, 0);
  assert.equal(changes.unconfirmed.length, 0);
});

test('別の導入版や親project稼働で脆弱lockの実物・実行を確定しない', () => {
  // Arrange
  const hit = { package: { name: 'example', ecosystem: 'npm' }, version: '1.0.0', evidence: ['/p/lock'], projectActive: true,
    occurrences: [{ name: 'example', ecosystem: 'npm', version: '1.0.0', evidenceKind: 'lock-declaration', optional: true }],
    installationEvidence: [{ name: 'example', ecosystem: 'npm', version: '2.0.0', path: '/p/node_modules/example' }] };
  // Act
  const impact = assessPackageImpact(hit);
  // Assert
  assert.equal(impact.kind, 'declared-only');
  assert.equal(impact.installationConfirmed, false);
  assert.equal(impact.executionConfirmed, false);
  assert.equal(impact.optional, true);
});

test('実物の正確な版一致だけがinstalled影響となりSBOMは画像digestへの束縛が必要', () => {
  // Arrange
  const target = { name: 'example', ecosystem: 'npm', version: '1.0.0' };
  // Act
  const installed = assessPackageImpact({ ...target, occurrences: [{ ...target, evidenceKind: 'installed-metadata' }] });
  const unbound = assessPackageImpact({ ...target, occurrences: [{ ...target, evidenceKind: 'digest-bound-sbom', imageDigest: `sha256:${'a'.repeat(64)}` }] });
  const bound = assessPackageImpact({ ...target, occurrences: [{ ...target, evidenceKind: 'digest-bound-sbom', imageDigest: `sha256:${'a'.repeat(64)}`, digestBound: true }] });
  const otherPlatform = assessPackageImpact({ ...target, occurrences: [{ ...target, evidenceKind: 'installed-metadata', platform: 'linux' }] });
  // Assert
  assert.equal(installed.kind, 'installed-affected');
  assert.equal(installed.compromise, 'unconfirmed');
  assert.equal(unbound.kind, 'installation-unknown');
  assert.equal(bound.kind, 'image-record-affected');
  assert.equal(otherPlatform.installationConfirmed, false);
  assert.equal(otherPlatform.platformUnconfirmed, true);
});

test('Libraryと隠し認証領域は大文字小文字や子ディレクトリで迂回できない', () => {
  // Arrange
  const roots = ['~/library/projects', '~/Projects/.ssh', '~/APPLICATIONS/project'].map(path => ({ path }));
  // Act
  const normalized = normalizeScanRoots(roots, '/Users/example');
  // Assert
  assert.deepEqual(normalized, []);
});

test('画像platform未確認でもdigest束縛を認めホストへの導入と混同しない', () => {
  // Arrange
  const target = { name: 'example', ecosystem: 'npm', version: '1.0.0' };
  const occurrence = { ...target, evidenceKind: 'digest-bound-sbom', evidenceScope: 'image', imageDigest: `sha256:${'a'.repeat(64)}`, digestBound: true, queryEligible: true, origin: 'public' };
  // Act
  const unknown = assessPackageImpact({ ...target, occurrences: [{ ...occurrence, platform: 'unknown' }] });
  const linux = assessPackageImpact({ ...target, occurrences: [{ ...occurrence, platform: 'linux' }] });
  const installed = assessPackageImpact({ ...target, occurrences: [{ ...target, evidenceKind: 'installed-metadata', platform: 'unknown', evidenceScope: 'host', queryEligible: true }] });
  // Assert
  assert.equal(unknown.kind, 'image-record-affected');
  assert.equal(linux.kind, 'image-record-affected');
  assert.equal(unknown.installationConfirmed, false);
  assert.equal(linux.executionConfirmed, false);
  assert.equal(installed.kind, 'installed-affected');
});

test('同名版の非公開実物や照合対象外SBOMで公開lockを実物影響へ昇格しない', () => {
  // Arrange
  const target = { name: 'example', ecosystem: 'npm', version: '1.0.0' };
  const declaration = { ...target, evidenceKind: 'lock-declaration', origin: 'public', queryEligible: true };
  // Act / Assert
  for (const blocked of [
    { evidenceKind: 'installed-metadata', origin: 'private' },
    { evidenceKind: 'running-target-metadata', origin: 'git', targetVerified: true },
    { evidenceKind: 'installed-metadata', origin: 'local' },
    { evidenceKind: 'digest-bound-sbom', origin: 'public', queryEligible: false, digestBound: true, imageDigest: `sha256:${'a'.repeat(64)}` },
  ]) {
    const impact = assessPackageImpact({ ...target, occurrences: [declaration, { ...target, ...blocked, platform: 'darwin' }] });
    assert.equal(impact.kind, 'declared-only');
    assert.equal(impact.installationConfirmed, false);
    assert.equal(impact.executionConfirmed, false);
  }
});

test('Firefoxが記事概要にだけ現れる場合は影響版不明の確認候補として残す', () => {
  // Arrange
  const inventory = { applications: [{ name: 'Firefox', version: '120.0', channel: 'release' }] };
  const news = { items: [{ id: 'news', title: 'Security update', summary: 'A vulnerability in Firefox was fixed.' }] };
  // Act
  const result = matchInventory(inventory, news);
  // Assert
  assert.equal(result.newsAssessment[0].relevance, '確認候補');
  assert.equal(result.findings.length, 0);
});

test('公開lockが同名版の非公開由来へ変わって照会不能になっただけでは以前の陽性を解消しない', () => {
  // Arrange
  const target = { name: 'example', ecosystem: 'npm', version: '1.0.0' };
  const previous = [{ id: 'old', advisoryId: 'CVE-2026-1234', status: '可能性高', package: { name: 'example', ecosystem: 'npm' }, version: '1.0.0', evidence: ['/project/package-lock.json'] }];
  const coverage = [{ area: 'lockfile', path: '/project/package-lock.json', status: 'complete' }, { area: 'osv-query', status: 'complete', count: 0 }];
  const excluded = { ...target, path: '/project/package-lock.json', origin: 'private', queryEligible: false };
  // Act
  const originChanged = compareAssessments(previous, [], { packages: [], records: [excluded], coverage });
  const publicElsewhere = compareAssessments(previous, [], { packages: [{ ...target, occurrences: [{ ...target, path: '/other/package-lock.json', origin: 'public', queryEligible: true }] }], records: [excluded], coverage });
  const removed = compareAssessments(previous, [], { packages: [], records: [], coverage });
  const versionChanged = compareAssessments(previous, [], { packages: [], records: [{ ...excluded, version: '2.0.0' }], coverage });
  // Assert
  assert.equal(originChanged.resolved.length, 0);
  assert.equal(originChanged.unconfirmed.length, 1);
  assert.equal(originChanged.snapshot[0].id, 'old');
  assert.equal(publicElsewhere.resolved.length, 0);
  assert.equal(removed.resolved.length, 1);
  assert.equal(versionChanged.resolved.length, 1);
});
