# Phase 3 — Deploy & distribution design

**Date:** 2026-07-23
**Status:** Approved
**Parent plan:** [`../plans/2026-07-22-shipping-state-plan.md`](../plans/2026-07-22-shipping-state-plan.md), Phase 3
**Builds on:** [`2026-07-22-phase-2-dual-db-design.md`](2026-07-22-phase-2-dual-db-design.md)

## Context

Phase 2 shipped dual-provider persistence but left the deployment story unwritten:
the README's deploy section is still headed "future — not done yet". Code nobody
can deploy isn't shipped.

Phase 2 also left one constraint that dominates this design. Prisma bakes the
datasource `provider` into the generated client and rejects a mismatched driver
adapter at construction, so `app/generated/prisma` is provider-specific. A
container image built for SQLite crashes at boot against a Postgres URL. Docker
would multiply what is already the project's most confusing failure mode.

**Audience:** both forkers and the maintainer, forkers first. The artifacts are
generic and self-hosting-first; `getclarity.win` deploys down the same path as
everyone else, which is what keeps the recipes honest.

## Locked decisions

| # | Decision | Choice |
|---|----------|--------|
| P3-1 | Provider handling in the image | **Regenerate the client at boot** — one universal image |
| P3-2 | First-boot schema | **Auto-apply** (`db push` from the entrypoint), zero manual steps |
| P3-3 | Compose topology | **Two self-contained files** — SQLite default, Postgres variant |
| P3-4 | Host recipes | **Generic compose/VPS + Railway.** Vercel and Fly.io dropped |
| P3-5 | Boot verification | **`/api/health`** (DB round-trip), polled by a new CI boot-smoke job |

### Why P3-1 (regenerate at boot)

