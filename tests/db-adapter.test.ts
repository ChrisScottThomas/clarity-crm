import { describe, expect, it } from 'vitest'
import { chooseAdapter } from '../lib/db-adapter'

describe('chooseAdapter', () => {
  it('chooses sqlite for file: URLs', () => {
    expect(chooseAdapter('file:./data/clarity.db')).toEqual({
      kind: 'sqlite',
      url: 'file:./data/clarity.db',
    })
  })

  it('defaults to the sqlite dev database when DATABASE_URL is unset', () => {
    expect(chooseAdapter(undefined)).toEqual({ kind: 'sqlite', url: 'file:./data/clarity.db' })
  })

  it('chooses postgresql for postgres URLs, with no pool cap by default', () => {
    expect(chooseAdapter('postgres://u:p@host:5432/db')).toEqual({
      kind: 'postgresql',
      connectionString: 'postgres://u:p@host:5432/db',
      max: undefined,
    })
    expect(chooseAdapter('postgresql://u:p@host:5432/db').kind).toBe('postgresql')
  })

  it('parses DATABASE_POOL_MAX for postgres', () => {
    expect(chooseAdapter('postgres://u:p@host:5432/db', '5')).toEqual({
      kind: 'postgresql',
      connectionString: 'postgres://u:p@host:5432/db',
      max: 5,
    })
  })

  it('rejects a non-positive or non-numeric DATABASE_POOL_MAX', () => {
    expect(() => chooseAdapter('postgres://u:p@host/db', 'lots')).toThrow(/DATABASE_POOL_MAX/)
    expect(() => chooseAdapter('postgres://u:p@host/db', '0')).toThrow(/DATABASE_POOL_MAX/)
  })

  it('rejects unknown schemes, naming the accepted ones', () => {
    expect(() => chooseAdapter('mysql://host/db')).toThrow(/file:.*postgres/)
  })
})
