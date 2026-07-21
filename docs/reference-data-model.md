# Reference: Data Model

Clarity CRM stores everything in a single SQLite database, accessed through Prisma. This document is the complete, field-by-field description of every model in [`prisma/schema.prisma`](../prisma/schema.prisma) and the shared vocabulary (stages, owners, sources, relationships, constraints) that lives in [`lib/constants.ts`](../lib/constants.ts).

For _why_ the model is shaped this way — the `client`-never-auto-set rule, `externalId` idempotency, the source-of-truth split — see [Explanation: Architecture](explanation-architecture.md). For how the data is read and written over HTTP, see [Reference: API](reference-api.md).

## Conventions

- IDs are `cuid()` strings unless noted.
- SQLite has no array or enum type. "Enums" are plain `String` columns constrained in application code (`lib/constants.ts`), and arrays are stored JSON-encoded (see `ExternalEvent.attendees`).
- `DateTime` columns default to `now()` where a creation timestamp is implied.
- A `?` after a type means the column is nullable/optional.

## Models

### Lead

The central record. A person (and their deal) moving through the pipeline. Carries three layers of data: contact info, the sales pipeline state, and Clarity's diagnostic fields.

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `id` | String | `cuid()` | Primary key |
| `name` | String | — | Full name (required) |
| `companyName` | String? | — | Free-text company name (distinct from the `Company` relation) |
| `email` | String? | — | Match key for cal.com bookings, email sync, and calendar sync |
| `linkedinUrl` | String? | — | |
| `website` | String? | — | |
| `owner` | String? | — | `Alex` or `Jordan` (see `OWNERS`) |
| `track` | String? | — | `Strategic / Commercial` or `Operations / Teams` (see `TRACKS`) |
| `source` | String? | — | Lead origin (see `SOURCES`) |
| `stage` | String | `"New Lead"` | One of the 7 pipeline stages (see `STAGES`) |
| `stageChangedAt` | DateTime | `now()` | When the lead last entered its current stage — drives time-based workflow rules |
| `nextAction` | String? | — | One of `NEXT_ACTIONS` |
| `relationship` | String | `"contact"` | One of `RELATIONSHIPS`. **Never auto-set to `client`** |
| `monthlyValue` | Float? | — | Retainer value in £ (summed into MRR when `stage === 'Closed Won'`) |
| `contactAdded` | DateTime | `now()` | |
| `dateContacted` | DateTime? | — | |
| `callDate` | DateTime? | — | Set from a cal.com booking's start time |
| `followUpDate` | DateTime? | — | |
| `closedDate` | DateTime? | — | Stamped when the lead enters `Closed Won`/`Closed Lost`, cleared otherwise |
| `intakeFormReceived` | Boolean | `false` | Was the intake form completed before the call? |
| `notes` | String? | — | Manual notes |
| `scalingRoadmapStage` | String? | — | Hormozi 0–9 roadmap stage, e.g. `3 (Stabilize)` (see `ROADMAP_STAGES`) |
| `primaryConstraint` | String? | — | One of the 6 Ms (see `CONSTRAINTS`) |
| `businessDebt` | String? | — | One of `BUSINESS_DEBTS` |
| `graduationCriterion` | String? | — | Free text: the binary test to leave the current roadmap stage |
| `companyId` | String? | — | FK → `Company` |
| `aiScore` | Int? | — | 0–100 AI qualification score |
| `aiScoreLabel` | String? | — | `Cold` / `Warm` / `Hot` |
| `aiSummary` | String? | — | 2–3 sentence AI qualification summary |
| `aiRecommendation` | String? | — | AI-suggested next action |

**Relations:** `company` (Company?), `openLoops` (OpenLoop[]), `meetings` (Meeting[]), `timeEntries` (TimeEntry[]), `conversations` (Conversation[]), `externalEvents` (ExternalEvent[]).

> **Guardrail:** the create path never accepts `client`. `buildNewLead()` in `lib/leads.ts` coerces any requested `relationship` of `client` back to the default `contact`; `applyStageChange()` deliberately does not touch `relationship`. `client` can only be set by an explicit manual edit via `setRelationshipManually()` / `PATCH /api/leads/[id]/relationship`.

### Company

