# Phase 3 — Deploy & distribution design

**Date:** 2026-07-23
**Status:** Approved — **revised 2026-07-23 after the Docker spike refuted P3-1**
**Parent plan:** [`../plans/2026-07-22-shipping-state-plan.md`](../plans/2026-07-22-shipping-state-plan.md), Phase 3
**Builds on:** [`2026-07-22-phase-2-dual-db-design.md`](2026-07-22-phase-2-dual-db-design.md)
**Spike evidence:** [`../spikes/2026-07-23-phase-3-docker-spike.md`](../spikes/2026-07-23-phase-3-docker-spike.md) (R1–R5),
[`../spikes/2026-07-23-phase-3-runner-spike.md`](../spikes/2026-07-23-phase-3-runner-spike.md) (R6–R7)

## Revision history

| Date | Change |
|------|--------|
| 2026-07-23 | Original design: one universal image regenerating the Prisma client at boot |
| 2026-07-23 | **Revised** after spike: R1 refuted, R5 refuted as specified. Provider becomes a *build input*; the runner is slimmed |
| 2026-07-23 | **Revised** after the runner spike: R6 confirmed (dummy unreachable build URL is safe); R7 confirmed at 549 MB, but only via a self-contained tooling tree — `npm ci --omit=dev` refuted on size. §2 now names the mechanism |

## Context

Phase 2 shipped dual-provider persistence but left the deployment story unwritten:
the README's deploy section is still headed "future — not done yet". Code nobody
can deploy isn't shipped.

Phase 2 also left one constraint that dominates this design. Prisma bakes the
datasource `provider` into the generated client and rejects a mismatched driver
adapter at construction, so `app/generated/prisma` is provider-specific.

The original design tried to dissolve that constraint by regenerating the client
at container boot. **The spike proved this cannot work**, for two independent
reasons:

1. Next **inlines the generated client — schema text included — into
   `.next/server/chunks/*.js`** at build time. A client regenerated at boot is
   written to a directory the running server never reads. Grepping the built
   chunk finds `provider = "sqlite"` baked in.
2. Prisma 7's `prisma-client` generator emits **TypeScript**. All 18 regenerated
   files are `.ts`; `node server.js` could not load them even if they were not
   already bundled.

Observed consequence: a SQLite-built image run against Postgres regenerated
cleanly, applied schema successfully, served `/login` with a `200` — and returned
**500 on every actual query**.

**The constraint is therefore structural and permanent: the provider is fixed at
build time.** This design stops fighting it and makes it explicit instead.

**Audience:** both forkers and the maintainer, forkers first. The artifacts are
generic and self-hosting-first; `getclarity.win` deploys down the same path as
everyone else, which is what keeps the recipes honest.

## Locked decisions

| # | Decision | Choice |
|---|----------|--------|
| P3-1 | Provider handling in the image | **Provider is a build input** (`--build-arg DB_PROVIDER`) — one image variant per provider |
| P3-2 | First-boot schema | **Auto-apply** (`db push` from the entrypoint), zero manual steps. No `generate` at boot |
| P3-3 | Compose topology | **Two self-contained files** — each builds its own provider variant |
| P3-4 | Host recipes | **Generic compose/VPS + Railway.** Vercel and Fly.io dropped |
| P3-5 | Boot verification | **`/api/health`** (DB round-trip), polled by a new CI boot-smoke job |
| P3-6 | Provider mismatch | **Fail loudly at boot**, never at first query |

### Why P3-1 (provider as a build input)

The runner-up in the original design, now promoted. The spike verified it end to
end: an image generated *and* built for Postgres served `GET /api/leads` → `200`
and `POST /api/leads` → `201` against a real Postgres.

The cost the original design was trying to avoid — a confusing provider-mismatch
failure — is handled by P3-6 instead. A mismatch is now caught at boot with an
actionable message telling the operator to rebuild, rather than surfacing as a
500 on the first query.

**Forkers do not pay for this.** Each compose file declares its own build arg, so
`docker compose up` remains a single command and the provider variant is chosen
for the operator by the file they picked. The distinction only becomes visible
when switching provider, which requires a rebuild — documented in §8.

