# Reference: HTTP API

Every route handler under [`app/api/`](../app/api), backed by SQLite through Prisma. This is the complete, verified surface — 18 route files. Field shapes are pulled directly from the handlers.

Data shapes referenced here (`Lead`, `Conversation`, etc.) are defined in [Reference: Data Model](reference-data-model.md).

## Authentication

All requests carry the `clarity_session` cookie, an HMAC-signed token set at login. `middleware.ts` redirects any unauthenticated request to `/login` **except**: `/login`, `/_next/*`, `/favicon*`, and `/api/integrations/calcom/webhook` (which self-authenticates via the cal.com signature header).

There is **no `POST /api/auth/login` endpoint.** Login is a Next.js server action — [`app/login/actions.ts`](../app/login/actions.ts) — that compares the submitted password to `CRM_PASSWORD` and, on success, sets the session cookie and redirects to `/pipeline`.

Responses are JSON unless noted. Validation failures return `400` with `{ "error": "<reason>" }`; missing records return `404`.

## Leads

### `GET /api/leads`
List all leads, each with its `company`, newest `contactAdded` first.

### `POST /api/leads`
Create a lead. Body: at minimum `{ "name": "..." }`, plus any Lead field.
- Passes the body through `buildNewLead()`, which **enforces the relationship default and blocks `client`** (a requested `relationship: "client"` is coerced to `contact`).
- Fires the `lead.created` workflow event.
- Returns the created lead, `201`.

### `GET /api/leads/[id]`
Read one lead including `company` and `openLoops`. `404` if not found.

### `PATCH /api/leads/[id]`
Update a lead. Body: any subset of Lead fields.
- If `stage` is present, the change is routed through `applyStageChange()` (stamps `stageChangedAt`, sets/clears `closedDate`, never touches `relationship`).
- If `relationship` is present, it is routed through `setRelationshipManually()`.
- When `stage` actually changes, fires the `lead.stage_changed` workflow event.
- Returns the updated lead.

### `DELETE /api/leads/[id]`
Delete a lead (and its open loops first). Returns `{ "ok": true }`.

### `POST /api/leads/[id]/score`
AI-score the lead via Claude Haiku, persist `aiScore` / `aiScoreLabel` / `aiSummary` / `aiRecommendation`, fire the `lead.score_updated` workflow event, and return the updated lead as JSON. Requires `ANTHROPIC_API_KEY`; returns `500 { "error": "scoring failed" }` on any scoring error.

### `GET /api/leads/[id]/score`
Same scoring side effect, but **redirects** to `/leads/[id]` afterwards (the form-friendly variant behind the ⚡ Score Lead button). Scoring errors are swallowed (logged server-side) so the redirect always happens. Redirects to `/contacts` if the lead is not found.

### `PATCH /api/leads/[id]/relationship`
Set the relationship directly — this is the **manual-edit path** that _can_ set `client`.
- Body: `{ "relationship": "contact" | "deposit" | "client" }`.
- Only those three values are accepted; anything else returns `400`.
- Returns the updated lead.

> Note: this endpoint's allow-list (`contact` / `deposit` / `client`) is narrower than and partly divergent from the canonical `RELATIONSHIPS` list in `lib/constants.ts` (which has no `deposit`). It exists specifically to let a human promote a lead to `client`, which the create/stage paths never do.

## Companies

### `GET /api/companies`
List companies, each including its `leads`.

### `POST /api/companies`
Create a company. Body: `{ "name" (required), "website"?, "notes"? }`. Returns `201`.

### `GET /api/companies/[id]`
Read one company including `leads`. `404` if not found.

### `PATCH /api/companies/[id]`
Update `name` / `website` / `notes` (only those keys are applied). Returns the updated company.

## Contacts

### `GET /api/contacts?q=<query>`
Search leads by `name`, `companyName`, or `email` (case-insensitive `contains`), sorted by name. Omit `q` to list all. Each result includes its `company`.

## Meetings

### `GET /api/meetings`
List meetings, each with a minimal `lead` (`id`, `name`), newest `date` first.

### `POST /api/meetings`
Create a meeting. Body: `{ "title" (required), "date" (required, ISO), "duration"?, "notes"?, "leadId"? }`. Returns `201`.

## Time entries

### `GET /api/time-entries`
List time entries, each with a minimal `lead`, newest `date` first.

### `POST /api/time-entries`
Create a time entry. Body: `{ "description" (required), "minutes" (required), "date"?, "leadId"? }`. Returns `201`.

## Activity (conversations)

### `GET /api/activity?leadId=<id>`
List conversation entries, each with a minimal `lead`, newest `createdAt` first, capped at 100. Omit `leadId` for the global feed; supply it to scope to one lead.

### `POST /api/activity`
Log an entry. Body: `{ "body" (required), "leadId" (required), "type"?, "source"? }`. Defaults `type` to `note` and `source` to `manual`. Returns `201`.

## Workflows

### `GET /api/workflows`
List all workflow rules, newest first.

