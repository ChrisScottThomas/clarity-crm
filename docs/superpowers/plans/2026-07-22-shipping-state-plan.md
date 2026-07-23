# Clarity CRM — Shipping-State Plan (white-label v1)

**Date:** 2026-07-22
**Goal:** Take the CRM from "feature-complete, locally proven" to a hardened, deployable, **white-label** product any advisory/consulting team can fork, configure, and run.

## Locked decisions (from /plan-eng-review)

| # | Decision | Choice | Consequence |
|---|----------|--------|-------------|
| D1 | White-label scope | **Generalize the domain** | Proprietary vocab becomes configurable/optional, not baked in |
| D2 | Config mechanism | **Deploy-time config file** (`clarity.config.ts`) | Keeps `as const` union types; no runtime settings UI; no data-migration hazard. Runtime editing = possible phase 2. |
| D3 | DB + deploy | **Support both SQLite + Postgres** | Provider-agnostic schema (portable, confirmed), CI matrix. Spike done (2026-07-22): dual-provider is feasible but needs **one generated client per provider** (build-time selection), not a runtime adapter swap — see Phase 2. |
| D4 | Auth model | **Harden shared-password** | Fail-closed secrets, real session tokens w/ expiry, login throttle. No per-user accounts (owners stay labels). |

## Current-state facts (grounding)

- 128 tests green, `tsc` clean. Feature surface already broad (pipeline, contacts, companies, opportunities, meetings, time-tracking, activity, workflows, analytics, theming).
- Proprietary vocab is **centralized** in `lib/constants.ts`, consumed in only `components/LeadForm.tsx`, `components/LeadCard.tsx`, `lib/analytics.ts` (+ `STAGES` in 5 files). Generalization is a refactor, not a rewrite.
- Auth token is a **constant** (`ok.HMAC("ok")`) — same value for all users, no expiry; `SESSION_SECRET` falls back to `'dev'` when unset (`lib/auth.ts:6`, `middleware.ts:5`).
- No deploy artifacts (no Dockerfile / CI / host config). README says "Deploying (future — not done yet)".
- DB uses `prisma db push` (no migration history); provider hardcoded `sqlite`. README:259 falsely claims Postgres is a `DATABASE_URL` swap — Prisma provider is compile-time and needs a different adapter.

---

## Phase 0 — Security hardening (blocker; do first; small)

Structural fixes that gate any real deployment. Independent of domain work.

1. **Fail-closed env validation.** New `lib/env.ts` that throws at boot if `SESSION_SECRET` or `CRM_PASSWORD` is missing/empty when `NODE_ENV=production`. Remove the `?? 'dev'` fallbacks in `lib/auth.ts` and `middleware.ts`.
2. **Real session tokens.** Replace constant token with a signed payload `{ nonce: random, iat }` (base64) + HMAC, and enforce an expiry (e.g. 30d) in both `verifyToken` (node `crypto`) and middleware `valid()` (WebCrypto) — keep the two implementations but share one token format.
3. **Login hardening.** Reject empty-password login (today `CRM_PASSWORD=""` lets an empty submit through). Add a simple failed-login throttle (per-IP, boring).
4. **Tests** for token expiry, forged/altered token rejection, missing-secret boot failure, empty-password rejection.

**Exit:** secrets fail closed, tokens expire and can't be forged, tests green.

## Phase 1 — Domain generalization (refactor; the D1/D2 scope)

Make the change easy (extract config) before making the easy change. Structural only — no behavior change for the default config.

1. **Create `clarity.config.ts`** (root, typed `as const`) holding tenant-editable vocab: `OWNERS`, `TRACKS`, `SOURCES`, `NEXT_ACTIONS`, `CONSTRAINTS` + colors, `ROADMAP_STAGES`, `BUSINESS_DEBTS` + colors, pipeline `STAGES`, and `BRAND` (name/colors/logo). Include a `diagnosticsEnabled` boolean.
2. **`lib/constants.ts` re-exports** derived union types from the config so `Constraint`, `Stage`, `Relationship`, `Owner` survive at compile time.
3. **Optional diagnostics.** When `diagnosticsEnabled` is false, hide the diagnostics section in `LeadForm`/`LeadCard` and drop constraint/debt/roadmap grouping from `analytics.ts`. Lead columns stay (nullable strings) — just unused.
4. **Config validation** so a malformed fork fails loudly at boot (non-empty lists, colors well-formed).
5. **Update consumers** (3 vocab files + 5 `STAGES` files) to read from config.
6. **Tests:** parametrize guardrail + analytics tests against config; add a "minimal config" test (different vocab, diagnostics off) that still builds and drives the pipeline. Guardrail (`client` never auto-set) must stay green.

**Exit:** a fork can change vocab/branding and toggle diagnostics by editing one file; default config is behavior-identical; tests green.

## Phase 2 — Persistence: support both SQLite + Postgres (D3)

✅ **Spike done (2026-07-22) — GO, but the original approach was wrong.** Verified empirically on Prisma 7.8 against a real `postgres:16` container (throwaway branch, discarded). Findings:

