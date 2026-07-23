# Clarity CRM

An open-source CRM web app for small advisory, consulting, and services teams. It provides a commercial source of truth: a kanban pipeline, contacts directory, lead and company profiles, conversations, meetings, time tracking, analytics, and AI lead scoring. The build runs entirely locally with every external integration mocked, so the whole system can be exercised before anything goes online.

> **White-label this CRM.** Everything that identifies a specific team is placeholder data you can change. Team members live in `OWNERS` in [`lib/constants.ts`](lib/constants.ts) (`Alex`, `Jordan` by default); mailboxes are set via the `TEAM_EMAILS` env var; branding (name, colours) lives in `BRAND` in the same file and `styles/tokens.css`. Fork it, swap those, and it's yours. See [Fork & white-label](#fork--white-label) below.

## Documentation

Full reader-facing docs live in [`docs/`](docs/README.md), organised by the Diataxis framework:

- **[Getting Started tutorial](docs/tutorial-getting-started.md)** — clone → running CRM → first lead → first email sync.
- **How-to:** [Deploying](docs/deploying.md) (Docker Compose quickstarts, env vars, backups, Railway) · [Integrations](docs/howto-integrations.md) (Outlook email/calendar sync, cal.com webhook, going live) · [Workflows](docs/howto-workflows.md) (automation rules).
- **Reference:** [Data Model](docs/reference-data-model.md) · [HTTP API](docs/reference-api.md).
- **Explanation:** [Architecture](docs/explanation-architecture.md) — the mock-first seam, the pure-core/effectful-shell split, and the `client`-never-auto-set guardrail.

## Tech stack

- **Next.js 16** (App Router) + **TypeScript**
- **Prisma 7** + **SQLite** (via the `better-sqlite3` adapter)
- **Vitest** for unit tests
- **dnd-kit** for the kanban drag-and-drop
- **@anthropic-ai/sdk** for AI lead scoring (optional — see below)

## Prerequisites

- **Node 18+** (built and tested on Node 22)

## Setup

```bash
npm install
npm run db:push      # creates the SQLite DB at data/clarity.db and applies the schema
npm run db:generate  # generates the Prisma client (required after every schema change)
npm run db:seed      # seeds booking-link settings only — NO leads
```

> **After every `git pull` or schema change**, re-run `npm run db:generate`. The generated client at `app/generated/prisma/` is gitignored and not included in the repo. Skipping this step causes runtime errors like `Cannot read properties of undefined (reading 'findMany')` on any page that queries the database.

Environment variables live in `.env.local` (git-ignored — you must create it).

| Key | Example value | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `file:./data/clarity.db` | SQLite file path |
| `DATABASE_POOL_MAX` | _(unset — pg default, 10)_ | Postgres only: max connections in the app's pool. Lower it (e.g. 3–5) on serverless or many-replica deployments so combined replicas stay under the database's connection limit. |
| `CRM_PASSWORD` | `clarity-dev` | Shared login password |
| `SESSION_SECRET` | `dev-only-change-before-online` | HMAC key for the session cookie |
| `TEAM_EMAILS` | `alex@example.com,jordan@example.com` | **Optional** — your team's mailboxes (comma-separated), excluded from lead matching. Defaults to placeholders |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | **Optional** — required only for AI lead scoring |

**Never commit real secrets.** The dev defaults above are safe locally only.

Example `.env.local`:

```
DATABASE_URL="file:./data/clarity.db"
CRM_PASSWORD="clarity-dev"
SESSION_SECRET="dev-only-change-before-online"
# Optional — get your key from https://console.anthropic.com
ANTHROPIC_API_KEY=your-key-here
```

## Run

```bash
npm run dev          # http://localhost:3000
```

Log in with the value of `CRM_PASSWORD`. **The pipeline ships empty by design** — the Notion migration (Step 3 on the roadmap) is not built yet.

## Test

```bash
npm test             # Vitest — 128 tests across 23 files
```

Test coverage:

- **relationship default** — new leads default to `contact`
- **client-never-auto-set** — `client` can only be set by explicit manual edit, never by stage change or import
- **stage transitions + closedDate lifecycle**
- **MRR from Closed Won** only
- **analytics reducers** — by stage / owner / constraint, conversion rates
- **booking-link fallback**
- **API exports** — all route handlers verified to export correct HTTP methods
- **theme cookie API** — POST handler verified
- **schema extensions** — Meeting, TimeEntry, Conversation, WorkflowRule models verified
- **AI score module** — `scoreLead` function exported with correct shape

## Continuous integration

Every PR (and every push to `main`) runs two workflows:

- **CI** ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) — **blocking (per provider — sqlite & postgres matrix):** `npm run db:generate` → `tsc --noEmit` → `vitest run` → `db push` + CRUD smoke → `next build`. **Report-only:** ESLint and the docs-updated check, which annotate but exit 0 so a red check always means a real failure.
- **Security** ([`.github/workflows/security.yml`](.github/workflows/security.yml)) — **blocking:** gitleaks secret scan and the white-label integrity guard ([`scripts/check-white-label.mjs`](scripts/check-white-label.mjs)).

**Docs are updated with every PR.** The report-only docs check ([`scripts/check-docs-updated.mjs`](scripts/check-docs-updated.mjs)) posts a warning when product code changes but no `docs/**` or markdown file does — a prompt to update the docs or note in the PR why none is needed. The [pull request template](.github/PULL_REQUEST_TEMPLATE.md) carries the same checklist. Both report-only checks are wired to flip to blocking later (lint once its debt clears; docs via `DOCS_CHECK_STRICT=1`).

## Screens

### Main

| Screen | Route | What it does |
| --- | --- | --- |
| **Contacts** | `/contacts` | Two-panel directory: left list (All / By Company), right detail panel with contact info, deal details, AI score |
| **Lead Pipeline** | `/pipeline` | Kanban board; drag leads between 7 stages |
| **Opportunities** | `/opportunities` | Deal-value lens: pipeline total, win rate, active deals table |
| **Calendar** | `/calendar` | Upcoming activity (call dates, follow-ups, close dates, meetings) — next 30 days |
| **Meetings** | `/meetings` | Log and view meetings, linked to leads |

### Activity

| Screen | Route | What it does |
| --- | --- | --- |
| **Activity** | `/activity` | Global timeline of notes, calls, and synced emails; **↻ Sync email** button |
| **Activity thread** | `/activity/[leadId]` | Per-lead timeline of notes, calls, and emails |
| **Time Tracking** | `/time-tracking` | Log time entries against leads; summary stats |

### Manage

| Screen | Route | What it does |
| --- | --- | --- |
| **Analytics** | `/analytics` | MRR, conversion rates, breakdowns by stage/owner/source/constraint |
| **Workflows** | `/workflows` | Rule builder UI (trigger → action pairs); execution engine is future work |
| **Settings** | `/settings` | Editable per-owner booking links |

### Lead profile

`/leads/[id]` — card-based layout showing:
- Contact info, deal details, AI qualification score + recommendation
- Open loops, recent meetings, notes
- Edit form
- **⚡ Score Lead** button — triggers AI scoring (requires `ANTHROPIC_API_KEY`)

## AI lead scoring

When `ANTHROPIC_API_KEY` is set, any lead can be scored by clicking **⚡ Score Lead** on its profile, or via `GET /api/leads/[id]/score`. The scorer uses **Claude Haiku** and returns:

- A 0–100 score
- A label: **Cold** (0–49), **Warm** (50–79), or **Hot** (80–100)
- A 2–3 sentence qualification summary
- A recommended next action

Scores are stored on the lead record and displayed in the contacts directory and lead profile. Without `ANTHROPIC_API_KEY`, the button appears but scoring fails gracefully (error logged server-side, lead unchanged).

## Light / dark mode

The UI defaults to dark mode. Click the ☀️ / 🌙 icon at the bottom of the sidebar to toggle. The preference persists in a `theme` cookie — each browser/device keeps its own setting independently.

## The Clarity guardrails

- **Relationship defaults to `contact`** on every new lead.
- **`client` is NEVER set automatically** — not by a stage change, not by import. Only by explicit manual edit. Enforced in `lib/leads.ts` and the Prisma schema default, covered by tests.
- **The 7 pipeline stages** (New Lead → Contacted → Replied → Call Booked → Call Done → Closed Won → Closed Lost) and all option lists come from `CONTEXT.md` and live in one place: `lib/constants.ts`.

## Architecture

Route handlers live under `app/api/*`, backed by SQLite through Prisma. All external integrations are **mocked behind interfaces in `lib/integrations/`** — cal.com booking, shared inbox, Resend email, Krisp/Fathom session notes. Nothing calls any external API except the optional `ANTHROPIC_API_KEY` path for lead scoring.

Auth is a single shared password in `middleware.ts`: a successful login sets an HMAC-signed `clarity_session` cookie (keyed by `SESSION_SECRET`). Every route is gated except `/login`, Next internals (`/_next`, `/favicon`), and `/api/integrations/calcom/webhook` — the webhook self-authenticates via its `x-cal-signature-256` HMAC header instead of the session cookie.