## 1. Standalone output

`next.config.ts` gains `output: 'standalone'`, plus `serverExternalPackages` for
`better-sqlite3` and `@prisma/adapter-pg`.

Spike note: the traced standalone tree already contains
`better-sqlite3/build/Release/better_sqlite3.node`, `pg`, and `@prisma/client`
(R2 confirmed). Native modules are **not** a reason to add anything to the runner.

## 2. Dockerfile

Three stages on `node:22-slim`. Debian, not Alpine: confirmed by spike (R3) —
`npm ci` completed in 11 s with no `node-gyp`, no `gyp info`, no
`make: Entering`.

| Stage | Does |
|-------|------|
| `deps` | `npm ci` |
| `builder` | Resolve `DB_PROVIDER` → a build-time `DATABASE_URL`; `npm run db:generate`; `next build` |
| `runner` | Non-root user; `openssl`; standalone bundle + the Prisma tooling needed for `db push` |

### Provider as a build arg

```
ARG DB_PROVIDER=sqlite   # sqlite | postgres
```

The builder maps it to a **dummy** build-time `DATABASE_URL` of the correct
scheme. It must be a dummy: a real URL would bake credentials into image history.

**`next build` requires `DATABASE_URL` to be set** — the spike found it
instantiates PrismaClient during page-data collection, and its absence is a hard
build failure (`Failed to collect page data for /api/leads/[id]/relationship`).

**R6 is confirmed**: an *unreachable* dummy URL is enough. `next build` only
*constructs* the client, it never connects. `postgres://build:build@127.0.0.1:1/build`
— port 1, closed by definition — emitted all 36 routes with exit 0 and no
connection attempt anywhere in the log, on the host and again inside Docker. So
the builder hardcodes a dummy URL per provider and **no real credentials enter
image history**, and no throwaway database is needed in the build.

### Runner contents

The original design layered a full `npm ci` `node_modules` into the runner. The
first spike refuted its justification (R2: the traced tree already has the native
modules) and measured its cost (R5: **927 MB** of a **1.25 GB** image).

**The runner ships the standalone bundle plus a self-contained tooling tree
holding only the `prisma` CLI and `tsx`, merged into `/app/node_modules`, with
the standalone tree copied last.** Measured: **549 MB**, `db push` exit 0,
`POST /api/leads` → `201` against a real Postgres.

```dockerfile
# Order is load-bearing: tooling first, standalone last, so the traced tree
# wins every conflict (otherwise the CLI's transitive react-dom/next win).
COPY --from=tooling --chown=node:node /opt/tooling/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/.next/standalone ./
```

Three constraints the R7 spike established, each from an observed failure:

1. **The tooling must live *at* `/app/node_modules`, not beside it.** A
   `/opt/tooling` directory on `PATH` failed twice over: `npx` ignores `PATH`
   and silently **network-installed prisma@7.9.0** against the 7.8.0 baked
   client, and `prisma.config.ts`'s `import "dotenv/config"` resolves from
   `/app`, where the traced tree has no `dotenv`.
2. **Never `RUN chown -R` in the runner** — it rewrites every file's metadata and
   so writes a second complete copy into the layer. Measured cost: **819 MB**,
   taking an otherwise-1.13 GB image to 1.95 GB. Use `COPY --chown=node:node`
   throughout and chown only `/app/data`.
3. **Pin the tooling stage to the app's exact Prisma version**, and have CI assert
   `prisma` and `@prisma/client` agree.

Two candidates from the pre-spike list are closed by measurement:
`npm ci --omit=dev` **does not slim** (833 MB vs 999 MB — `next`/`@next`/`@prisma`
are production dependencies and dominate), and precompiling the entrypoint to
drop `tsx` saves only **11 MB** of 241 MB, not worth the divergence.

The residual 298 MB is the Prisma CLI's own tree (`effect`, `@electric-sql`,
`@prisma/studio-core` — Studio machinery `db push` never touches). If 549 MB is
later judged too large, running migrations in a separate short-lived container is
the next lever; the standalone bundle is only 60.7 MB and is not the problem.

