import { createHash } from 'node:crypto';

/**
 * XML/HTML の説明を表示用テキストへ縮約する。フィード解析から呼び出す。
 * @param value - 公開フィードの未信頼文字列。
 * @returns タグ・制御文字を除いた短い文字列。
 * @example
 * plain('<b>更新</b>')
 */
export function plain(value) {
  const input = String(value ?? '');
  const unwrapped = [];
  let position = 0;
  // Unwrap CDATA with monotonic offsets rather than a repeated-open backtracking regex.
  while (position < input.length) {
    const start = input.indexOf('<![CDATA[', position);
    if (start < 0) { unwrapped.push(input.slice(position)); break; }
    unwrapped.push(input.slice(position, start));
    const end = input.indexOf(']]>', start + 9);
    if (end < 0) { unwrapped.push(input.slice(start + 9)); break; }
    unwrapped.push(input.slice(start + 9, end)); position = end + 3;
  }
  const text = unwrapped.join(''), lower = text.toLowerCase(), output = [];
  position = 0;
  while (position < text.length) {
    const start = text.indexOf('<', position);
    if (start < 0) { output.push(text.slice(position)); break; }
    output.push(text.slice(position, start));
    const end = text.indexOf('>', start + 1);
    if (end < 0) { output.push(text.slice(start)); break; }
    const ignored = /^(script|style)(?:\s|$)/.exec(lower.slice(start + 1, Math.min(end, start + 30)))?.[1];
    if (ignored) {
      const close = lower.indexOf(`</${ignored}`, end + 1);
      if (close < 0) break;
      const closeEnd = text.indexOf('>', close);
      if (closeEnd < 0) break;
      position = closeEnd + 1;
    } else position = end + 1;
    output.push(' ');
  }
  return output.join('').replace(/&#(x[\da-f]+|\d+);/gi, (_, n) => {
    const code = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  }).replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, key) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[key])
    .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * ニュースの日時を比較可能にする。解析器と期間判定から呼び出す。
 * @returns 有効な ISO 日時。不明な日時は null。
 * @example
 * iso('30 Oct 2026')
 */
export function iso(value) {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/**
 * 一覧内リンクを安全な参照 URL に制限する。記事はここでは追加取得しない。
 * @returns HTTP(S) の参照 URL。不正な値は null。
 * @example
 * publicLink('https://support.apple.com/en-us/100100')
 */
export function publicLink(value, base) {
  try {
    const url = new URL(plain(value), base);
    // 認証付き URL や実行スキームをレポートへ残さない。
    if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443') return null;
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_|token|secret|password|key|auth/i.test(key)) url.searchParams.delete(key);
    }
    return url.href;
  } catch { return null; }
}

/**
 * 製品名の候補を抽出する。脆弱性や影響バージョンの確定には使わない。
 * @returns 原文に現れる製品・エコシステムの候補。
 * @example
 * productHints('Chrome and npm security update')
 */
export function productHints(text) {
  const rules = [
    ['iOS', /\bios\b|ipados/i], ['Linux', /\blinux\b|debian|ubuntu|alpine|red hat/i],
    ['OpenSSL', /\bopenssl\b/i], ['LibreSSL', /\blibressl\b/i], ['ImageMagick', /imagemagick/i], ['Ruby', /\bruby\b/i], ['Java', /\bjava\b|\bjdk\b|openjdk/i], ['Electron', /\belectron\b/i],
    ['macOS', /\bmacos\b|mac os|マック/i], ['Safari', /\bsafari\b/i],
    ['Chrome', /\bchrome\b|chromium/i], ['Cursor', /\bcursor\b/i],
    ['Visual Studio Code', /vs code|visual studio code|vscode/i], ['Claude Code', /claude code/i],
    ['Node.js', /node\.js|node2shell|\bnodejs\b|brotli/i], ['npm', /\bnpm\b/i],
    ['Python', /\bpython\b|\bpypi\b|\bpip\b/i], ['Rust', /\brust\b|\bcargo\b/i],
    ['Go', /\bgolang\b|\bgo packages?\b/i], ['Docker', /\bdocker\b/i],
    ['OpenClaw', /\bopenclaw\b/i], ['GitHub', /\bgithub\b/i], ['1Password', /1password/i],
    ['Next.js', /next\.js/i], ['React', /\breact\b/i], ['PHP', /\bphp\b|laravel/i],
  ];
  return rules.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
}

/**
 * 異なる情報源を共通のデータ形式へまとめる。各フィード解析器から呼び出す。
 * @returns 人が根拠を再確認できるニュース項目。
 * @example
 * item(source, { title: '公開情報', url: source.url })
 */
export function item(source, fields) {
  const title = plain(fields.title).slice(0, 350);
  const url = publicLink(fields.url, source.url) ?? source.url;
  const summary = plain(fields.summary).slice(0, 450);
  return {
    id: fields.id ?? createHash('sha256').update(`${source.name}:${url}:${title}`).digest('hex').slice(0, 20),
    title, url, source: source.name, sourceId: source.id || null, categories: source.categories || ['general'],
    ...(['debian', 'ubuntu', 'redhat', 'alpine'].includes(source.id) ? { distribution: source.id } : {}), publishedAt: iso(fields.publishedAt),
    updatedAt: iso(fields.updatedAt), products: productHints(`${title} ${summary}`),
    affected: [], fixed: [], iocs: [], summary, needsReview: true,
    ...fields, title, url, summary,
    publishedAt: iso(fields.publishedAt), updatedAt: iso(fields.updatedAt),
  };
}

