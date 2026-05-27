// One-shot exporter: decrypt ALL Google Chrome (macOS) cookies and emit a
// Playwright storageState JSON + a run-code loader. Exists so playwright-cli can
// inherit every logged-in session from the user's real Chrome. Run manually.
// Usage: node export-chrome-cookies.mjs [ChromeProfileName]   (default: Default)
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const HOME = os.homedir()
const CHROME_DIR = path.join(HOME, 'Library/Application Support/Google/Chrome')
const PROFILE = process.argv[2] || 'Default'
const COOKIE_DB = path.join(CHROME_DIR, PROFILE, 'Cookies')
const OUT_JSON = '/tmp/chrome-pw-cookies.json'
const OUT_LOADER = '/tmp/chrome-load-cookies.js'

// macOS Chrome cookie crypto constants (AES-128-CBC, key from Keychain via PBKDF2).
const SALT = 'saltysalt'
const ITERATIONS = 1003
const KEYLEN = 16
const IV = Buffer.alloc(16, 0x20) // 16 spaces

// 1) Keychain password — triggers a GUI "allow" dialog on first access.
function getKeychainPassword() {
  const out = execFileSync('security', [
    'find-generic-password',
    '-w',
    '-s',
    'Chrome Safe Storage',
    '-a',
    'Chrome',
  ])
  return out.toString().trim()
}

// 2) Copy the DB (+ WAL/SHM) so we read a consistent snapshot while Chrome runs.
function snapshotDb() {
  const tmp = path.join(os.tmpdir(), 'chrome-cookies-snapshot.db')
  for (const suffix of ['', '-wal', '-shm']) {
    const src = COOKIE_DB + suffix
    if (fs.existsSync(src)) fs.copyFileSync(src, tmp + suffix)
  }
  return tmp
}

// 3) Dump every cookie row as JSON via the system sqlite3 CLI.
function readRows(dbPath) {
  const sql =
    'SELECT host_key, name, path, value, hex(encrypted_value) AS ev, ' +
    'expires_utc, is_secure, is_httponly, samesite FROM cookies;'
  const out = execFileSync('/usr/bin/sqlite3', ['-json', dbPath, sql], {
    maxBuffer: 256 * 1024 * 1024,
  })
  const text = out.toString().trim()
  return text ? JSON.parse(text) : []
}

// PKCS7 unpad without throwing on a malformed tail.
function pkcs7Unpad(buf) {
  if (buf.length === 0) return buf
  const pad = buf[buf.length - 1]
  if (pad < 1 || pad > 16 || pad > buf.length) return buf
  for (let i = buf.length - pad; i < buf.length; i++) {
    if (buf[i] !== pad) return buf
  }
  return buf.subarray(0, buf.length - pad)
}

let prefixStripped = 0
let prefixKept = 0

// Strip the 32-byte SHA256(domain) prefix newer Chrome prepends to plaintext.
// Detect deterministically: only strip when the prefix matches sha256(host_key)
// (with or without a leading dot). Older cookies without the prefix are kept.
function stripDomainPrefix(plain, hostKey) {
  if (plain.length < 32) return plain
  const head = plain.subarray(0, 32)
  const bare = hostKey.replace(/^\./, '')
  const h1 = crypto.createHash('sha256').update(hostKey).digest()
  const h2 = crypto.createHash('sha256').update(bare).digest()
  if (head.equals(h1) || head.equals(h2)) {
    prefixStripped++
    return plain.subarray(32)
  }
  prefixKept++
  return plain
}

function decryptValue(evHex, hostKey, plaintextCol) {
  if (!evHex) return plaintextCol || '' // unencrypted row → plaintext column
  const enc = Buffer.from(evHex, 'hex')
  const version = enc.subarray(0, 3).toString('latin1')
  if (version !== 'v10') {
    // Not the expected macOS scheme; fall back to the plaintext column.
    return plaintextCol || ''
  }
  const ciphertext = enc.subarray(3)
  const decipher = crypto.createDecipheriv('aes-128-cbc', KEY, IV)
  decipher.setAutoPadding(false)
  let plain = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  plain = pkcs7Unpad(plain)
  plain = stripDomainPrefix(plain, hostKey)
  return plain.toString('utf8')
}

// Chrome epoch (1601-01-01) microseconds → Unix seconds. 0 = session cookie.
function toExpires(expiresUtc) {
  if (!expiresUtc || expiresUtc === 0) return -1
  return Math.floor(expiresUtc / 1_000_000 - 11644473600)
}

// Chrome samesite int → Playwright value. -1 unspecified, 0 None, 1 Lax, 2 Strict.
// 'None' requires secure; omit sameSite when that contract can't be met.
function toSameSite(samesite, secure) {
  if (samesite === 1) return 'Lax'
  if (samesite === 2) return 'Strict'
  if (samesite === 0 && secure) return 'None'
  return undefined
}

const password = getKeychainPassword()
const KEY = crypto.pbkdf2Sync(password, SALT, ITERATIONS, KEYLEN, 'sha1')
const dbPath = snapshotDb()
const rows = readRows(dbPath)

const cookies = []
let skipped = 0
let decryptErrors = 0
for (const r of rows) {
  // Drop rows Playwright would reject outright.
  if (!r.host_key || !r.name) {
    skipped++
    continue
  }
  let value
  try {
    value = decryptValue(r.ev, r.host_key, r.value)
  } catch {
    decryptErrors++
    continue
  }
  const secure = r.is_secure === 1
  const cookie = {
    name: r.name,
    value,
    domain: r.host_key,
    path: r.path || '/',
    expires: toExpires(r.expires_utc),
    httpOnly: r.is_httponly === 1,
    secure,
  }
  const sameSite = toSameSite(r.samesite, secure)
  if (sameSite) cookie.sameSite = sameSite
  cookies.push(cookie)
}

// storageState file (kept for inspection; the loader below is the path that works).
fs.writeFileSync(OUT_JSON, JSON.stringify({ cookies, origins: [] }, null, 2), {
  mode: 0o600,
})

// run-code loader: single arrow-function expression, cookies inlined, per-cookie
// try/catch so one bad row can't abort the whole batch.
const loader =
  'async page => {\n' +
  '  const cookies = ' +
  JSON.stringify(cookies) +
  ';\n' +
  '  let ok = 0; let fail = 0; const errs = [];\n' +
  '  for (const c of cookies) {\n' +
  '    try { await page.context().addCookies([c]); ok++; }\n' +
  '    catch (e) { fail++; if (errs.length < 5) errs.push(c.domain + " " + c.name + ": " + e.message); }\n' +
  '  }\n' +
  '  return { ok, fail, total: cookies.length, sampleErrors: errs };\n' +
  '}\n'
fs.writeFileSync(OUT_LOADER, loader, { mode: 0o600 })

// Clean up the DB snapshot (still contains encrypted blobs).
for (const suffix of ['', '-wal', '-shm']) {
  try {
    fs.unlinkSync(dbPath + suffix)
  } catch {}
}

console.log(
  JSON.stringify(
    {
      profile: PROFILE,
      rows: rows.length,
      exported: cookies.length,
      skipped,
      decryptErrors,
      prefixStripped,
      prefixKept,
      outJson: OUT_JSON,
      outLoader: OUT_LOADER,
    },
    null,
    2,
  ),
)