An organisation. Leads and meetings can belong to a company.

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `id` | String | `cuid()` | Primary key |
| `name` | String | — | Required |
| `website` | String? | — | |
| `notes` | String? | — | |
| `createdAt` | DateTime | `now()` | |

**Relations:** `leads` (Lead[]), `meetings` (Meeting[]).

### OpenLoop

A commitment or follow-up owed to or from a contact. Created manually or by the "Create follow-up reminder" workflow effect.

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `id` | String | `cuid()` | Primary key |
| `leadId` | String | — | FK → `Lead` (required) |
| `description` | String | — | |
| `direction` | String | `"owed-from"` | `owed-from` (they owe us) or the inverse |
| `done` | Boolean | `false` | |
| `dueDate` | DateTime? | — | |

### Meeting

A meeting, logged manually or created from a cal.com booking.

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `id` | String | `cuid()` | Primary key |
| `title` | String | — | |
| `date` | DateTime | — | Start time |
| `duration` | Int? | — | Minutes |
| `notes` | String? | — | |
| `leadId` | String? | — | FK → `Lead` |
| `companyId` | String? | — | FK → `Company` |
| `createdAt` | DateTime | `now()` | |
| `externalId` | String? **@unique** | — | cal.com booking `uid`; idempotency + lookup key |
| `source` | String | `"manual"` | `manual` or `cal.com` |
| `status` | String | `"confirmed"` | `confirmed` or `cancelled` |
| `cancelledAt` | DateTime? | — | Stamped on cancellation |

**Relations:** `lead` (Lead?), `company` (Company?), `conversations` (Conversation[]).

### TimeEntry

Time logged against a lead.

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `id` | String | `cuid()` | Primary key |
| `description` | String | — | |
| `minutes` | Int | — | |
| `date` | DateTime | `now()` | The day the work happened |
| `leadId` | String? | — | FK → `Lead` |
| `createdAt` | DateTime | `now()` | |

### Conversation

A single entry in a lead's Activity timeline: a note, call, email, or LinkedIn touch. This is the table the Activity feed reads, and the table synced Outlook emails land in.

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `id` | String | `cuid()` | Primary key |
| `type` | String | `"note"` | `note` / `call` / `email` / `linkedin` |
| `source` | String | `"manual"` | `manual` / `cal.com` / `workflow` / `linkedin` / `outlook` (provenance; labelled via `SOURCE_LABELS`) |
| `body` | String | — | Display text |
| `leadId` | String | — | FK → `Lead` (required) |
| `meetingId` | String? | — | FK → `Meeting` (set for cal.com call entries) |
| `externalId` | String? **@unique** | — | Provider message id — idempotency key for synced email. Null for manual/workflow/cal.com entries |
| `createdAt` | DateTime | `now()` | For synced email this is set to the email's `sentAt` so the timeline sorts correctly |

**Relations:** `lead` (Lead), `meeting` (Meeting?).

### ExternalEvent

A calendar event pulled from an external provider (Outlook, in mock form today). Separate from `Meeting` — `Meeting` is CRM-owned (manual + cal.com), `ExternalEvent` is a read-only mirror of an external calendar.

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `id` | String | `cuid()` | Primary key |
| `source` | String | `"outlook"` | Provider tag; future-proofs for google etc. |
| `externalId` | String **@unique** | — | Provider event id — idempotency key (required) |
| `title` | String | — | |
| `start` | DateTime | — | |
| `end` | DateTime | — | |
| `attendees` | String | — | **JSON-encoded `string[]`** (SQLite has no array type) |
| `leadId` | String? | — | FK → `Lead`, matched by attendee email |
| `createdAt` | DateTime | `now()` | |
| `updatedAt` | DateTime | `@updatedAt` | |

### Setting

A key/value store for runtime configuration — booking links and the cal.com signing secret. Seeded by `prisma/seed.ts`.

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `key` | String | — | Primary key |
| `value` | String | — | |

Known keys:

| Key | Purpose |
| --- | --- |
| `booking_link_shared` | Default discovery booking link |
| `booking_link_alex` | Alex's per-owner link (falls back to shared if empty) |
| `booking_link_jordan` | Jordan's per-owner link (falls back to shared if empty) |
| `calcom_signing_secret` | cal.com webhook HMAC secret (falls back to `CALCOM_SIGNING_SECRET` env var) |

