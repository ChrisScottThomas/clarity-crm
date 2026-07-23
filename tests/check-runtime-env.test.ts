import { describe, it, expect, afterEach, vi } from 'vitest'
import { readFileSync } from 'fs'
import { checkRuntimeEnv } from '../scripts/check-runtime-env'

afterEach(() => {
  vi.unstubAllEnvs()
})

// The container's real fail-closed gate. instrumentation.ts runs the same
// guards, but Next catches the throw, logs an unhandledRejection and keeps the
// port bound — so a misconfigured container stayed Running=true and served 500s
// forever. This script runs in a process that can actually die.
describe('check-runtime-env — the container preflight', () => {
  it('passes on a fully configured production environment', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SESSION_SECRET', 'a-real-secret')
    vi.stubEnv('CRM_PASSWORD', 'a-real-password')
    vi.stubEnv('DATABASE_URL', 'file:./data/clarity.db')
    vi.stubEnv('DATABASE_POOL_MAX', '')
    expect(() => checkRuntimeEnv()).not.toThrow()
  })

  it('rejects a missing SESSION_SECRET in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SESSION_SECRET', '')
    vi.stubEnv('CRM_PASSWORD', 'a-real-password')
    expect(() => checkRuntimeEnv()).toThrow(/SESSION_SECRET/)
  })

  it('rejects a missing CRM_PASSWORD in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SESSION_SECRET', 'a-real-secret')
    vi.stubEnv('CRM_PASSWORD', '')
    expect(() => checkRuntimeEnv()).toThrow(/CRM_PASSWORD/)
  })

  it('rejects an unsupported DATABASE_URL scheme', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SESSION_SECRET', 'a-real-secret')
    vi.stubEnv('CRM_PASSWORD', 'a-real-password')
    vi.stubEnv('DATABASE_URL', 'mysql://u:p@host:3306/clarity')
    expect(() => checkRuntimeEnv()).toThrow(/mysql/)
  })

  // Regression for the review's F4: on SQLite `chooseAdapter` never reaches the
  // pool branch, so a nonsense value used to sail past every check and only
  // surface as a generic Next 500 on the first Prisma-touching request.
  it('rejects a non-numeric DATABASE_POOL_MAX even on SQLite', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SESSION_SECRET', 'a-real-secret')
    vi.stubEnv('CRM_PASSWORD', 'a-real-password')
    vi.stubEnv('DATABASE_URL', 'file:./data/clarity.db')
    vi.stubEnv('DATABASE_POOL_MAX', 'abc')
    expect(() => checkRuntimeEnv()).toThrow(/DATABASE_POOL_MAX/)
  })

  it('rejects a non-numeric DATABASE_POOL_MAX on Postgres', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SESSION_SECRET', 'a-real-secret')
    vi.stubEnv('CRM_PASSWORD', 'a-real-password')
    vi.stubEnv('DATABASE_URL', 'postgres://u:p@db:5432/clarity')
    vi.stubEnv('DATABASE_POOL_MAX', '0')
    expect(() => checkRuntimeEnv()).toThrow(/DATABASE_POOL_MAX/)
  })

  it('is a no-op outside production for the secrets, as the dev fallbacks intend', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('SESSION_SECRET', '')
    vi.stubEnv('CRM_PASSWORD', '')
    vi.stubEnv('DATABASE_URL', '')
    vi.stubEnv('DATABASE_POOL_MAX', '')
    expect(() => checkRuntimeEnv()).not.toThrow()
  })
})

describe('check-runtime-env — as a CLI', () => {
  const source = readFileSync('scripts/check-runtime-env.ts', 'utf8')

  // The whole point: a throw must become a non-zero exit status, because a
  // process that stays alive is exactly the failure mode being fixed.
  it('exits non-zero rather than continuing', () => {
    expect(source).toContain('process.exit(1)')
  })

  it('is wired into an npm script the entrypoint can call', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
    expect(pkg.scripts['check:env']).toContain('scripts/check-runtime-env.ts')
  })
})
