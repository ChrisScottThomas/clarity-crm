// Pure adapter-descriptor selection: which Prisma driver adapter matches
// DATABASE_URL, plus the optional Postgres pool cap. Kept free of adapter
// imports so it is unit-testable without touching a database. lib/db.ts maps
// the descriptor to a real adapter instance.

export const DEFAULT_DATABASE_URL = 'file:./data/clarity.db'

export type AdapterChoice =
  | { kind: 'sqlite'; url: string }
  | { kind: 'postgresql'; connectionString: string; max: number | undefined }

export function chooseAdapter(url: string | undefined, poolMax?: string): AdapterChoice {
  const resolved = url ?? DEFAULT_DATABASE_URL
  if (resolved.startsWith('file:')) return { kind: 'sqlite', url: resolved }
  if (resolved.startsWith('postgres://') || resolved.startsWith('postgresql://')) {
    return { kind: 'postgresql', connectionString: resolved, max: parsePoolMax(poolMax) }
  }
  throw new Error(
    `Unsupported DATABASE_URL "${resolved}" — use file: (SQLite) or postgres:// / postgresql:// (Postgres)`,
  )
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
