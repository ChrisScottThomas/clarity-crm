# Clarity CRM — Testing & CI Plan

**Date:** 2026-07-22
**Goal:** Every PR is gated on automated checks that prove the code is correct
*and* that this white-label product carries no real secrets or attribution.
This doc records what runs today and what we build as the product grows.

## What runs today (on every PR + push to `main`)

Two workflows, added on `claude/clarity-ci`:

**`.github/workflows/ci.yml`**
- `verify` (blocking): `npm ci` → `prisma generate` → `tsc --noEmit` → `vitest run` (unit + mocked-integration) → `next build` (smoke, with dummy fail-closed secrets).
- `lint` (report-only): `eslint .`. Non-blocking until the pre-existing `no-explicit-any` debt on `main` is cleared (see task L1).

**`.github/workflows/security.yml`**
- `secret-scan` (blocking): gitleaks over full history (CLI binary, no license needed for this private repo), config in `.gitleaks.toml`.
- `white-label` (blocking): `scripts/check-white-label.mjs` — email-domain allowlist on shipped code, forbidden committed files (DB / `.env` / generated client), and a dormant real-name denylist read from the `WHITE_LABEL_DENYLIST` Actions secret.

## Test pyramid for this repo

| Layer | Status | What it is here | Tooling / trigger |
|---|---|---|---|
| **Smoke** | ✅ now | `next build` compiles; boot runs env + `clarity.config` validation | `next build` step in CI |
| **Unit** | ✅ now | Pure logic: `lib/analytics`, `lib/leads`, `lib/token`, `lib/login`, `lib/config-validation` | `vitest run` |
| **Integration (mocked)** | ✅ now | API route handlers over a **mocked** Prisma (`*-api`, `*-route`, sync, calcom) | `vitest run` |
| **Integration (real DB)** | ⏳ Phase 2 | Same handlers/`lib/leads` against a real SQLite (and Postgres) DB | Needs the Prisma-7 DB tooling from Phase 2 (spike-gated). See task I1 |
| **Data / white-label** | ✅ now | No secrets, no real emails/attribution, no committed data files | gitleaks + `check-white-label.mjs` |
| **Contract** | ⏳ later | The `lib/integrations` seams (Graph / cal.com) match provider payload shapes | Only meaningful once a **real** provider is wired (today they're mocked/out of scope). Build against recorded fixtures then. See task C1 |
| **E2E** | ⏳ later | Playwright: login → create lead → drag stage → analytics updates | Needs running app + seeded DB + a test login; couples to Phase 2 (DB) + Phase 3 (deploy). See task E1 |
| **UI/UX** | ⏳ later | a11y (axe) + visual regression | Low ROI on today's minimal inline-styled UI; revisit after Phase 4 branding. Fold a11y into E2E. See task U1 |

## Near-term tasks (do next; small)

- **T1 — Split unit vs integration.** Reorganize `tests/` into `tests/unit/**` and `tests/integration/**` (or use Vitest `projects`), then run them as two named CI steps so the pyramid is legible and either can gate independently. Pure move + config; no behavior change.
- **L1 — Clear the `no-explicit-any` debt** (`main` ships ~81 errors) so `lint` can flip from `continue-on-error` to blocking. Do it in one focused pass; type the pervasive `useState<any>` / `lead: any` / mock casts.
- **D1 — Set the `WHITE_LABEL_DENYLIST` secret.** Add the real founder/client/company names + domains as a repo Actions secret so the dormant check activates. Names stay out of the tree by design.
- **I1 — Real-DB integration harness.** As part of Phase 2: a Vitest setup that `prisma migrate`s a throwaway SQLite file, seeds it, and runs the route handlers against real Prisma. Later extend to a Postgres service container as a CI matrix leg.

## Later (build when the trigger arrives)

- **C1 — Contract tests** when the first real integration provider (Graph or cal.com) is wired: capture real payloads as fixtures, assert our parsers/handlers stay compatible.
- **E1 — E2E happy path** once Phase 2 (DB) + Phase 3 (deploy) land: Playwright against a built app with a seeded DB and a CI-only login, covering the core pipeline flow. Add an axe a11y assertion here.
- **U1 — Visual regression** after Phase 4 branding, if the UI grows beyond the current minimal styling.

## Principle

Prefer a small number of checks that are honestly labelled and actually gate,
over a wall of green badges that prove nothing. When a category isn't effective
yet (contract, e2e, real-DB), it's named here as a task with its trigger — not
faked in the workflow.
