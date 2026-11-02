import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanText, extensionSource, projectMcpServer, parseLsof, projectProcessFiles, projectLaunchRuntimes } from '../scripts/inventory.mjs';

test('LaunchAgentとラッパーの本文から固定Nodeパスだけを抽出し秘密引数は残さない', () => {
  // Arrange
  const argumentsList = ['-c', 'export TOKEN=SENTINEL_SECRET\nexec "/Users/example/.vite-plus/js_runtime/node/26.12.1/bin/node" --token SENTINEL_ARGUMENT', '/private/auth.json'];
  // Act
  const actual = projectLaunchRuntimes(argumentsList, '/Users/example');
  // Assert
  assert.deepEqual(actual, ['/Users/example/.vite-plus/js_runtime/node/26.12.1/bin/node']);
  assert.equal(JSON.stringify(actual).includes('SENTINEL'), false);
});

test('稼働実体の観測に生の引数・環境変数・未知のパスを混ぜない', () => {
  // Arrange
  const raw = 'p12\nfcwd\nn/Users/example/.openclaw\nftxt\nn/Users/example/.vite-plus/js_runtime/node/26.12.1/bin/node\nfargs\nn--token SENTINEL_ARGUMENT\nenv=SENTINEL_ENV\n';
  // Act
  const actual = projectProcessFiles(raw, '/Users/example');
  // Assert
  assert.deepEqual(actual, { cwd: '/Users/example/.openclaw', runtimePath: '/Users/example/.vite-plus/js_runtime/node/26.12.1/bin/node', purpose: 'OpenClaw' });
  assert.equal(JSON.stringify(actual).includes('SENTINEL'), false);
});

test('実体観測の許可パスに見せた親参照や認証値を保存しない', () => {
  // Arrange
  const raw = 'fcwd\nn/Users/example/Projects/../.ssh\nftxt\nn/Users/example/.vite-plus/js_runtime/node/token=SECRET/bin/node\n';
  // Act
  const actual = projectProcessFiles(raw, '/Users/example');
  // Assert
  assert.equal(actual.cwd, null);
  assert.equal(actual.runtimePath, null);
  assert.equal(JSON.stringify(actual).includes('SECRET'), false);
});

test('MCP棚卸しへ認証URL・環境変数・秘密引数を含めない', () => {
  // Arrange: 実在しない秘密値を各入力経路へ配置する。
  const definition = { command: '/usr/bin/node', args: ['--token', 'SENTINEL_ARGUMENT'], env: { TOKEN: 'SENTINEL_ENV' }, url: 'https://SENTINEL_URL@example.test/mcp?token=SENTINEL_QUERY' };

  // Act: 公開するメタデータだけに絞る。
  const actual = projectMcpServer('example', definition, '/tmp/config.json');

  // Assert: 秘密値の代わりに通信種別だけが残る。
  assert.deepEqual(actual, { name: 'example', configPath: '/tmp/config.json', transport: 'remote-url-redacted', executable: 'node', configured: true });
  assert.equal(JSON.stringify(actual).includes('SENTINEL'), false);
});

test('表示メタデータ内の認証付きURLとトークン表記を保存しない', () => {
  // Arrange: 表示名へ紛れ込んだ認証情報を用意する。
  const values = ['https://user:SENTINEL@example.test', 'Bearer SENTINEL', 'token=SENTINEL', 'ghp_SENTINEL'];

  // Act: 保存前のフィルタリングを実行する。
  const actual = values.map(value => cleanText(value));

  // Assert: どの入力経路でも秘密値を保持しない。
  assert.deepEqual(actual, ['[非表示]', '[非表示]', '[非表示]', '[非表示]']);
});

test('入手元の欠落や未知の名称を信頼済みマーケットプレイスと判定しない', () => {
  // Arrange: 確認済みの種類と不明なメタデータを並べる。
  const values = ['gallery', 'Open VSX', 'vsix', undefined, 'approved-trusted-source'];

  // Act: 入手元を正規化する。
  const actual = values.map(extensionSource);

  // Assert: 未知の入力はunknownのまま残す。
  assert.deepEqual(actual, ['gallery', 'open-vsx', 'vsix', 'unknown', 'unknown']);
});

test('待受と外向き接続をプロセスごとに区別して報告する', () => {
  // Arrange: 引数を含まないlsofのフィールド出力を用意する。
  const raw = 'p12\ncnode\nn127.0.0.1:3000\nTST=LISTEN\np34\ncChrome\nn192.0.2.1:443->198.51.100.2:443\nTST=ESTABLISHED\n';

  // Act: TCP接続情報だけへ変換する。
  const actual = parseLsof(raw);

  // Assert: 接続状態とPIDが混ざらず保持される。
  assert.deepEqual(actual, [{ pid: 12, process: 'node', endpoint: '127.0.0.1:3000', state: 'LISTEN' }, { pid: 34, process: 'Chrome', endpoint: '192.0.2.1:443->198.51.100.2:443', state: 'ESTABLISHED' }]);
});
