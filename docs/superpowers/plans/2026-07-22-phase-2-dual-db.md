# Phase 2 — Dual-Provider Persistence (SQLite + Postgres) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployer picks SQLite or Postgres purely via `DATABASE_URL`; the build generates the matching Prisma client, CI proves both providers on every PR, and the docs tell the truth about how.

**Architecture:** Prisma bakes the datasource `provider` into the generated client (2026-07-22 spike), so one client per provider is generated at build time by a wrapper (`scripts/prisma-provider.ts`) that rewrites the `provider` line of the single canonical `prisma/schema.prisma`, runs the prisma command, and always restores the file. `lib/db.ts` picks the matching driver adapter from the URL scheme at runtime. CI runs a sqlite/postgres matrix with a real `db push` + CRUD smoke per leg.

**Tech Stack:** Prisma 7.8 (`prisma-client` generator), `@prisma/adapter-better-sqlite3` (existing), `@prisma/adapter-pg` (new), tsx (existing), Vitest, GitHub Actions with a `postgres:16` service container.

**Spec:** [`../specs/2026-07-22-phase-2-dual-db-design.md`](../specs/2026-07-22-phase-2-dual-db-design.md) — decisions P2-1 (build-step provider rewrite), P2-2 (`db push`, no migrations in v1), P2-3 (full CI matrix + smoke).

---

## Scale & production data posture

This phase is where the persistence layer meets real deployments, so the plan takes an explicit position on scale and live data. These are commitments the tasks below implement, not aspirations:

**Which database at which scale.** SQLite is the small-scale default: one node, one team, modest write concurrency, database as a file on a mounted volume — backup is copying the file. Postgres is the production/scale recommendation: concurrent multi-user writes, managed hosting (backups, HA, PITR come from the provider), horizontal app scaling against one shared DB. Task 6 writes this guidance into the README so a deployer chooses deliberately, not by default.

