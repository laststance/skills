#!/usr/bin/env node
/**
 * Scan wiki HTML for path:start-end cites. Fail missing files, OOB ranges,
 * illegal first lines, mermaid figures without an immediate Sources sibling,
 * and mermaid node tokens that never appear in that figure’s cited span text.
 *
 * Usage: node verify-cites.mjs <wiki-dir> <repo-root>
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, extname } from 'node:path'

const [wikiDir, repoRoot] = process.argv.slice(2)
if (!wikiDir || !repoRoot) {
  console.error('usage: node verify-cites.mjs <wiki-dir> <repo-root>')
  process.exit(2)
}

const CITE_RE = /([A-Za-z0-9_./@+[\]-]+\.[A-Za-z0-9]+):(\d+)(?:-(\d+))?/g
const SKIP_PREFIX = /^(https?:|mailto:)/
const STOP = new Set([
  'from',
  'to',
  'the',
  'a',
  'an',
  'and',
  'or',
  'of',
  'on',
  'in',
  'with',
  'via',
  'then',
  'plus',
  'for',
  'as',
  'by',
  'at',
  'is',
  'are',
  'tb',
  'lr',
  'flowchart',
  'subgraph',
  'end',
])

const ILLEGAL_FIRST = [
  /^\s*\/\*\*/,
  /^\s*\*\s/,
  /^['"]use server['"]/,
  /^type Props\b/,
  /^const schema\b/,
  /^\/\//,
  /^\{\/\*/,
  /^import(\s+type)?\s/,
  /^try\s*\{/,
  /^return\s*\(/,
  /^return\s*\{/,
  /^(async\s+)?\([^)]*\)\s*=>/,
  /^const\s+\w+\s*=\s*use(Callback|Memo|Effect)\b/,
  /^useEffectOn(Mount|Any|Update)\s*\(/,
  /^(export\s+)?const\s*\{/,
  /^"[^"]+"\s*:/,
  /^(manifest|FILE_DOWNLOAD|ASSEMBLY_TREE_LAYOUT|column)\s*:/,
]

function walkHtml(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walkHtml(p, acc)
    else if (extname(p) === '.html') acc.push(p)
  }
  return acc
}

function readSpan(rel, start, end) {
  const abs = join(repoRoot, rel)
  if (!existsSync(abs)) return { ok: false, reason: 'MISSING' }
  const lines = readFileSync(abs, 'utf8').split('\n')
  if (start < 1 || end > lines.length || start > end) {
    return { ok: false, reason: 'OOB', lineCount: lines.length }
  }
  return {
    ok: true,
    first: lines[start - 1] ?? '',
    text: lines.slice(start - 1, end).join('\n'),
    lineCount: lines.length,
  }
}

function isIllegalFirst(firstLine) {
  const trimmed = firstLine.trimStart()
  return ILLEGAL_FIRST.some((re) => re.test(trimmed))
}

/** Top-level `const` / `function` name on a line (`export` optional). */
function declarationName(line) {
  const m = line
    .trimStart()
    .match(/^(export\s+)?(async\s+)?(function|const|let|var)\s+(\w+)/)
  return m ? m[4] : undefined
}

/** Identifier must be a whole token. `FAILED` is not in `JOB_FAILED`; `occupiedY` is not in `occupiedYByLevel`. */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

function spanHasToken(text, token) {
  const code = stripComments(text)
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^A-Za-z0-9_])${escaped}([^A-Za-z0-9_]|$)`).test(code)
}

/** True when `token` is not only `Receiver.token` (`.` before the name). */
function spanHasBareToken(text, token) {
  const code = stripComments(text)
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^A-Za-z0-9_.])${escaped}([^A-Za-z0-9_]|$)`).test(code)
}

function isCamelCaseCallee(token) {
  return /^[a-z][a-zA-Z]*[A-Z][A-Za-z0-9]*$/.test(token)
}