### `POST /api/workflows`
Create a rule. Body: `{ "name", "trigger", "action" }` (all required).
- `trigger` must be one of `TRIGGERS`; `action` must be one of `ACTIONS` (see [How-to: Workflows](howto-workflows.md)). Unknown vocabulary returns `400` — the UI can only ever create rules the engine can execute.
- Returns `201`.

### `PATCH /api/workflows/[id]`
Toggle a rule. Body: `{ "enabled": boolean }`. Returns the updated rule.

### `DELETE /api/workflows/[id]`
Delete a rule (its `WorkflowRun` history cascade-deletes). Returns `{ "ok": true }`.

### `POST /api/workflows/run`
Trigger the time-based ("scheduled") workflow sweep across the whole pipeline. Returns `{ "ok": true, "fired": <n> }`. A future cron can hit this same endpoint on a timer.

## Integrations

### `POST /api/integrations/outlook/email/sync`
Pull recent emails from the active inbox provider, match each to a lead by counterpart address, and upsert matched messages as `Conversation` rows (`type: email`, `source: outlook`) idempotently by `externalId`. Returns `{ "ok": true, "created": n, "updated": n, "skipped": n }`. On error, `500 { "error": "sync error" }`.

> Currently unauthenticated at the route level (`// TODO: protect when live`) because it drives a mock in local dev. See [How-to: Integrations](howto-integrations.md) for the go-live checklist.

### `POST /api/integrations/outlook/sync`
Pull calendar events from the active calendar provider, match each to a lead by attendee email, and upsert `ExternalEvent` rows idempotently by `externalId`. Returns `{ "ok": true, "created": n, "updated": n, "linked": n }` (`linked` counts events matched to a lead in this run). On error, `500 { "error": "sync error" }`. Same local-dev caveat as email sync.

### `POST /api/integrations/calcom/webhook`
cal.com webhook receiver. **Self-authenticating** (exempt from the session gate).
- Reads the raw body, verifies the `x-cal-signature-256` HMAC header against the signing secret (from the `calcom_signing_secret` setting, falling back to the `CALCOM_SIGNING_SECRET` env var). Invalid signature → `401`.
- Parses the cal.com v2 envelope; unhandled triggers or malformed payloads return `{ "ok": true, "ignored": true }`.
- Handled triggers: `BOOKING_CREATED`, `BOOKING_RESCHEDULED`, `BOOKING_CANCELLED`. Applies the booking (creates/updates a lead + meeting, advances to `Call Booked`, logs a call entry, fires workflows).
- Success → `{ "ok": true }`; handler error → `500`.

## Theme

### `POST /api/theme`
Set the `theme` cookie. Body: `{ "theme": "light" | "dark" }` (anything else → `400`). Cookie persists one year, per browser/device. Returns `{ "theme": "<value>" }`.

> This route **is** behind the session gate (it is not in the middleware exemption list), so a valid session is required to change theme.

## Settings

### `GET /api/settings`
Return all settings as a flat `{ key: value }` object.

### `PATCH /api/settings`
Upsert one or more settings. Body: a flat `{ key: value }` object; each pair is upserted. Returns `{ "ok": true }`. Used for booking links and the cal.com signing secret (see [Data Model → Setting](reference-data-model.md#setting)).

## Quick index

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET / POST | `/api/leads` | List / create leads |
| GET / PATCH / DELETE | `/api/leads/[id]` | Read / update / delete a lead |
| POST / GET | `/api/leads/[id]/score` | AI-score (JSON / redirect) |
| PATCH | `/api/leads/[id]/relationship` | Manual relationship set (only path that sets `client`) |
| GET / POST | `/api/companies` | List / create companies |
| GET / PATCH | `/api/companies/[id]` | Read / update a company |
| GET | `/api/contacts?q=` | Search leads |
| GET / POST | `/api/meetings` | List / create meetings |
| GET / POST | `/api/time-entries` | List / create time entries |
| GET / POST | `/api/activity` | List / create activity entries |
| GET / POST | `/api/workflows` | List / create rules |
| PATCH / DELETE | `/api/workflows/[id]` | Toggle / delete a rule |
| POST | `/api/workflows/run` | Run the scheduled sweep |
| POST | `/api/integrations/outlook/email/sync` | Sync Outlook email → Activity |
| POST | `/api/integrations/outlook/sync` | Sync Outlook calendar → ExternalEvent |
| POST | `/api/integrations/calcom/webhook` | cal.com booking receiver (signed) |
| POST | `/api/theme` | Set theme cookie |
| GET / PATCH | `/api/settings` | Read / upsert settings |

## Related

- [Reference: Data Model](reference-data-model.md) — the shapes behind these routes
- [How-to: Integrations](howto-integrations.md) — driving the integration endpoints
- [How-to: Workflows](howto-workflows.md) — the trigger/action vocabulary
- [Explanation: Architecture](explanation-architecture.md) — why webhooks self-authenticate and syncs are idempotent