- ✅ The **schema is fully portable** — `db push` to Postgres succeeds with **zero schema changes** (no native enums; `attendees` is a JSON string; all scalars map cleanly).
- ✅ A client **generated for `postgresql`**, driven via `@prisma/adapter-pg`, passes every representative op (cuid defaults, relations + `include`, `DateTime` round-trip, `Float`/`Int`/`Boolean`, JSON-string field, `@unique`, `@updatedAt`, nested-relation `count`).
- ❌ **A single client cannot serve both DBs.** Prisma binds the provider into the *generated client* and enforces it at construction: pairing the sqlite-generated client with the pg adapter throws *"Driver Adapter `@prisma/adapter-pg` … is not compatible with the provider `sqlite` specified in the Prisma schema."* → the runtime adapter-swap in the old step 2 is **impossible**.
- ❌ **`provider` cannot be `env()`-selected** — `prisma validate` rejects it (`P1012`: "A datasource must not use the env() function in the provider argument"). So one schema file can't switch providers by env var alone.

**Revised approach — one generated client per provider, selected at build time:**

1. **Provider selection (key open decision):** because `provider` is a literal fixed at generate time, pick one of:
   - **(a) Two schema files** (`schema.sqlite.prisma` / `schema.postgres.prisma`) sharing the models — simple, but duplicates the model block.
   - **(b) One canonical schema + a build step** that rewrites the `provider` line from `DATABASE_URL`'s scheme before `prisma generate` — no duplication, adds a small codegen wrapper. *(Recommended; decide during Phase 2 design.)*
2. **`lib/db.ts`** picks the driver adapter from the `DATABASE_URL` scheme (`file:` → `@prisma/adapter-better-sqlite3`, `postgres://` → `@prisma/adapter-pg`). This part still holds — but it only works once the client was generated for the matching provider (step 1).
3. **Migrations are provider-specific** (`prisma migrate` emits different SQL per DB). Either keep committed history **per provider** (two `migrations/` dirs) or stay on `db push`. Document the per-provider generate/migrate steps.
4. **Fix README:259** false Postgres claim with the real steps.
5. **CI matrix:** run the suite against both providers (generate the right client per matrix leg).

**Design pass done (2026-07-22)** — spec: [`../specs/2026-07-22-phase-2-dual-db-design.md`](../specs/2026-07-22-phase-2-dual-db-design.md), implementation plan: [`2026-07-22-phase-2-dual-db.md`](2026-07-22-phase-2-dual-db.md). Locked: **P2-1** build-step rewrite of the one canonical schema (no duplicated schema files); **P2-2** stay on `db push` for both providers — no migration history in v1, with a documented trigger (first production data you can't recreate) to adopt per-provider `prisma migrate`; **P2-3** full CI matrix (sqlite + postgres legs, real `db push` + CRUD smoke each). Scale posture: SQLite = single-node/small-team, Postgres = production/multi-user, pool sized via `DATABASE_POOL_MAX`.

**Exit:** a deployer picks SQLite or Postgres via `DATABASE_URL` (+ the provider-selection step from #1); migrations reproducible; both pass CI.

## Phase 3 — Deploy & distribution

Code nobody can deploy isn't shipped.

1. **`next.config.ts`:** add `output: 'standalone'`.
2. **Dockerfile** (multi-stage) + **docker-compose** (volume for SQLite, or a Postgres service).
3. **Host recipes:** Railway / Vercel / compose. SQLite → mounted volume; Postgres → managed DB.
4. **CI (GitHub Actions):** typecheck + lint + test + build on PR (folds in the Phase 2 matrix).
5. Wire `.env` validation into the deploy docs.

**Exit:** `docker compose up` (or a one-click host) yields a running, persistent instance from a clean fork.

## Phase 4 — White-label polish & docs

1. Central BRAND/logo config; document favicon/public-asset swap.
2. Rewrite README "Deploying (future — not done yet)" → real deploy guide; add a "Fork → configure `clarity.config.ts` → deploy" how-to (Diataxis).
3. Generalize `prisma/seed.ts` (derive booking-link keys from config `OWNERS`; drop the alex/jordan specifics).

**Exit:** a stranger can fork, rebrand, reconfigure the domain, and deploy from docs alone.

---

## Sequencing

Phase 0 → 1 → (2 spike) → 2 → 3 → 4. Phases 0/1 are small and unblock everything; keep the Phase 1 structural extract in its own commit(s) separate from behavioral change (Beck). Phase 2 is the largest risk — spike gate before full build. Phase 3 depends on 2 (CI tests the generalized, dual-provider code).

## Out of scope (explicit)

- Runtime/in-app vocab editing (settings-UI) — deferred; config file covers v1.
- Per-user accounts / SSO — shared-password hardened is the v1 auth.
- Real external integrations (Graph/cal.com live providers, OAuth) — stay mocked behind `lib/integrations/` seams until a deployer wires them.
- Data import/migration tooling — deferred until post-ship (per product direction).