`openssl` is installed in the runner. Confirmed effective: the
`Prisma failed to detect the libssl/openssl version` warning that appeared on
every Prisma invocation in the first spike is absent from the slimmed runner's logs.

### `.dockerignore`

Lands with or before the Dockerfile, not after. The spike measured a
**751.70 MB** build context, most of it a macOS-native `node_modules` that
`COPY . .` layers over the Linux tree in the builder
(`better_sqlite3.node` = `Mach-O 64-bit bundle arm64`). It did not break that
build, and the doc records this as inferred rather than observed — but it is a
trap waiting for the first build step that touches a native addon.

Landed with Task 3; the runner spike measured the result — **1.32 MB** of build
context, down from 751.70 MB.

## 3. Entrypoint

`docker-entrypoint.sh`, in order:

1. **Verify the runtime `DATABASE_URL` scheme matches the provider baked into the
   image** (P3-6). On mismatch: exit non-zero naming both providers and telling
   the operator to rebuild with the right `DB_PROVIDER`. This is the check that
   replaces the original design's boot regeneration.
2. `npm run db:push` — apply schema. **Never** passes `--accept-data-loss`;
   Phase 2's stance (a data-loss prompt is a stop-and-think signal) is unchanged.
3. `exec node server.js`.

No `generate` step: the spike measured it at ~1 s and proved it has no effect on
the running server.

The baked provider is recorded in the image as an env var (`CLARITY_DB_PROVIDER`)
at build time, so step 1 needs no filesystem inspection.

## 4. Compose files

Two self-contained files, each runnable with a single `-f`, and each declaring
its own `build.args.DB_PROVIDER`:

- **`docker-compose.yml`** — SQLite (`DB_PROVIDER=sqlite`). One `app` service,
  named volume at `/app/data`, env from a local `.env`. The zero-config quickstart.
- **`docker-compose.postgres.yml`** — `DB_PROVIDER=postgres`, `app` + `postgres:16`,
  each with its own volume, app gated on `depends_on: condition: service_healthy`.

Healthcheck `start_period: 30s` — spike-measured worst case was 2.4 s to a
DB-backed 200, so 30 s is generous without being sloppy.

## 5. `/api/health`

A new route returning `{"status":"ok"}` and nothing else — no provider name, no
connection details, because it sits outside the auth gate. It performs a cheap
`SELECT 1` round-trip, so a 200 means *app and database* are up rather than just
that Node is listening.

**The spike proved this is not optional.** Throughout the entirely broken
Postgres run — every query 500ing — `/login` returned `200`. A healthcheck on any
non-DB endpoint would have certified a dead container as healthy.

**Requires** adding the path to the allowlist in `proxy.ts`, alongside `/login`
and the cal.com webhook, as an exact match.

## 6. Env validation

Three routes into the deployment path:

1. **Boot guard extended.** `instrumentation.ts` already fails closed on a
   missing `SESSION_SECRET`/`CRM_PASSWORD` in production. Add `DATABASE_URL`
   scheme validation there, reusing `providerForUrl` from `lib/db-adapter.ts`.
2. **Provider-match guard** (P3-6) in the entrypoint, per §3.
3. **A documented env table** in the deploy guide: every variable, whether it is
   required in production, and what happens when it is missing.

## 7. CI

One new job, `Docker · boot smoke`: build **both** provider variants, boot each
under its compose stack, poll `/api/health` until 200 or timeout, dump container
logs on failure. This job *is* the phase's exit criterion.

It must also assert the negative case: a SQLite-built image given a Postgres URL
**exits non-zero at boot** rather than starting. That is the regression test for
the exact failure the spike found, and without it P3-6 is an unverified promise.

- **Ruleset 19571458 must be updated in the same change** — an *addition* to the
  required-checks list. Repo-settings change: explicit approval before the
  `gh api PUT`.
- Two image builds now, not one; `docker/build-push-action` with the GitHub
  Actions cache keeps wall-clock bearable.

## 8. Docs

