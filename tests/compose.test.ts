import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const sqlite = readFileSync('docker-compose.yml', 'utf8')
const postgres = readFileSync('docker-compose.postgres.yml', 'utf8')

describe('docker-compose.yml (SQLite default)', () => {
  it('builds the sqlite image variant', () => {
    expect(sqlite).toMatch(/DB_PROVIDER:\s*sqlite/)
  })

  it('defaults to a SQLite file URL', () => {
    expect(sqlite).toContain('file:./data/clarity.db')
  })

  it('persists the database on a named volume', () => {
    expect(sqlite).toContain('/app/data')
    expect(sqlite).toMatch(/volumes:/)
  })

  // /login returned 200 throughout a completely broken run in spike A — only a
  // DB-backed endpoint tells the truth.
  it('healthchecks via /api/health, never /login', () => {
    expect(sqlite).toContain('/api/health')
    expect(sqlite).not.toContain('/login')
    expect(sqlite).toContain('start_period')
  })

  it('does not hardcode secrets', () => {
    expect(sqlite).not.toMatch(/SESSION_SECRET:\s*[a-z]/i)
  })
})

describe('docker-compose.postgres.yml', () => {
  it('builds the postgres image variant', () => {
    expect(postgres).toMatch(/DB_PROVIDER:\s*postgres/)
  })

  it('runs postgres:16 alongside the app', () => {
    expect(postgres).toContain('postgres:16')
  })

  it('points the app at the postgres service', () => {
    expect(postgres).toMatch(/postgres:\/\/.*@db:5432/)
  })

  it('waits for the database to be healthy before starting the app', () => {
    expect(postgres).toContain('service_healthy')
  })

  it('persists postgres data on a named volume', () => {
    expect(postgres).toContain('/var/lib/postgresql/data')
  })
})
