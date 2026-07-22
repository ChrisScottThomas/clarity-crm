# Phase 2 — Dual-provider persistence (SQLite + Postgres) design

**Date:** 2026-07-22
**Status:** Approved (design pass following the 2026-07-22 dual-DB spike)
**Parent plan:** [`../plans/2026-07-22-shipping-state-plan.md`](../plans/2026-07-22-shipping-state-plan.md), Phase 2 / decision D3

## Context

The 2026-07-22 spike (recorded in the parent plan) proved dual-provider support is
feasible but killed the original runtime adapter-swap idea: Prisma bakes the
datasource `provider` into the generated client and rejects a mismatched driver
adapter at construction, and `provider = env(...)` is invalid (`P1012`). The schema
itself is fully portable — `db push` to Postgres applies with zero changes.

Consequence: **one generated client per provider, selected at build time.**

## Locked decisions

| # | Decision | Choice |
|---|----------|--------|
| P2-1 | Provider selection | **Build-step rewrite of one canonical schema** — no duplicated schema files |
| P2-2 | Migrations | **Stay on `db push`** for both providers; no migration history in v1 |
| P2-3 | CI verification | **Full matrix** (sqlite + postgres legs) with a real `db push` + CRUD smoke per leg |

## 1. Provider-selection wrapper

`scripts/prisma-provider.mjs` wraps any prisma command (not just `generate` —
`db push` needs the correct provider too):

1. Read `DATABASE_URL` (default `file:./data/clarity.db`). Map scheme → provider:
   - `file:` → `sqlite`
   - `postgres://` / `postgresql://` → `postgresql`
   - anything else → exit non-zero, naming the accepted schemes.
2. Rewrite the `provider = "…"` line of the `datasource db` block in
   `prisma/schema.prisma` in place.
3. Spawn the passed-through prisma command (`generate`, `db push`, …).
4. **Always restore the original schema** (finally-semantics), so the committed
   file — canonical, `sqlite` as default — never stays dirty. Devs on sqlite see
   zero diff; postgres users get a correct client with no working-tree noise.

The scheme→provider mapping is one small pure function so it is unit-testable;
`lib/db.ts` uses the same mapping logic for adapter choice.

`package.json` scripts:

- `db:generate` → `node scripts/prisma-provider.mjs generate`
- `db:push` → `node scripts/prisma-provider.mjs db push`

## 2. Runtime adapter selection — `lib/db.ts`

`createPrismaClient()` picks the driver adapter from the same scheme mapping:

- `file:` → `@prisma/adapter-better-sqlite3` (existing dependency)
- postgres → `@prisma/adapter-pg` (new dependency)

Both adapters are statically imported ordinary deps. If the generated client and
the runtime `DATABASE_URL` disagree (client regenerated under the wrong env),
Prisma throws a clear construction error — confirmed in the spike — so there is
no bespoke mismatch detection; the failure mode is documented instead.

## 3. CI matrix

The `verify` job in `.github/workflows/ci.yml` gains
`strategy.matrix.provider: [sqlite, postgres]`:

- Each leg sets its own `DATABASE_URL` and runs
  `npm run db:generate` (replacing the bare `npx prisma generate`) →
  `tsc --noEmit` → `vitest run` → **`db:push` + smoke** → `next build`.
- The smoke step is `scripts/db-smoke.mjs`: create/read/delete one `Company`
  row through the real generated client. It runs on **both** legs — uniform
  matrix, and it keeps the spike's portability finding continuously proven.
- The postgres leg adds a `postgres:16` service container with health checks.
- The `lint` job's `npx prisma generate` also becomes `npm run db:generate`
  (sqlite default; no matrix needed there).

Rationale: every current test mocks Prisma, so re-running vitest per leg proves
little by itself — the per-leg value is generate + typecheck + build against
that provider's client, plus the real `db push` + smoke. Real-DB integration
tests remain deferred (task I1 in the testing-and-CI plan).

## 4. Docs & deployer flow

- Fix the README's false "Postgres is just a `DATABASE_URL` swap" claim
  (README:268) with the real flow:
  `set DATABASE_URL` → `npm run db:generate` → `npm run db:push` → `npm run db:seed`.
- State the migration stance explicitly: `db push` for both providers, no
  migration history in v1; revisit when a deployed instance has data to protect.
- Update the parent plan's Phase 2 section to record decisions P2-1..P2-3.

## 5. Testing & error handling

- Unit tests for the scheme→provider mapping: valid schemes, unknown-scheme
  rejection, default when `DATABASE_URL` unset.
- A test that the wrapper restores `schema.prisma` when the wrapped command
  fails (exercised against a temp copy of the schema).
- Existing 128 mocked tests unchanged and green.
- Failure modes:
  - unknown scheme → named error at generate time (wrapper exit);
  - client/URL mismatch → Prisma construction error at boot (documented);
  - CI postgres leg failure → red check isolates the provider-specific break.

## Out of scope

- Migration history (`prisma migrate`) — deferred until real deployed data exists.
- Real-DB integration tests — deferred task I1 (testing-and-CI plan).
- Docker / deploy artifacts — Phase 3.