New `docs/deploying.md` (Diataxis how-to): compose quickstart → env table →
provider switch → volumes and backup → Railway recipe → TLS caveat.

The provider-switch section carries real weight now: switching provider means
**rebuilding the image** (`docker compose -f docker-compose.postgres.yml up -d --build`),
not just changing a URL. Say so plainly, and say what happens if you don't (the
container refuses to boot, by design).

The README's "Deploying (future — not done yet)" section is replaced by a short
real summary linking to it. The existing "Scale & production data" section stays
put — Phase 2 earned it — and the deploy guide cross-references rather than
duplicates it.

## Testing

- **Unit:** `DATABASE_URL` scheme validation in the boot guard; `/api/health`
  handler over a mocked Prisma; provider-match logic.
- **Integration (CI):** the boot-smoke job — real images, real containers, real
  `db push`, real HTTP 200 on both providers, plus the negative mismatch case.
- The Phase 2 sqlite/postgres verify matrix is unchanged and still gates.

## Risks

| # | Risk | How it gets proven | Status |
|---|------|--------------------|--------|
| R1 | Next standalone resolves a Prisma client regenerated after build | Spike: real query in the running container | **Refuted** — client is inlined into `.next/server/chunks`; generator emits TypeScript. Design revised |
| R2 | Native modules survive the standalone trace | Spike: writes through both drivers | **Confirmed** — `201` on both; traced tree already contains them |
| R3 | `node:22-slim` avoids compile-from-source | Spike: build-log grep | **Confirmed** — no `node-gyp`/`gyp info`/`make: Entering` |
| R4 | Boot work is fast enough for a healthcheck | Spike: measured | **Confirmed** — 1.5–2.4 s to a DB-backed 200 |
| R5 | Layered `node_modules` image size is acceptable | Spike: `docker history` | **Refuted as specified** — 1.25 GB, 927 MB of it unnecessary. Runner slimmed (§2) |
| R6 | `next build` succeeds with an *unreachable* dummy Postgres URL | Spike: build with a dummy URL pointing at nothing | **Confirmed** — `postgres://build:build@127.0.0.1:1/build` built all 36 routes, exit 0, no connection attempt; reproduced in Docker. No throwaway Postgres needed in the builder |
| R7 | The slimmed runner can still run `db push`, at an acceptable size | Spike: run `db push` in the slimmed image; measure it | **Confirmed for one mechanism only** — self-contained tooling tree merged into `/app/node_modules`: `db push` exit 0, `POST /api/leads` → `201`, **549 MB**. The preferred candidate (`npm ci --omit=dev`) is **refuted on size** — 833 MB. See §2 |

### Risk verification protocol

1. The implementation plan opens with a **spike task per unproven row**, before
   any production artifact is written.
2. A spike closes only on **observed output** — a build log, a container log, an
   HTTP response, a measured number — not on reasoning.
3. **This spec is updated with the findings** once the spikes land: each row's
   Status becomes Confirmed or Refuted with the evidence, and any refuted theory
   triggers a design revision here *before* implementation continues. This
   protocol has already paid for itself once — R1's refutation would otherwise
   have shipped a container that passes its healthcheck and 500s on every query.
4. Measured numbers become real values in the compose files and the deploy docs.
   No invented figures.

## Out of scope (explicit decisions, not oversights)

- **Vercel — dropped**, deviating from the parent plan. It ignores the Dockerfile
  and standalone output entirely, cannot do SQLite at all, and needs its own
  differently-shaped Postgres-only path.
- **Fly.io — dropped** for want of demand, despite being the better SQLite fit.
- **TLS / reverse proxy — out of scope.** The deploy guide states this plainly
  and points at Caddy or Traefik. It must also warn that the session cookie is
  `secure` in production, so **a bare-HTTP deployment cannot hold a login
  session** — an operator who ignores TLS gets a confusing symptom, not an
  obvious one.
- **No published image** on GHCR or any registry — build-from-source only.
- **No multi-arch builds.**
- **No migrations** — Phase 2's `db push` stance holds unchanged.
- **Multi-provider single image** — proven impossible (R1), not deferred.
