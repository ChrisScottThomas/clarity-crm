// Pure adapter-descriptor selection: which Prisma driver adapter matches
// DATABASE_URL, plus the optional Postgres pool cap. Kept free of adapter
// imports so it is unit-testable without touching a database. lib/db.ts maps
// the descriptor to a real adapter instance.

export const DEFAULT_DATABASE_URL = 'file:./data/clarity.db'

export type DbProvider = 'sqlite' | 'postgresql'

export type AdapterChoice =
  | { kind: 'sqlite'; url: string }
  | { kind: 'postgresql'; connectionString: string; max: number | undefined }

export function providerForUrl(url: string): DbProvider {
  if (url.startsWith('file:')) return 'sqlite'
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) return 'postgresql'
  throw new Error(
    `Unsupported DATABASE_URL "${url}" — use file: (SQLite) or postgres:// / postgresql:// (Postgres)`,
  )
}

export function chooseAdapter(url: string | undefined, poolMax?: string): AdapterChoice {
  const resolved = url ?? DEFAULT_DATABASE_URL
  return providerForUrl(resolved) === 'sqlite'
    ? { kind: 'sqlite', url: resolved }
    : { kind: 'postgresql', connectionString: resolved, max: parsePoolMax(poolMax) }
}

// Pool sizing matters at scale: long-lived containers can afford the pg
// default (10); serverless/many-replica deployments must keep this low or
// they exhaust the database's connection limit.
function parsePoolMax(poolMax: string | undefined): number | undefined {
  if (poolMax === undefined || poolMax === '') return undefined
  const n = Number(poolMax)
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`DATABASE_POOL_MAX must be a positive integer, got "${poolMax}"`)
  }
  return n
}
