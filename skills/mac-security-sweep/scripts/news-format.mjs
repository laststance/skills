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
 * Preserve a calendar month without inventing its publication day; {@link item} validates provider dates with this.
 * @returns The validated YYYY-MM value, or null for an unsupported calendar month.
 * @example calendarMonth('2026-10')
 */
function calendarMonth(value) {
  return typeof value === 'string' && /^(?:[1-9]\d{3})-(?:0[1-9]|1[0-2])$/.test(value) ? value : null;
}

/**
 * Describe the possible publication/update interval; collection and reports share this precision-aware interpretation.
 * An update takes precedence over publication. The upper boundary is exclusive; an exact timestamp spans one millisecond.
 * @returns A bounded { start, endExclusive, precision, field } interval, or null when no date is known.
 * @example newsDateRange({ publishedMonth: '2026-10', datePrecision: 'month' })
 */
export function newsDateRange(entry) {
  const field = entry.updatedAt || entry.updatedMonth ? 'updatedAt' : 'publishedAt';
  // Old continuation records used a day-one timestamp for a month; recover only the month they actually establish.
  const month = calendarMonth(entry[field === 'updatedAt' ? 'updatedMonth' : 'publishedMonth'])
    || (entry.datePrecision === 'month' ? calendarMonth(iso(entry[field])?.slice(0, 7)) : null);
  if (month) {
    const start = `${month}-01T00:00:00.000Z`, end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    return { start, endExclusive: end.toISOString(), precision: 'month', field };
  }
  const start = iso(entry[field]);
  if (!start || entry.datePrecision === 'unknown') return null;
  const day = entry.datePrecision === 'day', end = new Date(Date.parse(start) + (day ? 86400000 : 1));
  if (!Number.isFinite(end.getTime())) return null;
  return { start, endExclusive: end.toISOString(), precision: day ? 'day' : 'instant', field };
}

/**
 * Compare a known date interval with an inclusive discovery window; collection/counts and reports call this helper.
 * @returns confirmed when the whole interval is inside, possible for boundary overlap, outside for disjoint intervals, or undated.
 * @example newsWindowStatus({ publishedMonth: '2026-10' }, { since: '2026-10-04T00:00:00Z', until: '2026-11-03T00:00:00Z' })
 */