**Connection scale (Postgres).** The pg driver adapter owns a connection pool. Pool size becomes tunable via an optional `DATABASE_POOL_MAX` env var (Task 3) — defaults to the pg driver default (10) — because the right number differs between a long-lived container (higher is fine) and serverless/many-replica deployments (must stay low to avoid exhausting the DB's connection limit). The README env table documents the knob and when to turn it.

**Live data vs `db push` (decision P2-2 made production-safe).** `db push` with no migration history is correct for v1 — every instance today starts empty, and additive schema changes apply cleanly. But `db push` will drop data on destructive changes (column removal/retype) and only proceeds with `--accept-data-loss`. The documented production rules (Task 6): back up before any schema change on a live database; never script or blindly pass `--accept-data-loss`; treat a data-loss prompt as a stop-and-think signal.

**The migration-history trigger.** The explicit upgrade path out of `db push`: **the first production instance holding data you cannot recreate is the trigger to adopt `prisma migrate`**, with per-provider migration histories (`prisma migrate diff` can bootstrap the initial migration from the live schema, per provider). Task 6 documents this trigger and path so the v1 stance can't silently ossify past its safe lifetime.

**Smoke safety.** The CI smoke script (Task 4) creates and deletes only its own uniquely-named row — it never truncates or resets — so it is harmless even if someone points it at a database that matters.

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `scripts/prisma-provider.ts` | Create | Scheme→provider mapping, schema `provider`-line rewrite, run-prisma-with-restore wrapper, CLI entry |
| `tests/prisma-provider.test.ts` | Create | Unit tests for mapping, rewrite, and restore-on-failure |
| `lib/db-adapter.ts` | Create | Pure `chooseAdapter(url, poolMax)` → adapter descriptor (testable without constructing adapters) |
| `tests/db-adapter.test.ts` | Create | Unit tests for adapter choice + pool-max parsing |
| `lib/db.ts` | Modify | Map adapter descriptor → real adapter instance (`PrismaBetterSqlite3` / `PrismaPg`) |
| `scripts/db-smoke.ts` | Create | Create/read/delete one uniquely-named Company via the real client; exit 0/1 |
| `package.json` | Modify | `db:generate` + `db:push` route through the wrapper; add `db:smoke`; add `@prisma/adapter-pg` |
| `.github/workflows/ci.yml` | Modify | `verify` job → provider matrix + postgres service + push/smoke steps; `lint` job uses `db:generate` |
| `README.md` | Modify | Real Postgres setup flow, Scale & production data section, `DATABASE_POOL_MAX` env row |
| `docs/superpowers/plans/2026-07-22-shipping-state-plan.md` | Modify | Mark Phase 2 designed/underway; record P2-1..P2-3 |

---

### Task 1: Provider mapping + schema rewrite (pure logic)

**Files:**
- Create: `scripts/prisma-provider.ts`
- Test: `tests/prisma-provider.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/prisma-provider.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/prisma-provider.test.ts`
Expected: FAIL — cannot resolve `../scripts/prisma-provider`.

- [ ] **Step 3: Write the implementation**

Create `scripts/prisma-provider.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/prisma-provider.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/prisma-provider.ts tests/prisma-provider.test.ts
git commit -m "feat(db): scheme->provider mapping and schema provider rewrite"
```

### Task 2: Rewrite-run-restore wrapper + CLI entry + scripts

**Files:**
- Modify: `scripts/prisma-provider.ts`
- Modify: `tests/prisma-provider.test.ts`
- Modify: `package.json` (scripts block)

- [ ] **Step 1: Write the failing tests**

Append to `tests/prisma-provider.test.ts` (add `withProvider` to the existing import, and add the node imports):

```ts
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { withProvider } from '../scripts/prisma-provider'

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/prisma-provider.test.ts`
Expected: FAIL — `withProvider` is not exported.

- [ ] **Step 3: Implement `withProvider` and the CLI entry**

Append to `scripts/prisma-provider.ts`:

```ts
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/prisma-provider.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Route package.json scripts through the wrapper**

In `package.json`, replace the `db:push` line and add `db:generate`:

```json
    "db:generate": "tsx scripts/prisma-provider.ts generate",
    "db:push": "tsx scripts/prisma-provider.ts db push",
```

- [ ] **Step 6: Verify end-to-end against sqlite (the default)**

```bash
npm run db:generate
git status --short prisma/schema.prisma
```

Expected: prisma reports the client generated into `app/generated/prisma`; `git status` prints nothing (schema untouched).

- [ ] **Step 7: Commit**

```bash
git add scripts/prisma-provider.ts tests/prisma-provider.test.ts package.json
git commit -m "feat(db): prisma-provider wrapper — rewrite, run, always restore"
```

### Task 3: Runtime adapter selection + pool knob (`lib/db-adapter.ts`, `lib/db.ts`)

**Files:**
- Create: `lib/db-adapter.ts`
- Test: `tests/db-adapter.test.ts`
- Modify: `lib/db.ts`
- Modify: `package.json` (dependency)

- [ ] **Step 1: Add the pg adapter dependency**

```bash
npm install @prisma/adapter-pg@^7.8.0
```

Expected: `@prisma/adapter-pg` appears in `package.json` dependencies alongside `@prisma/adapter-better-sqlite3`.

- [ ] **Step 2: Write the failing tests**

Create `tests/db-adapter.test.ts`:

```ts
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
    expect(() => chooseAdapter('mysql://host/db')).toThrow(/file:.*postgres/s)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/db-adapter.test.ts`
Expected: FAIL — cannot resolve `../lib/db-adapter`.

- [ ] **Step 4: Implement `chooseAdapter`**

Create `lib/db-adapter.ts`:

```ts
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/db-adapter.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Rewire `lib/db.ts`**

Replace the full contents of `lib/db.ts`:

```ts
import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaPg } from '@prisma/adapter-pg'
import { chooseAdapter } from './db-adapter'

const g = globalThis as unknown as { prisma?: PrismaClient }

// The client in app/generated/prisma was generated for one provider
// (npm run db:generate reads DATABASE_URL). If the URL points at the other
// provider at runtime, Prisma rejects the adapter at construction with a
// clear provider-mismatch error — regenerate with the right DATABASE_URL.
function createPrismaClient() {
  const choice = chooseAdapter(process.env.DATABASE_URL, process.env.DATABASE_POOL_MAX)
  const adapter =
    choice.kind === 'sqlite'
      ? new PrismaBetterSqlite3({ url: choice.url })
      : new PrismaPg({
          connectionString: choice.connectionString,
          ...(choice.max !== undefined ? { max: choice.max } : {}),
        })
  return new PrismaClient({ adapter })
}

export const prisma = g.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') g.prisma = prisma
```

- [ ] **Step 7: Run the full suite + typecheck**

```bash
npx vitest run && npx tsc --noEmit
```

Expected: all tests pass (128 existing + 16 new), tsc clean.

- [ ] **Step 8: Commit**

```bash
git add lib/db-adapter.ts lib/db.ts tests/db-adapter.test.ts package.json package-lock.json
git commit -m "feat(db): runtime adapter selection from DATABASE_URL + DATABASE_POOL_MAX knob"
```

### Task 4: CRUD smoke script

**Files:**
- Create: `scripts/db-smoke.ts`
- Modify: `package.json` (scripts block)

- [ ] **Step 1: Write the smoke script**

Create `scripts/db-smoke.ts`:

```ts
// Minimal proof that the generated client + chosen adapter really talk to the
// database behind DATABASE_URL: create one uniquely-named Company, read it
// back, delete it. Never truncates or resets anything — safe even against a
// database that matters. Run in CI after `db:push` on each provider leg.
import { prisma } from '../lib/db'

async function main(): Promise<void> {
  const name = `__db-smoke__${Date.now()}`
  const created = await prisma.company.create({ data: { name } })
  const found = await prisma.company.findUnique({ where: { id: created.id } })
  if (found?.name !== name) {
    throw new Error(`smoke read-back mismatch: expected "${name}", got "${found?.name}"`)
  }
  await prisma.company.delete({ where: { id: created.id } })
  console.log(`db-smoke: OK (create/read/delete Company against ${process.env.DATABASE_URL ?? 'default sqlite'})`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('db-smoke: FAILED')
    console.error(err)
    process.exit(1)
  })
```

- [ ] **Step 2: Add the script entry**

In `package.json` scripts, after `db:push`:

```json
    "db:smoke": "tsx scripts/db-smoke.ts",
```

- [ ] **Step 3: Verify locally against sqlite**

```bash
mkdir -p data && npm run db:generate && npm run db:push && npm run db:smoke
```

Expected: final line `db-smoke: OK (create/read/delete Company against default sqlite)` (or the `file:` URL if `DATABASE_URL` is set), exit 0.

- [ ] **Step 4: Commit**

```bash
git add scripts/db-smoke.ts package.json
git commit -m "feat(ci): db-smoke script — real create/read/delete through the generated client"
```

### Task 5: CI provider matrix

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Rewrite the `verify` job as a matrix**

Replace the `verify` job in `.github/workflows/ci.yml` with:

```yaml
  verify:
    name: Typecheck · Test · Build (${{ matrix.provider }})
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        include:
          - provider: sqlite
            database-url: file:./data/ci.db
          - provider: postgres
            database-url: postgres://postgres:ci@localhost:5432/clarity
    env:
      DATABASE_URL: ${{ matrix.database-url }}
    # The service container runs on both legs (GitHub Actions cannot make
    # services conditional per matrix entry); the sqlite leg simply ignores it.
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: ci
          POSTGRES_DB: clarity
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    steps:
      - uses: actions/checkout@v5

      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      # One generated client per provider (spike finding): the wrapper reads
      # DATABASE_URL, rewrites the schema's provider line, generates, restores.
      - name: Generate Prisma client (${{ matrix.provider }})
        run: npm run db:generate

      - name: Typecheck
        run: npx tsc --noEmit

      # One suite today covers both true unit tests (lib/*) and route-level
      # integration tests (API handlers over a mocked Prisma). Real-DB
      # integration is tracked in docs/superpowers/plans/2026-07-22-testing-and-ci-plan.md.
      - name: Unit + integration tests
        run: npx vitest run

      # Apply the schema to a real database and prove CRUD through the
      # generated client — keeps the spike's portability finding continuously
      # verified on both providers.
      - name: Apply schema (db push)
        run: mkdir -p data && npm run db:push

      - name: DB smoke (create/read/delete)
        run: npm run db:smoke

      # Smoke: the whole app must compile and build. Dummy secrets satisfy the
      # fail-closed boot checks; they are not real and grant no access.
      - name: Build (smoke)
        run: npx next build
        env:
          SESSION_SECRET: ci-not-a-real-secret
          CRM_PASSWORD: ci-not-a-real-password
```

Note: `DATABASE_URL` moves from the build step to job-level `env` (the matrix provides it); the build step keeps only the dummy secrets.

- [ ] **Step 2: Point the `lint` job at the wrapper**

In the `lint` job, replace `- run: npx prisma generate` with:

```yaml
      - run: npm run db:generate # sqlite default; lint needs the client present, any provider will do
```

- [ ] **Step 3: Validate the workflow file**

```bash
npx yaml-lint .github/workflows/ci.yml 2>/dev/null || node -e "const yaml=require('js-yaml');yaml.load(require('fs').readFileSync('.github/workflows/ci.yml','utf8'));console.log('yaml OK')"
```

Expected: `yaml OK` (or the linter passing). If neither yaml tool is available, `npx --yes js-yaml .github/workflows/ci.yml > /dev/null && echo yaml OK`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: sqlite/postgres provider matrix with real db push + smoke per leg"
```

### Task 6: Docs — README truth, scale & production data, plan update

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-07-22-shipping-state-plan.md`

- [ ] **Step 1: Fix the false Postgres claim (README:268)**

Replace the line:

```markdown
1. Swap SQLite → Postgres by changing `DATABASE_URL` (Prisma adapter swaps behind the same interface).
```

with:

````markdown
1. Swap SQLite → Postgres by pointing `DATABASE_URL` at a Postgres server **and regenerating the client** — Prisma bakes the provider into the generated client, so the URL alone is not enough:

   ```bash
   export DATABASE_URL="postgres://user:pass@host:5432/clarity"
   npm run db:generate   # regenerates the client for the postgresql provider
   npm run db:push       # applies the schema
   npm run db:seed       # optional: demo data
   ```

   Running against the wrong client (e.g. a sqlite-generated client with a postgres URL) fails at boot with Prisma's provider-mismatch error — rerun `npm run db:generate` under the correct `DATABASE_URL`.
````

- [ ] **Step 2: Add the `DATABASE_POOL_MAX` env row**

In the README environment-variable table (around line 43, where `DATABASE_URL` is documented), add:

```markdown
| `DATABASE_POOL_MAX` | _(unset — pg default, 10)_ | Postgres only: max connections in the app's pool. Lower it (e.g. 3–5) on serverless or many-replica deployments so combined replicas stay under the database's connection limit. |
```

- [ ] **Step 3: Add the "Scale & production data" README section**

Immediately after the Postgres setup steps from Step 1, add:

```markdown
### Scale & production data

**Choosing a database.** SQLite is the small-scale default: one node, one team, modest write concurrency, and the database is a single file — put it on a mounted volume, and backup is copying the file. Postgres is the production/scale choice: concurrent multi-user writes, horizontal app scaling against one shared database, and managed hosting gives you backups, high availability, and point-in-time recovery. If you expect more than one app instance or can't afford to lose data between file copies, use Postgres.

**Connection pooling (Postgres).** The app holds a connection pool sized by `DATABASE_POOL_MAX` (default: pg's 10). Long-lived containers can keep the default; serverless or many-replica deployments should lower it so `replicas × pool size` stays under the database's connection limit.

**Schema changes on a live database.** This project applies schema with `prisma db push` and keeps no migration history (v1 stance — every instance starts empty). Additive changes apply cleanly. Destructive changes (dropping/retyping a column) will make `db push` demand `--accept-data-loss`:

- **Back up before any schema change on a database with real data** (SQLite: copy the file; Postgres: `pg_dump` or your provider's snapshot).
- **Never script or blindly pass `--accept-data-loss`.** A data-loss prompt is a stop-and-think signal.

**When to adopt real migrations.** The trigger is explicit: **the first production instance holding data you cannot recreate**. At that point, switch from `db push` to `prisma migrate` with a per-provider migration history (`prisma migrate diff` can bootstrap the initial migration from the live schema for each provider). Until then, migration machinery is deliberate YAGNI.
```

- [ ] **Step 4: Update the shipping-state plan's Phase 2 section**

In `docs/superpowers/plans/2026-07-22-shipping-state-plan.md`, after the "Revised approach" list in Phase 2, add:

```markdown
**Design pass done (2026-07-22)** — spec: [`../specs/2026-07-22-phase-2-dual-db-design.md`](../specs/2026-07-22-phase-2-dual-db-design.md), implementation plan: [`2026-07-22-phase-2-dual-db.md`](2026-07-22-phase-2-dual-db.md). Locked: **P2-1** build-step rewrite of the one canonical schema (no duplicated schema files); **P2-2** stay on `db push` for both providers — no migration history in v1, with a documented trigger (first production data you can't recreate) to adopt per-provider `prisma migrate`; **P2-3** full CI matrix (sqlite + postgres legs, real `db push` + CRUD smoke each). Scale posture: SQLite = single-node/small-team, Postgres = production/multi-user, pool sized via `DATABASE_POOL_MAX`.
```

- [ ] **Step 5: Verify docs render + commit**

```bash
git add README.md docs/superpowers/plans/2026-07-22-shipping-state-plan.md
git commit -m "docs: real Postgres flow, scale & production-data guidance, plan cross-refs"
```

### Task 7: Full verification + Postgres proof + finish

**Files:** none new — verification only.

- [ ] **Step 1: Full local verification (sqlite default)**

```bash
npm run db:generate && npx tsc --noEmit && npx vitest run && npm run db:push && npm run db:smoke
```

Expected: tsc clean; all tests pass; `db-smoke: OK`.

- [ ] **Step 2: Local Postgres proof (mirrors the CI postgres leg)**

```bash
docker run -d --name clarity-p2-pg -e POSTGRES_PASSWORD=ci -e POSTGRES_DB=clarity -p 55432:5432 postgres:16
sleep 5
export DATABASE_URL="postgres://postgres:ci@localhost:55432/clarity"
npm run db:generate && npm run db:push && npm run db:smoke && npx tsc --noEmit
docker rm -f clarity-p2-pg
unset DATABASE_URL
npm run db:generate   # restore the sqlite client for local dev
```

Expected: generate/push/smoke all succeed against Postgres; `git status --short prisma/schema.prisma` prints nothing throughout. (Skip this step if Docker is unavailable — CI's postgres leg is the authoritative check.)

- [ ] **Step 3: Verify the schema was never left dirty**

```bash
git status --short
```

Expected: only intentionally modified files; `prisma/schema.prisma` absent from the list.

- [ ] **Step 4: Finish the branch**

Use the superpowers:finishing-a-development-branch skill — push, open a PR to `main`, confirm all checks green (now 6+ checks: two verify legs, lint, docs-check, white-label integrity, secret scan).

---

## Self-review notes

- Spec coverage: P2-1 → Tasks 1–2; P2-2 → Task 6 (docs stance + trigger); P2-3 → Tasks 4–5; §2 runtime adapters → Task 3; §4 docs → Task 6; §5 tests → Tasks 1–3. Scale & production data (user adjustment) → posture section + Tasks 3 (pool knob), 4 (smoke safety), 6 (guidance + trigger).
- All code steps carry complete code; commands carry expected output.
- Names consistent across tasks: `providerForUrl`, `rewriteProvider`, `withProvider`, `chooseAdapter`, `DEFAULT_DATABASE_URL`, scripts `db:generate`/`db:push`/`db:smoke`.
