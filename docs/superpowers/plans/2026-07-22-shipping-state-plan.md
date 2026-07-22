# Clarity CRM — Shipping-State Plan (white-label v1)

**Date:** 2026-07-22
**Goal:** Take the CRM from "feature-complete, locally proven" to a hardened, deployable, **white-label** product any advisory/consulting team can fork, configure, and run.

## Locked decisions (from /plan-eng-review)

| # | Decision | Choice | Consequence |
|---|----------|--------|-------------|
| D1 | White-label scope | **Generalize the domain** | Proprietary vocab becomes configurable/optional, not baked in |
| D2 | Config mechanism | **Deploy-time config file** (`clarity.config.ts`) | Keeps `as const` union types; no runtime settings UI; no data-migration hazard. Runtime editing = possible phase 2. |
| D3 | DB + deploy | **Support both SQLite + Postgres** | Two adapters, provider-agnostic schema, CI matrix. Prisma dual-provider is the main risk — spike first. |
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

## Phase 2 — Persistence: support both SQLite + Postgres (D3; spike first)

⚠️ **Risk:** Prisma dual-provider is awkward (provider is compile-time; migrations are provider-specific). **Spike before committing the phase.**

1. **Spike:** confirm the Prisma 7 dual-provider approach — env-selected provider + driver adapter (`@prisma/adapter-better-sqlite3` vs `@prisma/adapter-pg`). Schema is already provider-agnostic (no native enums; `attendees` stored as JSON string) — verify nothing else blocks Postgres.
2. **`lib/db.ts`** selects the adapter from the `DATABASE_URL` scheme (`file:` → SQLite, `postgres://` → pg).
3. **Migrations:** convert `db push` → `prisma migrate` with committed migration history (document per-provider generate/migrate steps).
4. **Fix README:259** false Postgres claim with the real steps.
5. **CI matrix:** run the suite against both providers.

**Exit:** a deployer picks SQLite or Postgres via `DATABASE_URL`; migrations reproducible; both pass CI.

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