The alternatives were a build-arg per provider (two image variants; the mismatch
footgun survives, merely relocated) and shipping both clients with a runtime
dynamic import (most complexity, fights Next's static analysis, no clear win).

Regenerating at boot makes provider mismatch *structurally impossible*: the client
is always generated from the same `DATABASE_URL` the app is about to use. Because
P3-2 already puts the Prisma CLI and schema in the runtime image, the marginal
cost is a few seconds of boot time and a writable app directory.

## 1. Standalone output

`next.config.ts` gains `output: 'standalone'`, plus `serverExternalPackages` for
`better-sqlite3` and `@prisma/adapter-pg` so Next does not attempt to bundle
native modules.

## 2. Dockerfile

Three stages on `node:22-slim`. Debian, not Alpine: `better-sqlite3` ships
prebuilt binaries against glibc, and musl forces a compile-from-source with
`python3`/`make`/`g++` in the build image.

| Stage | Does |
|-------|------|
| `deps` | `npm ci` |
| `builder` | `npm run db:generate` (SQLite default — only to satisfy typecheck and tracing), then `next build` |
| `runner` | Non-root user; copies `.next/standalone`, `.next/static`, `public`, `prisma/schema.prisma`, `prisma.config.ts`, `scripts/prisma-provider.ts` |

### The node_modules wrinkle

The standalone bundle's `node_modules` is a **traced subset** — it will not
contain the `prisma` CLI or `tsx`, both of which boot-time regeneration needs.

**Decision:** layer a full `npm ci --omit=dev` `node_modules` into the runner on
top of the standalone output. Correct and simple, at the cost of a fatter image
than standalone alone would produce. Slimming is a deliberate follow-up, not v1.

**Consequence:** `tsx` moves from `devDependencies` to `dependencies`. It is
genuinely a runtime dependency of the container — both `db:generate` and
`db:push` route through the TypeScript wrapper `scripts/prisma-provider.ts`.

The app directory is chowned to the non-root user so the regenerated client can
be written at boot.

## 3. Entrypoint

`docker-entrypoint.sh`, in order:

1. Validate the `DATABASE_URL` scheme, so a typo fails on line one of the boot
   rather than inside a Prisma subprocess. (`scripts/prisma-provider.ts` already
   rejects unknown schemes; this is the earlier, clearer message, and §6's boot
   guard is the same check for non-Docker deployments.)
2. `npm run db:generate` — client for the actual provider.
3. `npm run db:push` — apply schema. **Never** passes `--accept-data-loss`;
   Phase 2's stance (a data-loss prompt is a stop-and-think signal) is unchanged.
4. `exec node server.js`.

Each step fails loudly with an actionable message rather than starting a server
that will fail later and less clearly.

## 4. Compose files

Two self-contained files, each runnable with a single `-f`. Chosen over a
base-plus-override pair or compose profiles: the duplication is small and the
absence of magic is worth more to an operator reading it cold.

- **`docker-compose.yml`** — SQLite. One `app` service, named volume at
  `/app/data`, `DATABASE_URL=file:./data/clarity.db`, env from a local `.env`.
  The zero-config quickstart.
- **`docker-compose.postgres.yml`** — `app` + `postgres:16`, each with its own
  volume, app gated on `depends_on: condition: service_healthy`.

## 5. `/api/health`

A new route returning `{"status":"ok"}` and nothing else — no provider name, no
connection details, because it sits outside the auth gate. It performs a cheap
`SELECT 1` round-trip, so a 200 means *app and database* are up rather than just
that Node is listening.

**Requires** adding the path to the allowlist in `proxy.ts`, alongside `/login`
and the cal.com webhook. Without that it redirects to `/login` and every
healthcheck reports a lie.

Consumed by: compose healthchecks, Railway, and the CI boot-smoke job.

## 6. Env validation

Two routes into the deployment path:

1. **Boot guard extended.** `instrumentation.ts` already fails closed on a
   missing `SESSION_SECRET`/`CRM_PASSWORD` in production. Add `DATABASE_URL`
   scheme validation there, reusing `providerForUrl` from `lib/db-adapter.ts`. A
   typo'd URL should die at boot naming the accepted schemes, not somewhere deep
   inside Prisma.
2. **A documented env table** in the deploy guide: every variable, whether it is
   required in production, and what happens when it is missing.

## 7. CI

One new job, `Docker · boot smoke`: build the image once, boot it under both
compose files in turn, poll `/api/health` until 200 or timeout, dump container
logs on failure. This job *is* the phase's exit criterion — "a clean fork yields
a running instance" becomes a check rather than a claim.

- **Ruleset 19571458 must be updated in the same change.** The existing `verify`
  job names do not change, so this is an *addition* to the required-checks list,
  not a rename. Repo-settings change: get explicit approval before the
  `gh api PUT`.
- Wall-clock rises by roughly one image build; layer caching via
  `docker/build-push-action` with the GitHub Actions cache keeps it bearable.

## 8. Docs

New `docs/deploying.md` (Diataxis how-to): compose quickstart → env table →
provider switch → volumes and backup → Railway recipe → TLS caveat.

The README's "Deploying (future — not done yet)" section is replaced by a short
real summary linking to it. The existing "Scale & production data" section stays
put — Phase 2 earned it — and the deploy guide cross-references rather than
duplicates it.

## Testing

- **Unit:** `DATABASE_URL` scheme validation in the boot guard; `/api/health`
  handler over a mocked Prisma (matching the existing route-test pattern).
- **Integration (CI):** the boot-smoke job — a real image, real containers, real
  `db push`, real HTTP 200 — on both providers.
- The Phase 2 sqlite/postgres verify matrix is unchanged and still gates.

## Risks

| Risk | Mitigation |
|------|-----------|
| **Next standalone tracing may not resolve a client regenerated after build.** The traced server resolves `app/generated/prisma` as it existed at build time. | **Open the implementation plan with a Docker spike** that proves boot-time regeneration works on both providers before anything is built on top — mirroring Phase 2's spike gate. If it fails, fall back to the build-arg variant (P3-1's runner-up). |
| Native modules missing from the standalone trace | `serverExternalPackages`; the layered full `node_modules` also covers this |
| Image size regression from the layered `node_modules` | Accepted for v1; slimming recorded as follow-up |

## Out of scope (explicit decisions, not oversights)

- **Vercel — dropped**, deviating from the parent plan. It ignores the Dockerfile
  and standalone output entirely, cannot do SQLite at all, and needs its own
  differently-shaped Postgres-only path. A second deployment model to maintain,
  for a host this project does not use.
- **Fly.io — dropped** for want of demand, despite being the better SQLite fit.
- **TLS / reverse proxy — out of scope.** A VPS compose deploy realistically
  needs Caddy or Traefik in front, but shipping and maintaining that recipe is
  its own piece of work. The deploy guide states this plainly and points at both,
  rather than leaving a silent gap.
- **No published image** on GHCR or any registry — build-from-source only.
- **No multi-arch builds.**
- **No migrations** — Phase 2's `db push` stance holds unchanged.
- **Image slimming** — deferred follow-up (see §2).
