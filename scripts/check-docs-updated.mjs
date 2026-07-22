#!/usr/bin/env node
// Docs-updated guard (runs in CI on every PR, report-only).
//
// Standing rule: documentation is updated with every PR. This check surfaces
// PRs that change product code but touch no documentation, so the author is
// nudged to update README/docs (or state why none is needed). It is
// deliberately REPORT-ONLY today — it prints a ::warning:: annotation but exits
// 0, exactly like the ESLint job — so a RED check always means a real, blocking
// failure. Set DOCS_CHECK_STRICT=1 to make a missing-docs result exit non-zero
// once the convention has bedded in.
//
// The rule is intentionally coarse: "did product code move without any docs
// moving?" A false nudge is cheap (add a doc line, or note N/A in the PR); a
// missed nudge is the whole point of the rule. The PR template carries the
// human-facing checklist; this is the automated backstop.

import { execFileSync } from 'node:child_process'

// --- Classification --------------------------------------------------------

// Product/behaviour surface: a change here is expected to come with docs.
const CODE_PREFIXES = ['app/', 'components/', 'lib/', 'prisma/', 'styles/']
const CODE_ROOT_FILES = new Set([
  'clarity.config.ts', 'proxy.ts', 'instrumentation.ts',
  'next.config.ts', 'middleware.ts',
])

// Docs surface: anything under docs/, or any markdown file anywhere (README.md,
// CONTEXT.md, AGENTS.md, docs/**). A change to any of these satisfies the rule.
const isDoc = (f) => f.startsWith('docs/') || f.toLowerCase().endsWith('.md')

// Everything else (tests/, .github/, package manifests, config dotfiles) is
// neutral: it neither demands docs nor satisfies the requirement.
const isCode = (f) =>
  CODE_ROOT_FILES.has(f) || CODE_PREFIXES.some((p) => f.startsWith(p))

/**
 * @param {string[]} changedFiles
 * @returns {{ codeFiles: string[], docsFiles: string[], needsDocs: boolean }}
 */
export function classifyDocsUpdate(changedFiles) {
  const codeFiles = changedFiles.filter(isCode)
  const docsFiles = changedFiles.filter(isDoc)
  return { codeFiles, docsFiles, needsDocs: codeFiles.length > 0 && docsFiles.length === 0 }
}

// --- CLI -------------------------------------------------------------------

function changedFilesFromGit(base) {
  // Three-dot: files changed on HEAD since it diverged from base.
  const out = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { encoding: 'utf8' })
  return out.split('\n').map((l) => l.trim()).filter(Boolean)
}

function main() {
  const base = process.env.DOCS_CHECK_BASE ?? 'origin/main'
  const strict = process.env.DOCS_CHECK_STRICT === '1'

  let changed
  try {
    changed = changedFilesFromGit(base)
  } catch (err) {
    console.log(`ℹ  docs-updated check skipped — could not diff against "${base}" (${err.message.split('\n')[0]}).`)
    return
  }

  const { codeFiles, docsFiles, needsDocs } = classifyDocsUpdate(changed)

  if (!needsDocs) {
    if (codeFiles.length === 0) {
      console.log('✔ docs-updated check: no product-code changes — nothing to document.')
    } else {
      console.log(`✔ docs-updated check: code changed and docs were updated (${docsFiles.join(', ')}).`)
    }
    return
  }

  const msg =
    `${codeFiles.length} product-code file(s) changed with no docs update. ` +
    `Update README/docs to match, or note in the PR why none is needed. ` +
    `Code: ${codeFiles.slice(0, 10).join(', ')}${codeFiles.length > 10 ? ', …' : ''}`

  if (process.env.GITHUB_ACTIONS) {
    console.log(`::warning title=Docs not updated::${msg}`)
  } else {
    console.log(`⚠ docs-updated check: ${msg}`)
  }

  process.exit(strict ? 1 : 0)
}

// Run as a CLI only when invoked directly, so tests can import the classifier.
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
