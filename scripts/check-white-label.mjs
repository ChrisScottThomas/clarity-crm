#!/usr/bin/env node
// White-label integrity guard (runs in CI on every PR).
//
// Clarity is a fork-and-rebrand product, so its *shipped* surface must never
// carry real attribution — a real person's email, a real client company, real
// PII. This script fails the build when that leaks in. It deliberately does NOT
// police design docs or test fixtures, which legitimately use fictional
// personas (Dana @ Acme, Globex, Northwind, the reserved `.example` TLD).
//
// Three checks:
//   1. Emails in shipped code/config must use a reserved/example domain.
//   2. No secrets-y or data files may be committed (DB, .env, generated client).
//   3. (Dormant) If WHITE_LABEL_DENYLIST is set, forbidden names/domains fail.
//      The real names live only in that Actions secret, never in the tree.
//
// Secret/key detection (API keys, tokens) is handled separately by gitleaks.

import { execFileSync } from 'node:child_process'
import { readFileSync as read } from 'node:fs'
import { extname } from 'node:path'

// --- Scope -----------------------------------------------------------------

// Only these parts of the tree are "shipped surface" we hold to the email rule.
const SHIPPED_PREFIXES = ['lib/', 'app/', 'components/', 'prisma/']
const SHIPPED_ROOT_FILES = new Set([
  'clarity.config.ts', 'instrumentation.ts', 'proxy.ts', 'middleware.ts',
  'next.config.ts', 'README.md', '.env.example',
])
// Never scanned for the email rule: fixtures and design docs use fake personas.
const EMAIL_SCAN_EXCLUDE_PREFIXES = ['docs/', 'tests/', 'node_modules/', 'app/generated/', '.github/', 'scripts/']

const TEXT_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.mdx',
  '.prisma', '.css', '.html', '.yml', '.yaml', '.txt', '.example',
])

// --- Email allowlist -------------------------------------------------------

const ALLOWED_EMAIL_DOMAINS = new Set([
  'example.com', 'example.org', 'example.net', 'example.edu',
  'acme.com', // the canonical fictional company used across our mock fixtures
  'localhost',
])
const ALLOWED_EMAIL_SUFFIXES = ['.example', '.test', '.invalid', '.localhost']
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,}|localhost)\b/g

function emailAllowed(domain) {
  const d = domain.toLowerCase()
  if (ALLOWED_EMAIL_DOMAINS.has(d)) return true
  return ALLOWED_EMAIL_SUFFIXES.some((s) => d.endsWith(s))
}

// --- Forbidden committed files --------------------------------------------

const SENSITIVE_FILE_RE = [
  /\.db$/, /\.sqlite\d?$/,
  /(^|\/)\.env$/, /(^|\/)\.env\.local$/, /(^|\/)\.env\..+\.local$/, /(^|\/)\.env\.production$/,
  /^data\//, /^app\/generated\//,
]

// --- Run -------------------------------------------------------------------

const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n').map((l) => l.trim()).filter(Boolean)

/** @type {{file: string, line: number, message: string}[]} */
const violations = []

// Check 2: forbidden committed files (unambiguous, highest signal).
for (const file of tracked) {
  if (SENSITIVE_FILE_RE.some((re) => re.test(file))) {
    violations.push({ file, line: 0, message: 'sensitive file must not be committed (DB / .env / generated client are gitignored)' })
  }
}

const isShipped = (f) =>
  !EMAIL_SCAN_EXCLUDE_PREFIXES.some((p) => f.startsWith(p)) &&
  (SHIPPED_ROOT_FILES.has(f) || SHIPPED_PREFIXES.some((p) => f.startsWith(p)))

const denylist = (process.env.WHITE_LABEL_DENYLIST ?? '')
  .split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)

for (const file of tracked) {
  if (!TEXT_EXT.has(extname(file))) continue
  let content
  try { content = read(file, 'utf8') } catch { continue }
  const lines = content.split('\n')

  lines.forEach((line, i) => {
    // Check 1: emails in shipped surface must use a reserved/example domain.
    if (isShipped(file)) {
      for (const m of line.matchAll(EMAIL_RE)) {
        const domain = m[1]
        if (!emailAllowed(domain)) {
          violations.push({ file, line: i + 1, message: `non-placeholder email "${m[0]}" in shipped code — use an @example.com / *.example address` })
        }
      }
    }
    // Check 3: dormant denylist (real names/domains supplied via Actions secret).
    for (const term of denylist) {
      if (line.toLowerCase().includes(term)) {
        violations.push({ file, line: i + 1, message: `denylisted term found (WHITE_LABEL_DENYLIST)` })
      }
    }
  })
}

if (denylist.length === 0) {
  console.log('ℹ  WHITE_LABEL_DENYLIST not set — skipping the real-name denylist check (email allowlist + gitleaks still enforced).')
}

if (violations.length > 0) {
  console.error(`\n✖ White-label integrity check failed (${violations.length} issue${violations.length > 1 ? 's' : ''}):\n`)
  for (const v of violations) {
    console.error(`  ${v.file}${v.line ? `:${v.line}` : ''} — ${v.message}`)
  }
  console.error('')
  process.exit(1)
}

console.log('✔ White-label integrity check passed.')