export function newsWindowStatus(entry, window) {
  const range = newsDateRange(entry), since = Date.parse(window?.since), until = Date.parse(window?.until);
  if (!range || !Number.isFinite(since) || !Number.isFinite(until) || since > until) return 'undated';
  const start = Date.parse(range.start), end = Date.parse(range.endExclusive);
  if (end <= since || start > until) return 'outside';
  return start >= since && end <= until + 1 ? 'confirmed' : 'possible';
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
    ['tvOS', /\btvos\b/i], ['watchOS', /\bwatchos\b/i], ['visionOS', /\bvisionos\b/i], ['ChromeOS', /\bchrome\s?os\b/i], ['Android', /\bandroid\b/i], ['Windows', /\bwindows\b/i],
    ['OpenSSL', /\bopenssl\b/i], ['LibreSSL', /\blibressl\b/i], ['ImageMagick', /imagemagick/i], ['Ruby', /\bruby\b/i], ['Java', /\bjava\b|\bjdk\b|openjdk/i], ['Electron', /\belectron\b/i],
    ['macOS', /\bmacos\b|mac os|マック/i], ['Safari', /\bsafari\b/i],
    ['Xcode', /\bxcode\b/i], ['Firefox', /\bfirefox\b/i], ['Thunderbird', /\bthunderbird\b/i],
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
 * Classify an article by reviewed product/platform evidence, independently of the source's maintained coverage.
 * {@link item} calls this before saving news; unknown products stay general and cannot prove a category is empty.
 * @returns Item categories plus whether the source/product evidence supports that assignment.
 * @example articleCategories({ id: 'apple' }, { title: 'tvOS 27.2' })
 */
function articleCategories(source, fields) {
  const title = plain(fields.title), categories = new Set();
  const fixed = { homebrew: 'homebrew', debian: 'linux', ubuntu: 'linux', redhat: 'linux', alpine: 'linux', php: 'php', 'php-core': 'php',
    openssl: 'tls', imagemagick: 'imagemagick', ruby: 'ruby', 'ruby-security': 'ruby', openjdk: 'java', docker: 'docker', electron: 'mac-apps', node: 'mac-apps' };
  // Cross-platform runtimes are Mac software, but an explicitly other-platform-only issue is not Mac news.
  if (['electron', 'node'].includes(source.id) && !/\bmac(?:os)?\b/i.test(`${title} ${plain(fields.summary)}`)) {
    const target = /\b(?:on|for)\s+(Windows|Linux|Android|iOS)\b|\b(Windows|Linux|Android|iOS)[ -]only\b/i.exec(`${title} ${plain(fields.summary)}`);
    if (target) return { categories: [/linux/i.test(target[0]) ? 'linux' : /ios/i.test(target[0]) ? 'ios' : 'general'], categoryStatus: 'explicit' };
  }
  if (fixed[source.id]) return { categories: [fixed[source.id]], categoryStatus: 'explicit' };
  if (source.id === 'apple' || source.kind === 'apple') {
    // The release title identifies the product; its minimum host OS is not another released product.
    if (/\bmacos\b|\b(?:mac )?os x\b/i.test(title)) categories.add('macos');
    if (/\bi(?:pad)?os\b/i.test(title)) categories.add('ios');
    if (/\b(?:safari|xcode)\b/i.test(title) && !/\b(?:windows|android|i(?:pad)?os)\b/i.test(title)) categories.add('mac-apps');
    if (/\b(?:tvos|watchos|visionos|audioos|homepod|airpods|windows)\b/i.test(title)) categories.add('general');
  } else if (source.id === 'mozilla' || source.kind === 'mozilla') {
    if (/\bi(?:pad)?os\b/i.test(title)) categories.add('ios');
    if (/\bandroid\b|\bFirefox Focus\b/i.test(title)) categories.add('general');
    if (/\b(?:Firefox(?: ESR)?|Thunderbird)\s+\d/i.test(title)) categories.add('mac-apps');
  } else if (source.id === 'chrome') {
    if (/\bi(?:pad)?os\b/i.test(title)) categories.add('ios');
    if (/\bchrome\s?os\b|\bandroid\b/i.test(title)) categories.add('general');
    // Explicit mobile/ChromeOS releases never inherit Mac references from the surrounding feed text.
    if (!categories.size && /\bdesktop\b|\bmac(?:os)?\b/i.test(`${title} ${plain(fields.summary)}`)) categories.add('mac-apps');
    if (!categories.size && /\bwindows\b|\blinux\b/i.test(title)) categories.add('general');
  } else {
    const products = Array.isArray(fields.products) ? fields.products.filter(value => typeof value === 'string').join(' ') : '';
    const names = productHints(`${title} ${products}`);
    const known = { macOS: 'macos', iOS: 'ios', Linux: 'linux', OpenSSL: 'tls', ImageMagick: 'imagemagick', PHP: 'php', Ruby: 'ruby', Java: 'java', Docker: 'docker' };
    for (const name of names) if (known[name]) categories.add(known[name]);
    if (source.advisoryType === 'malware' || fields.advisoryType === 'malware' || fields.knownExploited || source.iocDiscovery || source.id === 'opensourcemalware') categories.add('incidents');
    if (names.some(name => ['tvOS', 'watchOS', 'visionOS', 'ChromeOS', 'Android', 'Windows'].includes(name))) categories.add('general');
  }
  return { categories: categories.size ? [...categories] : ['general'], categoryStatus: categories.size ? 'explicit' : 'unconfirmed' };
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
  const updatedAt = iso(fields.updatedAt), publishedAt = iso(fields.publishedAt);
  // Normalize old month placeholders once so later reports and continuation pages cannot promote them to exact days.
  const legacyField = fields.datePrecision === 'month' ? updatedAt ? 'updatedAt' : 'publishedAt' : null;
  const publishedMonth = calendarMonth(fields.publishedMonth) || (legacyField === 'publishedAt' ? calendarMonth(publishedAt?.slice(0, 7)) : null);
  const updatedMonth = calendarMonth(fields.updatedMonth) || (legacyField === 'updatedAt' ? calendarMonth(updatedAt?.slice(0, 7)) : null);
  return {
    id: fields.id ?? createHash('sha256').update(`${source.name}:${url}:${title}`).digest('hex').slice(0, 20),
    title, url, source: source.name, sourceId: source.id || null,
    ...(['debian', 'ubuntu', 'redhat', 'alpine'].includes(source.id) ? { distribution: source.id } : {}), publishedAt: iso(fields.publishedAt),
    updatedAt: iso(fields.updatedAt), products: productHints(`${title} ${summary}`),
    affected: [], fixed: [], iocs: [], summary, needsReview: true,
    ...fields, title, url, summary,
    publishedAt: publishedMonth ? null : publishedAt, updatedAt: updatedMonth ? null : updatedAt,
    publishedMonth: publishedMonth || undefined, updatedMonth: updatedMonth || undefined,
    ...articleCategories(source, { ...fields, title, summary }),
  };
}
