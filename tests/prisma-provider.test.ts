import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_DATABASE_URL, providerForUrl, rewriteProvider, withProvider } from '../scripts/prisma-provider'

describe('providerForUrl', () => {
  it('maps file: URLs to sqlite', () => {
    expect(providerForUrl('file:./data/clarity.db')).toBe('sqlite')
  })

  it('maps postgres:// and postgresql:// URLs to postgresql', () => {
    expect(providerForUrl('postgres://u:p@localhost:5432/db')).toBe('postgresql')
    expect(providerForUrl('postgresql://u:p@localhost:5432/db')).toBe('postgresql')
  })

  it('rejects unknown schemes, naming the accepted ones', () => {
    expect(() => providerForUrl('mysql://localhost/db')).toThrow(/file:.*postgres/)
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

describe('withProvider', () => {
  const schema = `datasource db {\n  provider = "sqlite"\n}\n`

  function tempSchema(): string {
    const dir = mkdtempSync(join(tmpdir(), 'prisma-provider-'))
    const path = join(dir, 'schema.prisma')
    writeFileSync(path, schema)
    return path
  }

  it('runs the callback with the rewritten schema in place', () => {
    const path = tempSchema()
    let seen = ''
    withProvider(path, 'postgresql', () => {
      seen = readFileSync(path, 'utf8')
    })
    expect(seen).toContain('provider = "postgresql"')
  })

  it('restores the original schema after success', () => {
    const path = tempSchema()
    withProvider(path, 'postgresql', () => {})
    expect(readFileSync(path, 'utf8')).toBe(schema)
  })

  it('restores the original schema when the callback throws', () => {
    const path = tempSchema()
    expect(() =>
      withProvider(path, 'postgresql', () => {
        throw new Error('prisma exploded')
      }),
    ).toThrow('prisma exploded')
    expect(readFileSync(path, 'utf8')).toBe(schema)
  })
})
