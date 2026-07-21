# Clarity CRM — Core Build Design Spec

**Date:** 2026-06-25
**Status:** Approved decisions captured; ready for implementation planning
**Scope of this spec:** Steps 1–2 of `CONTEXT.md` (core CRM + brand + auth), built locally with mocked endpoints. Later steps (3–7) are documented as a roadmap and scaffolded behind interfaces, not built in this pass.

---

## 1. Goal & guiding constraints

Build the Clarity CRM as a web application that runs **entirely locally with mocked endpoints first**, so every behaviour can be verified before anything goes online or touches a real API. The CRM replaces a Notion Pipeline Tracker as the commercial source of truth for Clarity (an advisory practice with two owners, Alex and Jordan).

Hard constraints carried from `CONTEXT.md`:

- Use the **seven pipeline stages exactly**, in order: New Lead → Contacted → Replied → Call Booked → Call Done → Closed Won → Closed Lost. Do not invent stages.
- Use the **exact field list, option lists, diagnostic model, and brand colours** from `CONTEXT.md`. Do not invent alternatives.
- **`Relationship` defaults to `contact` on every new record.** `client` is reserved and can **only** be set by hand — never inferred from stage or any automation. This is the single highest-risk rule in the system.
- **Login required** — the CRM holds confidential client data. No open access; no client data in logs, errors, or exports.
- **Booking links are configurable settings keyed by owner**, never hard-coded.
- **Do not seed any leads** — the pipeline ships empty; real data is imported later.

---

## 2. Decisions (confirmed)

| Decision | Choice | Rationale |
|---|---|---|
| Tech stack | **Next.js (App Router) + TypeScript** | One app for UI + API route handlers; deploys cleanly to Railway later. |
| Local storage | **SQLite via Prisma** | Real persistence locally; one connection-string change to Postgres for Railway. Prisma chosen over Drizzle for schema readability and migration ergonomics. |
| Auth (local) | **Shared password gate** | Env-var password, signed session cookie, real login flow. Upgrade path to per-user Alex/Jordan accounts noted for pre-launch. |
| First-pass scope | **Steps 1–2 (core CRM)** | Get something complete and on-brand working locally before migration/integrations. |
| Integrations | **Mocked behind swappable interfaces** | `BookingProvider`, `InboxProvider`, `EmailProvider`, `SessionNotesProvider` each have a mock impl now; real APIs slot in with no rearchitecting. |

---

## 3. Architecture

Single Next.js + TypeScript application.

```
clarity-crm/
  app/                      # App Router pages + API route handlers
    (auth)/login/
    pipeline/               # Kanban board
    leads/[id]/             # Lead profile
    companies/[id]/         # Company profile
    analytics/
    settings/
    api/
      leads/                # CRUD route handlers ("the endpoints")
      companies/
      settings/
      ...
  lib/
    constants.ts            # single source of truth: all enums/option lists
    db.ts                   # Prisma client
    auth.ts                 # session gate
    integrations/           # swappable interfaces + mock implementations
      booking.ts            # BookingProvider (+ MockBookingProvider)
      inbox.ts              # InboxProvider (+ MockInboxProvider)
      email.ts              # EmailProvider (+ MockEmailProvider)
      sessionNotes.ts       # SessionNotesProvider (+ MockSessionNotesProvider)
  prisma/
    schema.prisma
  components/               # UI components (Kanban, chips, forms, charts)
  styles/                   # Clarity brand tokens
  tests/                    # unit tests (Vitest)
  data/                     # local SQLite file (git-ignored)
  middleware.ts             # auth gate on all routes except /login + assets
  README.md
  CONTEXT.md
```

- **Endpoints:** Next.js route handlers under `app/api/*`. These are the "mocked endpoints run locally" — they read/write SQLite, not any external service.
- **Integration boundary:** anything external (cal.com, shared inbox, Resend, Krisp/Fathom) is accessed only through an interface in `lib/integrations/`. The default wiring uses the mock implementation. Swapping to a real implementation is a one-line provider change plus an env var.

---

## 4. Data model

Single source of truth for all option lists lives in `lib/constants.ts` and is reused by Prisma seed/validation, UI dropdowns, and tests.

### Lead
Core fields (from Notion schema):
- `name`, `companyName`, `email`, `linkedinUrl`, `website`
- `owner` — `Alex` | `Jordan`
- `track` — `Strategic / Commercial` | `Operations / Teams`
- `source` — Warm DM | Referral | Content Inbound | FounderON | Cold Outreach | LinkedIn | Inbound | Event | Networking
- `stage` — the seven stages
- `nextAction` — Research contact | Send message | Follow up | Book call | Prepare call | Send recap | Send proposal | Awaiting reply | Nurture | No action
- `relationship` — `contact` | `prospect` | `client` | `peer` | `advisory` | `inactive` — **default `contact`**
- `monthlyValue` (£, integer/decimal)
- Dates: `contactAdded`, `dateContacted`, `callDate`, `followUpDate`, `closedDate`
- `intakeFormReceived` (boolean)
- `notes` (text)