Theme is applied server-side via `data-theme` on `<html>`, read from the `theme` cookie in `components/ThemeProvider.tsx`.

## Project structure

```
app/
  api/                  Route handlers (leads, companies, contacts, meetings,
                        time-entries, conversations, workflows, theme, score)
  contacts/             Directory + detail panel
  pipeline/             Kanban board
  leads/                Lead profile ([id]) + new lead form
  companies/            Company list + profiles
  analytics/            Conversion + MRR dashboard
  calendar/             Upcoming activity timeline
  meetings/             Meeting log
  time-tracking/        Time entry log
  opportunities/        Deal-value pipeline view
  conversations/        Conversation threads per lead
  workflows/            Automation rule builder
  settings/             Booking-link settings
  login/                Auth gate

lib/
  constants.ts          Stages, owners, sources, relationships, constraints, colours
  leads.ts              Guarded lead build / stage / relationship helpers (guardrails)
  analytics.ts          MRR + conversion reducers
  settings.ts           Booking-link resolution
  ai-score.ts           Claude Haiku scoring logic
  db.ts, auth.ts        Prisma client + auth helpers
  integrations/         Mocked cal.com / inbox / email / session-notes interfaces

components/
  Sidebar.tsx           Fixed sidebar nav (server component)
  SidebarLink.tsx       Active-state nav link (client component)
  ThemeProvider.tsx     getTheme() — reads theme cookie server-side
  ThemeToggle.tsx       ☀️/🌙 toggle button (client component)
  GlobalSearch.tsx      Header search → contacts directory (client component)
  KanbanBoard.tsx       Drag-and-drop kanban
  LeadCard.tsx          Kanban card
  LeadForm.tsx          Lead create/edit form
  MeetingForm.tsx       Log meeting popup form (client component)
  TimeEntryForm.tsx     Log time popup form (client component)
  ConversationEntryForm.tsx  Log note/call/email (client component)
  WorkflowForm.tsx      Create workflow rule (client component)
  AnalyticsCharts.tsx   Analytics chart components
  SettingsForm.tsx      Settings edit form
  NewCompany.tsx        Company create form

styles/
  tokens.css            CSS variables — dark (default) + [data-theme="light"] overrides
  layout.css            App shell, sidebar, .card, .data-table, .page-body, form classes

prisma/
  schema.prisma         Models: Lead, Company, OpenLoop, Setting, Meeting,
                        TimeEntry, Conversation, ExternalEvent, WorkflowRule,
                        WorkflowRun
  seed.ts               Seeds booking-link settings only

tests/                  Vitest unit tests (128 tests, 23 files)
docs/superpowers/       Design specs + implementation plans
```

## API reference

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET / POST | `/api/leads` | List / create leads |
| GET / PATCH / DELETE | `/api/leads/[id]` | Read / update / delete a lead |
| POST | `/api/leads/[id]/score` | AI-score a lead (JSON response) |
| GET | `/api/leads/[id]/score` | AI-score then redirect to lead profile |
| PATCH | `/api/leads/[id]/relationship` | Set relationship (`contact` / `deposit` / `client`) |
| GET / POST | `/api/companies` | List / create companies |
| PATCH | `/api/companies/[id]` | Update a company |
| GET | `/api/contacts` | Search leads by name / company / email |
| GET / POST | `/api/meetings` | List / create meetings |
| GET / POST | `/api/time-entries` | List / create time entries |
| GET / POST | `/api/activity` | List / create activity (conversation) entries |
| GET / POST | `/api/workflows` | List / create workflow rules |
| PATCH / DELETE | `/api/workflows/[id]` | Toggle / delete a workflow rule |
| POST | `/api/workflows/run` | Run the time-based (scheduled) workflow sweep |
| POST | `/api/integrations/outlook/email/sync` | Sync Outlook email → Activity feed |
| POST | `/api/integrations/outlook/sync` | Sync Outlook calendar → external events |
| POST | `/api/integrations/calcom/webhook` | cal.com booking receiver (HMAC-signed, session-exempt) |
| POST | `/api/theme` | Set theme cookie (`light` or `dark`) |
| GET / PATCH | `/api/settings` | Read / update settings (booking links, cal.com secret) |

Login is a Next.js **server action** (`app/login/actions.ts`), not an API route — it compares the submitted password to `CRM_PASSWORD` and sets the session cookie. See [docs/reference-api.md](docs/reference-api.md) for the full, verified surface.

## Fork & white-label

This repo ships with placeholder identity so you can make it your own:

