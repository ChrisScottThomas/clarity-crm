import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  getSessionSecret,
  assertProductionSecrets,
  assertDatabaseUrl,
  assertDatabasePoolMax,
  assertRuntimeEnv,
} from '../lib/env'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('env — session secret', () => {
  it('returns the configured SESSION_SECRET when set', () => {
    vi.stubEnv('SESSION_SECRET', 'a-real-secret')
    expect(getSessionSecret()).toBe('a-real-secret')
  })

  it('falls back to a dev secret outside production when unset', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('SESSION_SECRET', '')
    expect(getSessionSecret()).toBeTruthy()
  })

  it('throws in production when SESSION_SECRET is unset', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SESSION_SECRET', '')
    expect(() => getSessionSecret()).toThrow(/SESSION_SECRET/)
  })
})

describe('env — assertProductionSecrets (boot-time fail-closed)', () => {
  it('does not throw outside production even when secrets are missing', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('SESSION_SECRET', '')
    vi.stubEnv('CRM_PASSWORD', '')
    expect(() => assertProductionSecrets()).not.toThrow()
  })

  it('throws in production when SESSION_SECRET is missing', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SESSION_SECRET', '')
    vi.stubEnv('CRM_PASSWORD', 'set')
    expect(() => assertProductionSecrets()).toThrow(/SESSION_SECRET/)
  })

  it('throws in production when CRM_PASSWORD is missing', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SESSION_SECRET', 'set')
    vi.stubEnv('CRM_PASSWORD', '')
    expect(() => assertProductionSecrets()).toThrow(/CRM_PASSWORD/)
  })
})

describe('env — DATABASE_URL validation', () => {
  it('accepts a sqlite file URL', () => {
    vi.stubEnv('DATABASE_URL', 'file:./data/clarity.db')
    expect(() => assertDatabaseUrl()).not.toThrow()
  })

  it('accepts a postgres URL', () => {
    vi.stubEnv('DATABASE_URL', 'postgres://u:p@host:5432/clarity')
    expect(() => assertDatabaseUrl()).not.toThrow()
  })

  it('accepts an unset DATABASE_URL (the sqlite dev default applies)', () => {
    vi.stubEnv('DATABASE_URL', '')
    expect(() => assertDatabaseUrl()).not.toThrow()
  })

  it('throws on an unsupported scheme, naming what is accepted', () => {
    vi.stubEnv('DATABASE_URL', 'mysql://u:p@host:3306/clarity')
    expect(() => assertDatabaseUrl()).toThrow(/file:/)
    expect(() => assertDatabaseUrl()).toThrow(/postgres/)
  })
})

describe('env — DATABASE_POOL_MAX validation', () => {
  it('accepts unset and empty (the driver default applies)', () => {
    vi.stubEnv('DATABASE_POOL_MAX', '')
    expect(() => assertDatabasePoolMax()).not.toThrow()
  })

  it('accepts a positive integer', () => {
    vi.stubEnv('DATABASE_POOL_MAX', '5')
    expect(() => assertDatabasePoolMax()).not.toThrow()
  })

  // Checked on SQLite too: chooseAdapter never reaches the pool branch there,
  // so without this guard a nonsense value survives boot and only surfaces as a
  // generic 500 the day someone switches provider.
  it('rejects a non-numeric value regardless of provider', () => {
    vi.stubEnv('DATABASE_URL', 'file:./data/clarity.db')
    vi.stubEnv('DATABASE_POOL_MAX', 'abc')
    expect(() => assertDatabasePoolMax()).toThrow(/DATABASE_POOL_MAX/)
  })

  it('rejects zero and negatives', () => {
    vi.stubEnv('DATABASE_POOL_MAX', '0')
    expect(() => assertDatabasePoolMax()).toThrow(/positive integer/)
    vi.stubEnv('DATABASE_POOL_MAX', '-1')
    expect(() => assertDatabasePoolMax()).toThrow(/positive integer/)
  })
})

describe('env — assertRuntimeEnv (every boot guard in one call)', () => {
  it('passes a fully configured production environment', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SESSION_SECRET', 'set')
    vi.stubEnv('CRM_PASSWORD', 'set')
    vi.stubEnv('DATABASE_URL', 'file:./data/clarity.db')
    vi.stubEnv('DATABASE_POOL_MAX', '')
    expect(() => assertRuntimeEnv()).not.toThrow()
  })

  it('surfaces the secret failure first', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SESSION_SECRET', '')
    vi.stubEnv('CRM_PASSWORD', 'set')
    vi.stubEnv('DATABASE_URL', 'mysql://u:p@host:3306/clarity')
    expect(() => assertRuntimeEnv()).toThrow(/SESSION_SECRET/)
  })
})
