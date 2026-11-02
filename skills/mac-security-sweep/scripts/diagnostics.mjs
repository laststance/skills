import { randomUUID } from 'node:crypto';

const DEFINITIONS = Object.freeze({
  CONFIG: ['設定の形式を確認できません。', '設定資料の型・範囲だけを確認し、既存の値は削除せず修正してください。'],
  STATE: ['継続状態を安全に読み取れません。', '状態を変更せず、対応するスキルの版と保存済みレポートを確認してください。'],
  BOUNDARY: ['許可された読み取り範囲を確認できません。', '設定した対象の実体と範囲を確認してください。リンク・認証領域は対象にできません。'],
  READ: ['必要なメタデータを読み取れません。', '未確認として扱い、対象が通常のローカルファイルか確認してください。権限は変更しません。'],
  FORMAT: ['対応するメタデータ形式を確認できません。', '形式とスキルの対応表を確認してください。元ファイルは変更しません。'],
  TOOL: ['信頼できる既存の補助ツールを確認できません。', '静的メタデータの結果と未確認範囲を確認してください。自動インストールは行いません。'],
  COMMAND: ['読み取りコマンドを完了できません。', '未確認範囲を確認し、必要なら通常の巡回を一度再実行してください。'],
  HTTP: ['公開情報の取得を完了できません。', '保存済みの継続情報を保持し、表示された再試行可能時刻以降に再実行してください。'],
  TOKEN: ['公開APIの継続情報を確認できません。', '未完了の照会を保持し、次回の通常実行で再確認してください。'],
  SOURCE: ['情報源の形式・鮮度を確認できません。', '以前の取得成功日時と未確認の範囲を確認してください。'],
  READER: ['環境メタデータの確認が一部未完了です。', '対応表と未確認範囲を確認してください。権限や認証設定は変更しません。'],
  SOCKET: ['許可されたローカルコンテナ接続を確認できません。', '画像内部は未確認として扱ってください。遠隔接続や起動操作は行いません。'],
  SBOM: ['SBOMの由来・画像との対応を確認できません。', '既存のSBOMの形式と画像ダイジェストを確認してください。生成スキャンは行いません。'],
  IOC: ['IOCルールの形式・検証期限を確認できません。', 'ルールの一次資料と検証日を確認してください。未確認のルールは実行しません。'],
  LOCK: ['別の実行または所有者未確認のロックがあります。', '実行終了を待って一度だけ再試行してください。所有者不明の場合は復旧資料を確認してください。'],
  SAVE: ['レポートと継続状態の保存を完了できません。', '元の状態を削除せず、保存先の空き容量と復旧資料を確認してください。次回は保存世代を照合します。'],
  CAPACITY: ['今回の処理・保存上限に達しました。', '未処理項目を保持して再実行してください。状態容量の上限では対象設定を確認してください。'],
  DEADLINE: ['今回の収集期限に達しました。', '保存された部分レポートを確認し、通常の巡回を再実行してください。'],
  INTERNAL: ['処理を安全に継続できません。', '診断IDとスキルの版だけを添えて確認してください。生の設定・ログ・状態は共有しないでください。'],
});
const CAUSES = new Set(['absent', 'denied', 'malformed', 'unsupported', 'boundary', 'identity', 'not-local', 'limit', 'timeout', 'aborted', 'busy', 'unknown-owner', 'cooldown', 'http', 'network', 'io', 'future-schema', 'mismatch', 'unknown']);
const OPERATIONS = new Set(['config', 'state', 'read', 'list', 'write', 'lock', 'checkpoint', 'report', 'inventory', 'discovery', 'packages', 'details', 'news', 'baseline', 'ioc', 'assessment', 'runtime', 'command', 'http', 'socket', 'sbom', 'cli']);

/** 安全な有限診断へ変換する。各境界とCLIが呼び、例外の値を転載しない。 @example diagnostic('READ', { cause: 'denied' }) */
export function diagnostic(kind, options = {}) {
  const key = Object.hasOwn(DEFINITIONS, kind) ? kind : 'INTERNAL';
  const [message, recovery] = DEFINITIONS[key];
  return { code: `MSS_${key}`, message, operation: OPERATIONS.has(options.operation) ? options.operation : 'runtime',
    cause: CAUSES.has(options.cause) ? options.cause : 'unknown', recovery,
    writeOutcome: ['none', 'partial', 'complete', 'unknown'].includes(options.writeOutcome) ? options.writeOutcome : 'none',
    context: { runtime: `node-${process.versions.node.split('.')[0]}`, schema: 2 },
    trace: key === 'INTERNAL' ? { id: randomUUID(), module: 'runtime' } : null,
    reference: `references/errors.md#mss_${key.toLowerCase()}` };
}

/** 境界から呼出側へ安全な診断だけを運ぶ。 @example throw new SweepError('READ', { cause: 'denied' }) */
export class SweepError extends Error {
  constructor(kind, options = {}) {
    const detail = diagnostic(kind, options);
    super(detail.message);
    this.name = 'SweepError';
    this.diagnostic = detail;
  }
}

/** OS例外のコードだけを有限分類へ写す。秘密を含むmessage/causeは読まない。 @example causeClass({code:'EACCES'}) */
export function causeClass(error) {
  if (error instanceof SweepError) return error.diagnostic.cause;
  return ({ ENOENT: 'absent', EACCES: 'denied', EPERM: 'denied', ELOOP: 'boundary', ENOSPC: 'limit', EDQUOT: 'limit', EEXIST: 'busy', ETIMEDOUT: 'timeout', ABORT_ERR: 'aborted' })[error?.code] || 'io';
}

/** CLI/証拠保存の共通出口で例外を射影する。 @example safeDiagnostic(error, 'READ', 'read') */
export function safeDiagnostic(error, kind = 'INTERNAL', operation = 'runtime', writeOutcome = 'none') {
  if (error instanceof SweepError) return { ...error.diagnostic, writeOutcome };
  const expected = ['ENOENT', 'EACCES', 'EPERM', 'ELOOP', 'ENOSPC', 'EDQUOT', 'EEXIST', 'ETIMEDOUT', 'ABORT_ERR', 'EIO', 'EINVAL', 'ENOTDIR'].includes(error?.code);
  return diagnostic(expected ? kind : 'INTERNAL', { operation, cause: expected ? causeClass(error) : 'unknown', writeOutcome });
}

export const DIAGNOSTIC_CODES = Object.freeze(Object.keys(DEFINITIONS).map(key => `MSS_${key}`));