/** Unindented declarations in a span (siblings, not inner `const`). */
function topLevelDeclarationNames(spanText) {
  const names = []
  for (const line of spanText.split('\n')) {
    if (/^\s/.test(line)) continue
    const name = declarationName(line)
    if (name) names.push(name)
  }
  return names
}

/** Indented `const` / `function` names inside an enclosing export. */
function innerDeclarationNames(spanText) {
  const names = []
  for (const line of spanText.split('\n')) {
    if (!/^\s/.test(line)) continue
    const name = declarationName(line)
    if (name) names.push(name)
  }
  return names
}

function tokenizeLabel(label) {
  return label
    .replace(/\\n/g, ' ')
    .split(/\s+/)
    .flatMap((part) => (part === '/' ? [] : [part]))
    .map((t) => t.replace(/^["'`]+|["'`]+$/g, '').trim())
    .filter((t) => t.length > 1 && !STOP.has(t.toLowerCase()))
}

function extractCites(block) {
  const cites = []
  for (const m of block.matchAll(CITE_RE)) {
    const rel = m[1]
    if (SKIP_PREFIX.test(rel) || rel.includes('://')) continue
    if (!rel.includes('/') && !rel.includes('.')) continue
    const start = Number(m[2])
    const end = m[3] ? Number(m[3]) : start
    cites.push({ rel, start, end })
  }
  return cites
}

const MUST_DEFINE_ON_EXPORT = [
  'createClient',
  'toPublicBoardSlug',
  'useStorageHydrated',
  'requireClaims',
  'createFirstBoardIfNeeded',
  'setGitHubTokenCookie',
  'getPublicBoardBySlug',
]

const SENTENCE_SKIP = new Set([
  ...STOP,
  'undefined',
  'null',
  'true',
  'false',
])

/** Named tokens in a claim chunk: code (not cite), backticks, 401/403, 5+ digit literals. */
function extractClaimTokens(chunkHtml) {
  const tokens = new Set()
  const withoutCites = chunkHtml.replace(/<code class="cite">[\s\S]*?<\/code>/g, '')
  for (const m of withoutCites.matchAll(/<code\b[^>]*>([^<]+)<\/code>/g)) {
    const t = m[1].trim()
    if (t.length >= 1 && !SENTENCE_SKIP.has(t.toLowerCase())) {
      if (t.startsWith('/') && !t.includes('.') && !t.includes(':')) tokens.add(t)
      else if (!t.includes('/')) tokens.add(t)
    }
  }
  const text = withoutCites.replace(/<[^>]+>/g, ' ')
  for (const m of text.matchAll(/`([^`]+)`/g)) {
    const t = m[1].trim()
    if (t.length >= 1 && !SENTENCE_SKIP.has(t.toLowerCase())) {
      if (t.startsWith('/') && !t.includes('.') && !t.includes(':')) tokens.add(t)
      else if (!t.includes('/')) tokens.add(t)
    }
  }
  for (const m of text.matchAll(/\b(401|403)\b/g)) tokens.add(m[1])
  for (const m of text.matchAll(/\b(GET|POST|PUT|PATCH|DELETE)\b/g)) tokens.add(m[1])
  for (const m of text.matchAll(/\b([45]xx)\b/gi)) tokens.add(m[1])
  for (const m of text.matchAll(/(?<![\d_])(\d{5,})(?![\d_])/g)) tokens.add(m[1])
  for (const m of text.matchAll(/\b(NEXT_PUBLIC_[A-Z0-9_]+)\b/g)) tokens.add(m[1])
  for (const m of text.matchAll(/\b([a-z][a-zA-Z]*[A-Z][a-zA-Z]*)\b/g)) {
    const idx = m.index ?? 0
    // `UTIF.decodeImage` must not also enqueue bare `decodeImage`
    if (idx > 0 && text[idx - 1] === '.') continue
    tokens.add(m[1])
  }
  return tokens
}

/** Identifiers in an Overview Key-code-entities cell (not paths / cites). */
function extractEntityCellTokens(cellHtml) {
  const tokens = new Set()
  for (const m of cellHtml.matchAll(/<code\b[^>]*>([^<]+)<\/code>/g)) {
    const t = m[1].trim()
    if (t.length >= 3 && !t.includes('/') && !t.includes(':')) tokens.add(t)
  }
  const text = cellHtml.replace(/<[^>]+>/g, ' ')
  for (const m of text.matchAll(/\b([A-Z][A-Z0-9_]{3,})\b/g)) tokens.add(m[1])
  for (const m of text.matchAll(/\b([A-Za-z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*)\b/g)) {
    tokens.add(m[1])
  }
  return tokens
}

function extractMermaidLabels(src) {
  const labels = []
  const quoted = /\[(["'])([^"']+)\1\]/g
  for (const m of src.matchAll(quoted)) labels.push(m[2])
  const bare = /\[([^\]"'\n]+)\]/g
  for (const m of src.matchAll(bare)) {
    if (!m[1].includes('(') && !m[1].includes('{')) labels.push(m[1])
  }
  return labels
}

const files = walkHtml(wikiDir)
let issues = 0
const seen = new Set()

for (const htmlPath of files) {
  const html = readFileSync(htmlPath, 'utf8')
  if (/<code class="cite">\s*undefined\s*<\/code>/.test(html) || /class="cite">[^<]*undefined/.test(html)) {
    console.log(`CITE_UNDEFINED\tfrom ${htmlPath}`)
    issues++
  }

  for (const m of html.matchAll(CITE_RE)) {
    const rel = m[1]
    if (SKIP_PREFIX.test(rel) || rel.includes('://')) continue
    if (!rel.includes('/') && !rel.includes('.')) continue
    const start = Number(m[2])
    const end = m[3] ? Number(m[3]) : start
    const key = `${htmlPath}::${rel}:${start}-${end}`
    if (seen.has(key)) continue
    seen.add(key)

    const span = readSpan(rel, start, end)
    if (!span.ok && span.reason === 'MISSING') {
      console.log(`MISSING\t${rel}:${start}-${end}\tfrom ${htmlPath}`)
      issues++
      continue
    }
    if (!span.ok && span.reason === 'OOB') {
      console.log(
        `OOB\t${rel}:${start}-${end} (file ${span.lineCount} lines)\tfrom ${htmlPath}`,
      )
      issues++
      continue
    }
    if (isIllegalFirst(span.first)) {
      console.log(
        `ILLEGAL_FIRST\t${rel}:${start}-${end}\t${span.first.trim()}\tfrom ${htmlPath}`,
      )
      issues++
    }
    if (start === 1 && end <= 25) {
      const snippet = span.text.replace(/\s+/g, ' ').slice(0, 120)
      console.log(`HEADER?\t${rel}:${start}-${end}\t${snippet}\tfrom ${htmlPath}`)
    }
  }

  const figureRe =
    /<figure\b[^>]*>[\s\S]*?<pre class="mermaid">([\s\S]*?)<\/pre>[\s\S]*?<\/figure>(\s*)([\s\S]{0,4000})/g
  for (const fm of html.matchAll(figureRe)) {
    const mermaid = fm[1]
    const after = fm[3] ?? ''
    const sourcesMatch = after.match(/^\s*<p class="sources">[\s\S]*?<\/p>/)
    if (!sourcesMatch) {
      console.log(`FIGURE_NO_SOURCES\tfrom ${htmlPath}`)
      issues++
      continue
    }
    const figureTokens = new Set()
    for (const label of extractMermaidLabels(mermaid)) {
      for (const token of tokenizeLabel(label)) figureTokens.add(token)
    }
    const cites = extractCites(sourcesMatch[0])
    const union = cites
      .map((c) => {
        const span = readSpan(c.rel, c.start, c.end)
        return span.ok ? span.text : ''
      })
      .join('\n')
    for (const token of figureTokens) {
      if (!spanHasToken(union, token)) {
        console.log(
          `MERMAID_TOKEN_MISSING\t${token}\tfrom ${htmlPath}`,
        )
        issues++
      }
      if (!MUST_DEFINE_ON_EXPORT.includes(token)) continue
      const hasDef = cites.some((c) => {
        const defSpan = readSpan(c.rel, c.start, c.end)
        return defSpan.ok && declarationName(defSpan.first) === token
      })
      if (!hasDef) {
        console.log(`MERMAID_FACTORY_CALLER\t${token}\tfrom ${htmlPath}`)
        issues++
      }
    }
    for (const c of cites) {
      const span = readSpan(c.rel, c.start, c.end)
      if (!span.ok || figureTokens.size === 0) continue
      const first = span.first.trimStart()
      if (
        /^(async\s+)?function\s+(getLimiter|buildForwardedQuery|consumeCaptureQuota)\b/.test(
          first,
        ) ||
        /^const\s+(getLimiter|buildForwardedQuery|consumeCaptureQuota)\b/.test(
          first,
        )
      ) {
        console.log(
          `MERMAID_HELPER_FIRST\t${c.rel}:${c.start}-${c.end}\t${first}\tfrom ${htmlPath}`,
        )
        issues++
      }
      const hit = [...figureTokens].some((t) => spanHasToken(span.text, t))
      if (!hit) {
        console.log(
          `MERMAID_EXTRA_ZERO_TOKEN\t${c.rel}:${c.start}-${c.end}\tfrom ${htmlPath}`,
        )
        issues++
      }
    }
  }

  const claimHtml = html
    .replace(/<nav\b[\s\S]*?<\/nav>/g, '')
    .replace(/<ul class="file-chips">[\s\S]*?<\/ul>/g, '')
    .replace(/<ul class="child-links">[\s\S]*?<\/ul>/g, '')
    .replace(/<pre class="mermaid">[\s\S]*?<\/pre>/g, '')
  for (const bm of claimHtml.matchAll(
    /<(p|li|dd|dt|tr)\b([^>]*)>([\s\S]*?)<\/\1>/gi,
  )) {
    const attrs = bm[2] ?? ''
    if (/class="[^"]*\bsources\b/.test(attrs)) continue
    const inner = bm[3]
    const citeRe = /<code class="cite">([^<]+)<\/code>/g
    const pieces = []
    let last = 0
    let cm
    while ((cm = citeRe.exec(inner))) {
      pieces.push({ before: inner.slice(last, cm.index), citeStr: cm[1] })
      last = cm.index + cm[0].length
    }
    if (pieces.length === 0) continue
    const afterLast = inner.slice(last)
    for (let i = 0; i < pieces.length; i++) {
      const chunk = pieces[i].before + (i === pieces.length - 1 ? afterLast : '')
      const parsed = [...pieces[i].citeStr.matchAll(CITE_RE)][0]
      if (!parsed) continue
      const rel = parsed[1]
      if (SKIP_PREFIX.test(rel) || rel.includes('://')) continue
      const start = Number(parsed[2])
      const end = parsed[3] ? Number(parsed[3]) : start
      const span = readSpan(rel, start, end)
      if (!span.ok) continue
      const tokens = new Set(extractClaimTokens(chunk))
      if (bm[1].toLowerCase() === 'dd') {
        const before = claimHtml.slice(0, bm.index)
        const dtm = /<dt\b[^>]*>([\s\S]*?)<\/dt>\s*$/.exec(before)
        if (dtm) {
          for (const t of extractClaimTokens(dtm[1])) tokens.add(t)
        }
      }
      for (const token of tokens) {
        if (!spanHasToken(span.text, token)) {
          console.log(
            `SENTENCE_TOKEN_MISSING\t${token}\t${rel}:${start}-${end}\tfrom ${htmlPath}`,
          )
          issues++
          continue
        }
        // separately written `decodeImage` is not licensed by `UTIF.decodeImage`
        if (isCamelCaseCallee(token) && !spanHasBareToken(span.text, token)) {
          console.log(
            `DOTTED_CALLEE\t${token}\t${rel}:${start}-${end}\tfrom ${htmlPath}`,
          )
          issues++
        }
        if (
          /^[A-Za-z][\w]*\.[A-Za-z][\w]*$/.test(token) &&
          !spanHasToken(span.first, token)
        ) {
          console.log(
            `CALL_ON_ENCLOSING\t${token}\t${rel}:${start}-${end}\tfrom ${htmlPath}`,
          )
          issues++
        }
      }
      const firstDecl = declarationName(span.first)
      if (firstDecl) {
        const siblings = topLevelDeclarationNames(span.text).filter(
          (n) => n !== firstDecl,
        )
        for (const token of tokens) {
          if (siblings.includes(token)) {
            console.log(
              `SIBLING_FIRST\t${token}\ton ${firstDecl}\t${rel}:${start}-${end}\tfrom ${htmlPath}`,
            )
            issues++
          }
        }
        const inners = innerDeclarationNames(span.text)
        for (const token of tokens) {
          if (inners.includes(token) && token !== firstDecl) {
            console.log(
              `INNER_SUBJECT\t${token}\ton ${firstDecl}\t${rel}:${start}-${end}\tfrom ${htmlPath}`,
            )
            issues++
          }
        }
        if (
          /createSlice\s*\(/.test(span.first) ||
          /Slice\b/.test(firstDecl ?? '') ||
          /=\s*\{/.test(span.first)
        ) {
          for (const token of tokens) {
            if (token === firstDecl) continue
            const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            const keyRe = new RegExp(`(^|\\n)\\s*${escaped}\\s*:`)
            if (keyRe.test(span.text)) {
              const kind = /createSlice\s*\(|Slice\b/.test(
                `${span.first}${firstDecl ?? ''}`,
              )
                ? 'SLICE_PROPERTY'
                : 'OBJECT_KEY'
              console.log(
                `${kind}\t${token}\ton ${firstDecl}\t${rel}:${start}-${end}\tfrom ${htmlPath}`,
              )
              issues++
            }
          }
        }
      }
      for (const token of tokens) {
        if (!MUST_DEFINE_ON_EXPORT.includes(token)) continue
        if (declarationName(span.first) !== token) {
          console.log(
            `FACTORY_ON_CALLER\t${token}\t${rel}:${start}-${end}\tfrom ${htmlPath}`,
          )
          issues++
        }
      }
    }
  }

  for (const chipUl of html.matchAll(/<ul class="file-chips">([\s\S]*?)<\/ul>/g)) {
    const withoutChips = html
      .replace(chipUl[0], '')
      .replace(/<ul class="child-links">[\s\S]*?<\/ul>/g, '')
    for (const cm of chipUl[1].matchAll(/<code>([^<]+)<\/code>/g)) {
      const chipPath = cm[1].trim()
      const stem = chipPath.split('/').pop()?.replace(/\.[^.]+$/, '') ?? ''
      const distinctive = stem.length > 8 && /[A-Z]/.test(stem)
      const licensed =
        withoutChips.includes(chipPath) || (distinctive && withoutChips.includes(stem))
      if (!licensed) {
        console.log(`UNUSED_CHIP\t${chipPath}\tfrom ${htmlPath}`)
        issues++
      }
    }
  }
}

const indexPath = join(wikiDir, 'index.html')
if (existsSync(indexPath)) {
  const indexHtml = readFileSync(indexPath, 'utf8')
  const tables = [...indexHtml.matchAll(/<table\b[\s\S]*?<\/table>/g)]
  let hasEntityTable = false
  for (const tm of tables) {
    const headers = [...tm[0].matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map(
      (h) => h[1].replace(/<[^>]+>/g, '').trim(),
    )
    const dataRows = [
      ...tm[0].matchAll(/<tr\b[\s\S]*?<\/tr>/g),
    ].filter((tr) => /<td\b/i.test(tr[0])).length
    const hasSub = headers.some((h) => /Subsystem|サブシステム/.test(h))
    const hasRole = headers.some((h) => /Role|役割/.test(h))
    const hasEnt = headers.some((h) => /Key code entities|主要な記号/.test(h))
    if (hasSub && hasRole && hasEnt && dataRows >= 12) {
      hasEntityTable = true
      const after = indexHtml.slice((tm.index ?? 0) + tm[0].length)
      if (/^\s*<p class="sources">/.test(after)) {
        console.log('OVERVIEW_TABLE_SOURCES_DUMP\tfrom index.html')
        issues++
      }
      const entIdx = headers.findIndex((h) =>
        /Key code entities|主要な記号/.test(h),
      )
      const pageWithoutTable = indexHtml
        .replace(tm[0], ' ')
        .replace(/<nav\b[\s\S]*?<\/nav>/g, ' ')
        .replace(/<ul class="file-chips">[\s\S]*?<\/ul>/g, ' ')
        .replace(/<code class="cite">[\s\S]*?<\/code>/g, ' ')
      for (const tr of [...tm[0].matchAll(/<tr\b[\s\S]*?<\/tr>/g)]) {
        const tds = [...tr[0].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)]
        if (tds.length === 0 || entIdx < 0) continue
        const cell = tds[entIdx]?.[1] ?? ''
        for (const token of extractEntityCellTokens(cell)) {
          if (!spanHasToken(pageWithoutTable, token)) {
            console.log(`OVERVIEW_ENTITY_ORPHAN\t${token}\tfrom index.html`)
            issues++
          }
        }
      }
    }
  }
  if (!hasEntityTable) {
    console.log('OVERVIEW_NO_ENTITY_TABLE\tfrom index.html')
    issues++
  }
}

const glossaryPath = join(wikiDir, 'pages/glossary.html')
if (existsSync(glossaryPath)) {
  const glossaryHtml = readFileSync(glossaryPath, 'utf8')
  if (!/<dl\b/i.test(glossaryHtml) || !/<dd\b/i.test(glossaryHtml)) {
    console.log('GLOSSARY_NO_DL\tfrom pages/glossary.html')
    issues++
  }
  const dtCount = [...glossaryHtml.matchAll(/<dt\b/gi)].length
  if (dtCount < 8) {
    console.log(`GLOSSARY_THIN_DL\t${dtCount} dt\tfrom pages/glossary.html`)
    issues++
  }
  if (/<dt\b[^>]*>[\s\S]*記号[\s\S]*?<\/dt>/.test(glossaryHtml)) {
    console.log('GLOSSARY_STUB_DT\tfrom pages/glossary.html')
    issues++
  }
  const dlInner = glossaryHtml.match(/<dl\b[^>]*>([\s\S]*?)<\/dl>/i)
  if (dlInner) {
    const tags = [...dlInner[1].matchAll(/<(dt|dd)\b/gi)].map((m) =>
      m[1].toLowerCase(),
    )
    let unpaired = tags.length < 16 || tags.length % 2 !== 0
    if (!unpaired) {
      for (let i = 0; i < tags.length; i += 2) {
        if (tags[i] !== 'dt' || tags[i + 1] !== 'dd') {
          unpaired = true
          break
        }
      }
    }
    if (unpaired) {
      console.log('GLOSSARY_UNPAIRED\tfrom pages/glossary.html')
      issues++
    }
  }
  const withoutDl = glossaryHtml.replace(/<dl\b[\s\S]*?<\/dl>/gi, '')
  const withoutNav = withoutDl.replace(/<nav\b[\s\S]*?<\/nav>/g, '')
  for (const pm of withoutNav.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)) {
    if (/class="[^"]*\b(sources|lede)\b/.test(pm[1] ?? '')) continue
    if (/<code class="cite">/.test(pm[2])) {
      console.log('GLOSSARY_P_CITE\tfrom pages/glossary.html')
      issues++
    }
  }
}

console.log(issues === 0 ? 'CITE_FILES_OK' : `CITE_ISSUES ${issues}`)
process.exit(issues === 0 ? 0 : 1)
