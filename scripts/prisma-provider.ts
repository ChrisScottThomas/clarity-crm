import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

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

// Rewrite the schema's provider, run `fn`, and ALWAYS restore the original
// file — the committed schema (provider "sqlite") must never stay dirty.
export function withProvider<T>(schemaPath: string, provider: DbProvider, fn: () => T): T {
  const original = readFileSync(schemaPath, 'utf8')
  writeFileSync(schemaPath, rewriteProvider(original, provider))
  try {
    return fn()
  } finally {
    writeFileSync(schemaPath, original)
  }
}

// CLI: `tsx scripts/prisma-provider.ts <prisma args...>` — e.g. `generate`,
// `db push`. Picks the provider from DATABASE_URL, then delegates to prisma.
function main(): void {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.error('Usage: tsx scripts/prisma-provider.ts <prisma command...>')
    process.exit(2)
  }
  const url = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL
  const provider = providerForUrl(url)
  console.log(`prisma-provider: DATABASE_URL is ${provider} — running \`prisma ${args.join(' ')}\``)
  const status = withProvider('prisma/schema.prisma', provider, () => {
    const result = spawnSync('npx', ['prisma', ...args], { stdio: 'inherit' })
    return result.status ?? 1
  })
  process.exit(status)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
