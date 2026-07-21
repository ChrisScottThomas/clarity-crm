import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('tokens.css', () => {
  it('contains both dark root and light theme blocks', () => {
    const css = readFileSync('styles/tokens.css', 'utf8')
    expect(css).toContain(':root')
    expect(css).toContain('[data-theme="light"]')
    expect(css).toContain('--bg-base')
    expect(css).toContain('--text-primary')
    expect(css).toContain('--sidebar-bg')
  })
})

describe('theme cookie API', () => {
  it('module exports a POST handler', async () => {
    const mod = await import('../app/api/theme/route')
    expect(typeof mod.POST).toBe('function')
  })
})