Diagnostic fields (new — make this Clarity's CRM):
- `scalingRoadmapStage` — 0–9, store number + name (e.g. `3 (Stabilize)`)
- `primaryConstraint` — Money | Market | Model | Manpower | Metrics | More (6 Ms)
- `businessDebt` — Ignorance debt | Avoidance debt | Experience debt
- `graduationCriterion` — free text

Relations: `companyId` (optional FK → Company); `openLoops` (1-to-many).

### Company
- `name`, `website`, plus profile notes; has many Leads.

### OpenLoop
- `leadId` FK, `description`, `direction` (owed-to / owed-from), `done` (bool), `dueDate`. Schema present now; lightweight surfacing on the lead profile. Full global panel is Step 3 work.

### Setting
- key/value store. Seeded keys: `booking_link_shared` (= `https://cal.com/alex-jordan/discovery`), `booking_link_alex`, `booking_link_jordan`. Per-owner links default to the shared link until set on the Settings screen.

---

## 5. Screens

1. **Login** — shared-password gate; redirects to pipeline on success.
2. **Pipeline (Kanban)** — 7 columns in order, drag a card between stages (persists via API). Card shows name, company, owner, and a Primary-constraint chip coloured in the 6 Ms palette. Empty by default.
3. **Lead profile** — every field viewable/editable. A `client` is rendered visually distinct from a `prospect` (e.g. a clear badge/border treatment), so the relationship status reads at a glance. Lightweight Open Loops list.
4. **Company profile** — company detail + list of linked leads.
5. **Analytics** — leads by stage; DM→call rate; call→client rate; leads by owner (Alex vs Jordan); leads by source; current MRR (sum of `monthlyValue` where stage = Closed Won); leads by Primary constraint using the 6 Ms colours.
6. **Settings** — edit per-owner booking links (Shared / Alex / Jordan); changes take effect with no code change.

---

## 6. Brand (exact values from CONTEXT.md)

- Background: Clarity midnight `#020f31`; text white `#ffffff`; single accent Clarity blue `#429edb` (active stage / buttons / links — one emphasis element per view, not blue everywhere).
- Font: Helvetica / Helvetica Neue, fallback Inter (Google Font). No other typefaces.
- 6 Ms constraint colours (used **only** where the UI references the 6 Ms, never decoratively):
  More `#56d4e8`, Money `#ffde59`, Metrics `#a78bfa`, Manpower `#ff3131`, Market `#dc8c32`, Model `#e850a0`. Debt colours: Ignorance `#5271ff`, Avoidance `#34d399`.
- Canonical links: website `https://example.com`, contact `hello@example.com`.

---

## 7. Clarity-specific guardrails (enforced in code + tested)

- **Relationship default:** create path always sets `contact` when unspecified. Covered by a dedicated test.
- **`client` never auto-set:** no code path (stage change, import, automation) may set `relationship = client`. It is settable only via an explicit manual edit action. Covered by a dedicated test that drives a lead to Closed Won and asserts relationship is unchanged.
- **Stage order logic:** transitions validated against the canonical 7-stage list. Tested.
- **MRR calculation:** sum of `monthlyValue` over Closed Won only. Tested.
- **Booking-link fallback:** per-owner link returns the shared link when unset. Tested.
- **Confidentiality:** no client fields in server logs or error responses; auth gate on all non-public routes.

---

## 8. Testing & workflow

- **Test runner:** Vitest. Unit tests for the five guardrails above plus core CRUD validation.
- **Version control:** `git init`; work on branch `feat/core-crm`, not main; raise a PR for review before merge (CONTEXT.md Definition of Done).
- **README:** how to install, run locally, run tests, and (placeholder section) how to deploy to Railway later.
- **No seed leads.** A minimal settings seed only (booking links).

---

## 9. Roadmap — deferred, documented, scaffolded (not built this pass)

| Step | Item | How this pass prepares for it |
|---|---|---|
| 3 | Notion migration (Pipeline Tracker, Open Loops) | Schema fields already match Notion 1:1; import will default `relationship = prospect`, never auto-`client`; dedupe on email then name. |
| 4 | Diagnosis panel (four-line playback, Knobs/Track/Watch; narrative read from Brain `.md`) | Commercial fields already on the Lead; panel reads structured fields from CRM, narrative from `.md` later. |
| 5a | cal.com bookings → Call Booked | `BookingProvider` interface + mock; Owner derived from which owner's link; reads links from Settings. |
| 5b | hello@example.com shared inbox (read/log only) | `InboxProvider` interface + mock. |
| 5c | Krisp / Fathom session notes | `SessionNotesProvider` interface + mock; separate "Session notes" section. |
| 6 | Resend email notifications (Closed Won, digests) | `EmailProvider` interface + mock. |
| 7 | Background automations (stale flag, follow-up nudges, weekly metrics) | Pure functions over the data model; added as scheduled jobs on Railway. |

Deploy to Railway (Step 2 hosting) happens **after** local verification — swap SQLite→Postgres, keep auth on in production.

---

## 10. Definition of done (this pass)

- [ ] Runs locally with mocked endpoints; pipeline empty; all six screens working and on-brand.
- [ ] Relationship defaults to `contact`; `client` never auto-set (re-verified).
- [ ] Tests pass: relationship-default, client-never-auto-set, stage-transition, MRR, booking-link fallback.
- [ ] Built on `feat/core-crm` branch; PR raised; README written.
- [ ] No client data in logs/errors; auth gate active.
- [ ] No secrets committed; booking links editable from Settings.