Booking-link resolution logic lives in `resolveBookingLink()` in `lib/settings.ts`.

### WorkflowRule

An automation rule: a trigger paired with an action. Created in the Workflows UI; executed by the workflow engine.

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `id` | String | `cuid()` | Primary key |
| `name` | String | — | |
| `trigger` | String | — | One of `TRIGGERS` (see below) |
| `action` | String | — | One of `ACTIONS` (see below) |
| `enabled` | Boolean | `true` | |
| `createdAt` | DateTime | `now()` | |

**Relations:** `runs` (WorkflowRun[]).

### WorkflowRun

An audit record of one workflow rule firing (or being skipped/erroring) against one lead.

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `id` | String | `cuid()` | Primary key |
| `ruleId` | String | — | FK → `WorkflowRule` (cascade delete) |
| `trigger` | String | — | Snapshot of the rule's trigger at run time |
| `action` | String | — | Snapshot of the rule's action at run time |
| `leadId` | String? | — | The lead the rule ran against |
| `status` | String | — | `success` / `skipped` / `error` |
| `detail` | String? | — | Human-readable outcome line |
| `createdAt` | DateTime | `now()` | |

## Shared vocabulary (`lib/constants.ts`)

Every option list and colour lives in one file so the pipeline stages and field values can never drift between the UI, the API, and the engine.

### Pipeline stages (`STAGES`)

Exactly seven, in order. Do not invent others.

```
New Lead → Contacted → Replied → Call Booked → Call Done → Closed Won → Closed Lost
```

`Closed Won` and `Closed Lost` are terminal. Workflow auto-advance never moves a lead _into_ a terminal stage (that is always a human decision).

### Owners (`OWNERS`)

`Alex`, `Jordan`.

### Tracks (`TRACKS`)

`Strategic / Commercial` (Alex), `Operations / Teams` (Jordan).

### Sources (`SOURCES`)

`Warm DM`, `Referral`, `Content Inbound`, `FounderON`, `Cold Outreach`, `LinkedIn`, `Inbound`, `Event`, `Networking`, `cal.com`.

### Next actions (`NEXT_ACTIONS`)

`Research contact`, `Send message`, `Follow up`, `Book call`, `Prepare call`, `Send recap`, `Send proposal`, `Awaiting reply`, `Nurture`, `No action`.

### Relationships (`RELATIONSHIPS`)

`contact` (default), `prospect`, `client`, `peer`, `advisory`, `inactive`.

`DEFAULT_RELATIONSHIP` is `contact`. `client` is reserved and never inferred.

### Primary constraint — the 6 Ms (`CONSTRAINTS` + `CONSTRAINT_COLORS`)

| Constraint | Colour |
| --- | --- |
| More | `#56d4e8` |
| Money | `#ffde59` |
| Metrics | `#a78bfa` |
| Manpower | `#ff3131` |
| Market | `#dc8c32` |
| Model | `#e850a0` |

Constraint colours are used **only** where the UI references the 6 Ms — never decoratively.

### Business debt (`BUSINESS_DEBTS` + `DEBT_COLORS`)

`Ignorance debt` (`#5271ff`), `Avoidance debt` (`#34d399`), `Experience debt`.

### Scaling roadmap (`ROADMAP_STAGES`)

`0 (Improvise)` … `6 (Optimize)`, then `7/8/9 (Scale)`.

### Team mailboxes (`TEAM_EMAILS`)

`alex@example.com`, `jordan@example.com`. Excluded when matching a synced email's counterpart to a lead, so an internal recipient never matches as the "lead".

### Activity source labels (`SOURCE_LABELS`)

Maps a `Conversation.source` to a display label: `cal.com` → `cal.com`, `workflow` → `Auto`, `linkedin` → `LinkedIn`, `manual` → `Manual`, `outlook` → `Outlook`.

### Brand (`BRAND`)

Clarity midnight `#020f31` (background), text `#ffffff`, Clarity blue `#429edb` (single accent).

## Related

- [Reference: API](reference-api.md) — the HTTP surface over these models
- [Explanation: Architecture](explanation-architecture.md) — why the model is shaped this way
- [How-to: Integrations](howto-integrations.md) — how `Conversation` and `ExternalEvent` get populated from Outlook
