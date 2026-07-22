import { describe, expect, it } from 'vitest'
import { DEFAULT_DATABASE_URL, providerForUrl, rewriteProvider } from '../scripts/prisma-provider'

describe('providerForUrl', () => {
  it('maps file: URLs to sqlite', () => {
    expect(providerForUrl('file:./data/clarity.db')).toBe('sqlite')
  })

  it('maps postgres:// and postgresql:// URLs to postgresql', () => {
    expect(providerForUrl('postgres://u:p@localhost:5432/db')).toBe('postgresql')
    expect(providerForUrl('postgresql://u:p@localhost:5432/db')).toBe('postgresql')
  })

  it('rejects unknown schemes, naming the accepted ones', () => {
    expect(() => providerForUrl('mysql://localhost/db')).toThrow(/file:.*postgres/s)
  })

  it('defaults to the sqlite dev database', () => {
    expect(DEFAULT_DATABASE_URL).toBe('file:./data/clarity.db')
    expect(providerForUrl(DEFAULT_DATABASE_URL)).toBe('sqlite')
  })
})

describe('rewriteProvider', () => {
  const schema = `generator client {
  provider = "prisma-client"
  output   = "../app/generated/prisma"
}

datasource db {
  provider = "sqlite"
}
`

  it('rewrites only the datasource provider, not the generator', () => {
    const out = rewriteProvider(schema, 'postgresql')
    expect(out).toContain('provider = "prisma-client"')
    expect(out).toMatch(/datasource db \{\n  provider = "postgresql"/)
  })

  it('is a no-op when the provider already matches', () => {
    expect(rewriteProvider(schema, 'sqlite')).toBe(schema)
  })

  it('throws if the datasource block cannot be found', () => {
    expect(() => rewriteProvider('generator client {}', 'sqlite')).toThrow(/datasource/)
  })
})
