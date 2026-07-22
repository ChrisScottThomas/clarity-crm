// Prisma bakes the datasource `provider` into the generated client, and
// `provider = env(...)` is invalid (P1012) — so dual-provider support means
// rewriting the provider line of the one canonical schema before running a
// prisma command, then restoring it. See
// docs/superpowers/specs/2026-07-22-phase-2-dual-db-design.md (P2-1).

export const DEFAULT_DATABASE_URL = 'file:./data/clarity.db'

export type DbProvider = 'sqlite' | 'postgresql'

export function providerForUrl(url: string): DbProvider {
  if (url.startsWith('file:')) return 'sqlite'
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) return 'postgresql'
  throw new Error(
    `Unsupported DATABASE_URL "${url}" — use file: (SQLite) or postgres:// / postgresql:// (Postgres)`,
  )
}

// Rewrites the provider line inside the `datasource db` block only; the
// generator block also has a `provider` line and must be left alone.
export function rewriteProvider(schemaSource: string, provider: DbProvider): string {
  const pattern = /(datasource\s+db\s*\{[^}]*?provider\s*=\s*")[^"]+(")/
  if (!pattern.test(schemaSource)) {
    throw new Error('Could not find a `datasource db` block with a provider line in the schema')
  }
  return schemaSource.replace(pattern, `$1${provider}$2`)
}
