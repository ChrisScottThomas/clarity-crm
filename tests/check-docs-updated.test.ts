import { describe, it, expect } from 'vitest'
import { classifyDocsUpdate } from '../scripts/check-docs-updated.mjs'

describe('classifyDocsUpdate', () => {
  it('flags product code changed with no docs touched', () => {
    const r = classifyDocsUpdate(['lib/leads.ts', 'components/LeadCard.tsx'])
    expect(r.needsDocs).toBe(true)
    expect(r.codeFiles).toEqual(['lib/leads.ts', 'components/LeadCard.tsx'])
    expect(r.docsFiles).toEqual([])
  })

  it('is satisfied when a matching docs file changed alongside code', () => {
    const r = classifyDocsUpdate(['lib/leads.ts', 'docs/reference-data-model.md'])
    expect(r.needsDocs).toBe(false)
    expect(r.docsFiles).toEqual(['docs/reference-data-model.md'])
  })

  it('counts a root markdown file (README.md) as docs', () => {
    const r = classifyDocsUpdate(['app/page.tsx', 'README.md'])
    expect(r.needsDocs).toBe(false)
    expect(r.docsFiles).toEqual(['README.md'])
  })

  it('counts clarity.config.ts as product code', () => {
    const r = classifyDocsUpdate(['clarity.config.ts'])
    expect(r.needsDocs).toBe(true)
    expect(r.codeFiles).toEqual(['clarity.config.ts'])
  })

  it('does not flag docs-only changes', () => {
    const r = classifyDocsUpdate(['docs/howto-workflows.md'])
    expect(r.needsDocs).toBe(false)
    expect(r.codeFiles).toEqual([])
  })

  it('does not flag test-only changes (tests are not product code)', () => {
    const r = classifyDocsUpdate(['tests/leads.test.ts'])
    expect(r.needsDocs).toBe(false)
    expect(r.codeFiles).toEqual([])
  })

  it('ignores neutral infra files (workflows, package manifests)', () => {
    const r = classifyDocsUpdate(['.github/workflows/ci.yml', 'package.json', 'package-lock.json'])
    expect(r.needsDocs).toBe(false)
    expect(r.codeFiles).toEqual([])
    expect(r.docsFiles).toEqual([])
  })

  it('treats any file under docs/ as docs, even non-markdown', () => {
    const r = classifyDocsUpdate(['lib/leads.ts', 'docs/diagram.excalidraw'])
    expect(r.needsDocs).toBe(false)
    expect(r.docsFiles).toEqual(['docs/diagram.excalidraw'])
  })

  it('handles an empty changeset without flagging', () => {
    const r = classifyDocsUpdate([])
    expect(r.needsDocs).toBe(false)
  })
})