1. **Team members** — edit `OWNERS` in [`lib/constants.ts`](lib/constants.ts). The two defaults (`Alex`, `Jordan`) map to the two `TRACKS`. Update the per-owner booking-link keys in `prisma/seed.ts` and `components/SettingsForm.tsx` if you rename them.
2. **Team mailboxes** — set `TEAM_EMAILS` in `.env.local` (comma-separated). These are excluded when matching a synced email to a lead so an internal recipient never looks like the counterparty.
3. **Branding** — the app name, the `BRAND` colours (`lib/constants.ts`), and the CSS variables in `styles/tokens.css` are all yours to change.
4. **Mock data** — the sample calendar/inbox entries in `lib/integrations/{calendar,inbox}.ts` use fake `@example.com` / `*.example` addresses. Replace or ignore them; they only appear until you wire up the real Microsoft Graph provider.
5. **Secrets** — set your own `CRM_PASSWORD` and `SESSION_SECRET`. Never commit real values; the defaults are for local dev only.

No real customer data ships in this repo — the pipeline is empty by design and all sample addresses are placeholders.

## License

Released under the [MIT License](LICENSE) — fork it, white-label it, deploy it.

## Deploying

The app ships as a Docker image built from this repo, with a Compose file per database. Put `SESSION_SECRET` and `CRM_PASSWORD` in a `.env` at the repo root (Compose reads that file — see [`.env.example`](.env.example)), then:

```bash
docker compose up -d                                    # SQLite
docker compose -f docker-compose.postgres.yml up -d     # Postgres (also needs POSTGRES_PASSWORD)
```

Either way the app is on **http://localhost:3000**, and `/api/health` returns `{"status":"ok"}` once the database is reachable.

**Each image is built for exactly one provider.** Next inlines the generated Prisma client into the server bundle at build time, so switching between SQLite and Postgres means rebuilding (`… up -d --build`), not editing `DATABASE_URL`. Point a mismatched URL at an existing image and the container refuses to boot and prints the rebuild command — deliberately, because the alternative is an app that serves pages and fails every query.

Full guide — environment variables, volumes and backup, a Railway recipe, and why TLS is the operator's job: **[docs/deploying.md](docs/deploying.md)**.

### Scale & production data

**Choosing a database.** SQLite is the small-scale default: one node, one team, modest write concurrency, and the database is a single file — put it on a mounted volume, and backup is copying the file. Postgres is the production/scale choice: concurrent multi-user writes, horizontal app scaling against one shared database, and managed hosting gives you backups, high availability, and point-in-time recovery. If you expect more than one app instance or can't afford to lose data between file copies, use Postgres.

**Connection pooling (Postgres).** The app holds a connection pool sized by `DATABASE_POOL_MAX` (default: pg's 10). Long-lived containers can keep the default; serverless or many-replica deployments should lower it so `replicas × pool size` stays under the database's connection limit.

**Schema changes on a live database.** This project applies schema with `prisma db push` and keeps no migration history (v1 stance — every instance starts empty). Additive changes apply cleanly. Destructive changes (dropping/retyping a column) will make `db push` demand `--accept-data-loss`:

- **Back up before any schema change on a database with real data** (SQLite: copy the file; Postgres: `pg_dump` or your provider's snapshot).
- **Never script or blindly pass `--accept-data-loss`.** A data-loss prompt is a stop-and-think signal.

**When to adopt real migrations.** The trigger is explicit: **the first production instance holding data you cannot recreate**. At that point, switch from `db push` to `prisma migrate` with a per-provider migration history (`prisma migrate diff` can bootstrap the initial migration from the live schema for each provider). Until then, migration machinery is deliberate YAGNI.

## Roadmap (deferred)

- **Notion migration** (Step 3) — import the real pipeline
- **Diagnosis panel** (Step 4)
- **cal.com integration** (Step 5a)
- **Shared inbox** (Step 5b)
- **Krisp/Fathom session notes** (Step 5c)
- **Resend notifications on stage change** (Step 6)
- **Background workflow automation engine** — execution layer for the Workflows rules (Step 7)
- **Mobile responsive layout**
- **Company-level AI chatbot**

## Known notes

- **Next 16 deprecation warning.** `middleware.ts` prints a `middleware` → `proxy` notice at build time. It is harmless.
- **Prisma client is git-ignored.** `app/generated/prisma` must be regenerated with `npm run db:generate` after every fresh clone or schema change. `npm run db:push` applies schema migrations but does NOT regenerate the client — run both.
- **Workflow rules are UI-only.** The Workflows page stores rules in the database but does not execute them — the execution engine is deferred.
