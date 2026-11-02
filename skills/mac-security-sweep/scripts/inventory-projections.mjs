import path from 'node:path';
import { homedir } from 'node:os';
import { allowedProjectRoot, within } from './safe-io.mjs';

/** 表示用metadataだけを短い一行にする。各readerの出力直前に呼ぶ。 @example cleanText('Chrome') */
export function cleanText(value, maximum = 240) {
  if (typeof value !== 'string') return null;
  if (/https?:\/\/|(?:bearer\s|gh[pousr]_|sk-[A-Za-z0-9]|password\s*[=:]|token\s*[=:])/i.test(value)) return '[非表示]';
  return value.replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, maximum);
}

/** 拡張の配布元を有限分類へ写す。欠落を公開の根拠にしない。 @example extensionSource('gallery') */
export function extensionSource(value) {
  if (typeof value !== 'string') return 'unknown';
  if (/open.?vsx/i.test(value)) return 'open-vsx';
  return /^(gallery|marketplace|vsix|local|system)$/i.test(value) ? value.toLowerCase() : 'unknown';
}

/** MCP定義を識別名と実行ファイルbasenameだけへ射影する。args/env/URLを残さない。 @example projectMcpServer('local', {command:'/usr/bin/node'}, file) */
export function projectMcpServer(name, definition, configPath) {
  const executable = typeof definition?.command === 'string' ? path.basename(definition.command.split(/\s/)[0]) : null;
  return { name: cleanText(name), configPath, transport: definition?.url ? 'remote-url-redacted' : executable ? 'stdio' : 'unknown', executable: executable && /^[\w.+-]{1,100}$/.test(executable) ? executable : null, configured: true };
}

/** lsof field出力からPID・実行名・数値ソケットだけを残す。 @example parseLsof('p12\ncnode\nn127.0.0.1:3000\nTST=LISTEN\n') */
export function parseLsof(raw) {
  const rows = [];
  let pid = null, name = null, socket = null;
  for (const line of raw.split('\n').slice(0, 30000)) {
    if (/^p\d+$/.test(line)) { pid = Number(line.slice(1)); name = null; socket = null; }
    else if (line.startsWith('c')) name = cleanText(path.basename(line.slice(1)));
    else if (line.startsWith('n') && /^[\da-fA-F.:*\[\]>%-]+$/.test(line.slice(1))) { socket = { pid, process: name, endpoint: line.slice(1, 501), state: null }; rows.push(socket); }
    else if (line.startsWith('TST=') && socket && /^(LISTEN|ESTABLISHED|CLOSE_WAIT|TIME_WAIT|SYN_SENT)$/.test(line.slice(4))) socket.state = line.slice(4);
  }
  return rows;
}

/** cwd/txtの許可した静的実体情報だけを保持する。引数や環境変数は解釈しない。 @example projectProcessFiles(raw, home, roots) */
export function projectProcessFiles(raw, userHome = homedir(), configuredRoots) {
  const defaults = ['Projects', 'repository', 'work'].map(name => ({ path: path.join(userHome, name) }));
  const projectRoots = [...(configuredRoots || defaults).map(root => typeof root === 'string' ? root : root.path).filter(root => allowedProjectRoot(userHome, root)), path.join(userHome, '.openclaw')];
  const runtimeRoots = ['.vite-plus/js_runtime/node', '.local/share/mise/installs/node', '.nvm/versions/node', '.fnm/node-versions', '.volta/tools/image/node', '.asdf/installs/nodejs'].map(relative => path.join(userHome, relative));
  runtimeRoots.push('/opt/homebrew/Cellar/node', '/usr/local/Cellar/node');
  let descriptor = '', cwd = null, runtimePath = null;
  for (const line of raw.split('\n').slice(0, 10000)) {
    if (line.startsWith('f')) descriptor = line.slice(1);
    if (!line.startsWith('n')) continue;
    const value = line.slice(1);
    if (!path.isAbsolute(value) || cleanText(value, 4000) !== value || path.normalize(value) !== value) continue;
    if (descriptor === 'cwd' && projectRoots.some(root => within(root, value))) cwd = value;
    if (descriptor === 'txt' && runtimeRoots.some(root => within(root, value)) && value.endsWith('/bin/node')) runtimePath = value;
  }
  return { cwd, runtimePath, purpose: cwd && within(path.join(userHome, '.openclaw'), cwd) ? 'OpenClaw' : 'プロジェクト（依存自体の実行は未確認）' };
}

/** 起動設定の中から既知Node実体パスだけを抽出する。本文は保存しない。 @example projectLaunchRuntimes(['exec /known/bin/node'], home) */
export function projectLaunchRuntimes(argumentsList, userHome = homedir()) {
  const candidates = [];
  for (const value of Array.isArray(argumentsList) ? argumentsList : []) {
    if (typeof value !== 'string' || value.length > 65536) continue;
    for (const match of value.matchAll(/(?:^|[\s"'])(\/[^\s"';|&<>]+\/bin\/node)(?=$|[\s"';|&<>])/g)) {
      const projected = projectProcessFiles(`ftxt\nn${match[1]}`, userHome);
      if (projected.runtimePath) candidates.push(projected.runtimePath);
    }
  }
  return [...new Set(candidates)];
}

/** version/identifierを限定文法へ射影し、設定の任意文字列を除く。 @example safeVersion('1.2.3') */
export const safeVersion = value => typeof value === 'string' && /^[v\d][A-Za-z0-9._+!:-]{0,119}$/.test(value) ? value.replace(/^v(?=\d)/, '') : null;
export const safeIdentifier = value => typeof value === 'string' && /^[A-Za-z0-9@][A-Za-z0-9@._/+:-]{0,249}$/.test(value) ? value : null;
