import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import nextConfig from '../next.config'

describe('next.config — deployability', () => {
  it('emits a standalone server bundle', () => {
    expect(nextConfig.output).toBe('standalone')
  })

  it('keeps native DB modules out of the bundler', () => {
    expect(nextConfig.serverExternalPackages).toContain('better-sqlite3')
    expect(nextConfig.serverExternalPackages).toContain('@prisma/adapter-pg')
  })
})

describe('package.json — container runtime deps', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))

  // The container entrypoint runs db:push, which routes through
  // scripts/prisma-provider.ts — so tsx is a runtime dependency, not a dev one.
  // See docs/superpowers/specs/2026-07-23-phase-3-deploy-design.md §2.
  it('ships tsx as a production dependency', () => {
    expect(pkg.dependencies).toHaveProperty('tsx')
    expect(pkg.devDependencies ?? {}).not.toHaveProperty('tsx')
  })
})

describe('.dockerignore', () => {
  const ignore = readFileSync('.dockerignore', 'utf8')

  // Spike A measured a 751.70 MB context carrying a macOS-native node_modules
  // that `COPY . .` layers over the Linux one built in the deps stage.
  it('excludes the host node_modules and build output', () => {
    for (const entry of ['node_modules', '.next', 'data']) {
      expect(ignore).toContain(entry)
    }
  })

  it('keeps secrets out of the build context', () => {
    expect(ignore).toContain('.env')
  })
})
