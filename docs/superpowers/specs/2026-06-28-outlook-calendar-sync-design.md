# Outlook Calendar Sync — Design

**Date:** 2026-06-28
**Status:** Approved (design phase)
**Source plan:** `docs/integrations-and-conversations-plan.md` §1 and §4 (build order step 2)

## Goal

Populate the Calendar tab with the user's Outlook calendar events, kept as a
separate `ExternalEvent` record set, and bridge each event to a CRM lead by
matching attendee email. Built mock-first: no live Microsoft Graph calls, no
OAuth/Azure scaffolding, everything runnable and testable offline in local dev.

## Constraints

- **Mock-first.** We mock and test all integrations until ready to move out of
  local development. The active provider is a mock; the real Graph provider is a
  stub behind the seam.
- **Follow existing patterns.** Mirror the provider-seam pattern
  (`lib/integrations/booking.ts`, `inbox.ts`, `email.ts`) and the cal.com
  handler/route/test structure (`lib/integrations/calcom-handler.ts`,
  `app/api/integrations/calcom/webhook/route.ts`, `tests/calcom-handler.test.ts`).
- **No migrations dir.** Schema applied via `prisma db push` (project convention).
- The Prisma client is generated per worktree (`npx prisma generate`).

## 1. Data model — `ExternalEvent` (Prisma)

New model, kept separate from `Meeting` so synced calendar events and
manual/cal.com meetings don't tangle.

```prisma
model ExternalEvent {
  id         String   @id @default(cuid())
  source     String   @default("outlook")   // provider tag; future-proofs for google etc.
  externalId String   @unique               // provider event id — idempotency key
  title      String
  start      DateTime
  end        DateTime
  attendees  String                          // JSON-encoded string[] (SQLite has no array type)
  leadId     String?
  lead       Lead?    @relation(fields: [leadId], references: [id])
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}
```

Add the back-relation on `Lead`:

```prisma
externalEvents ExternalEvent[]
```

**`attendees` storage:** SQLite has no array type, so attendees serialize to a
JSON string column. The seam interface still exposes `string[]`; serialization
happens only at the persistence boundary (in the sync handler).

Apply with `npx prisma db push` then `npx prisma generate`.

## 2. The seam — `lib/integrations/calendar.ts`

Same shape as `booking.ts`/`inbox.ts`, but with the mock active and a Graph
**stub** behind it.

```ts
export interface CalendarEvent {
  externalId: string
  title: string
  start: Date
  end: Date
  attendees: string[]
}

export interface CalendarProvider {
  fetchEvents(owner: string, from: Date, to: Date): Promise<CalendarEvent[]>
}

// Active provider in local dev — returns a few plausible sample events.
export class MockCalendarProvider implements CalendarProvider {
  async fetchEvents(owner: string, from: Date, to: Date): Promise<CalendarEvent[]> { /* sample events */ }
}

// Behind the seam, inactive — throws until we go online with real OAuth/Graph.
export class GraphCalendarProvider implements CalendarProvider {
  async fetchEvents(): Promise<CalendarEvent[]> {
    throw new Error('GraphCalendarProvider not implemented — using mock in local dev')
  }
}

export const calendarProvider: CalendarProvider = new MockCalendarProvider()
```

`MockCalendarProvider` returns ~3 fixed events spread over the next several days
(within the 30-day Calendar window). One event uses a recognizable attendee
email (documented below) so the attendee→lead bridge can be demonstrated; the
others use clearly-fake emails that won't match any lead.

## 3. Sync handler — `lib/integrations/calendar-sync.ts`

The effectful core, analogous to `calcom-handler.ts`. Unit-tested with mocked
`prisma` + mocked provider.

```ts
export async function syncCalendarEvents(
  owner = 'shared',
): Promise<{ created: number; updated: number; linked: number }>
```

Logic:

1. `calendarProvider.fetchEvents(owner, now, now + 30d)`.
2. **Attendee→lead match:** for each event, find a `Lead` whose `email` is one of
   the event's `attendees` → set `leadId` (null if no match).
3. **Upsert by `externalId`** (idempotent — re-sync updates in place, never
   duplicates), serializing `attendees` to a JSON string.
4. Return `{ created, updated, linked }` counts for the caller/UI.

## 4. Entry point — `POST /api/integrations/outlook/sync`

Thin route mirroring the calcom webhook route. Calls `syncCalendarEvents()` and
returns `{ ok: true, created, updated, linked }`. No signature/auth yet (local,
mock-driven); a `// TODO: protect when live` comment marks where auth goes when
we move out of local dev.

## 5. Calendar tab surfacing — `app/calendar/page.tsx`

- **Fourth event source:** query `ExternalEvent` rows in the 30-day window and
  push them into the existing `Event[]` loop with `type: 'outlook'`. The
  day-grouping UI is untouched. Add an `outlook` entry to `typeConfig`
  (icon `📆`, color `var(--accent-blue)`). `leadId` drives the existing
  "View Lead →" link automatically.
- **"Sync calendar" button:** a small client component (`SyncCalendarButton`)
  added to the header next to "+ Log Meeting". It POSTs to the sync endpoint,
  then calls `router.refresh()` so the server component re-renders with the new
  events. (Needed because the page is a server component.)

## 6. Testing (mock-first, all offline)

- `tests/calendar-sync.test.ts` — mocks `prisma` + the provider. Covers: creates
  events; upserts idempotently on re-sync (no duplicates); links an event to a
  matching lead; leaves `leadId` null when no match; serializes `attendees` to
  JSON.
- `tests/calendar-provider.test.ts` — `MockCalendarProvider` returns sample
  events; `GraphCalendarProvider.fetchEvents` throws "not implemented".
- Extend `tests/schema-extensions.test.ts` to assert the `ExternalEvent` model
  shape if that file's existing pattern fits.

Verification commands (all must pass):

- `npx tsc --noEmit` — exits 0.
- `npx vitest run` — all tests pass.
- `npx next build` — succeeds; route table shows `/api/integrations/outlook/sync`.

## Seed / demonstrability decision

The seed seeds **no leads by design** (`prisma/seed.ts:18`). Decision:
**respect the leadless seed.** Out of the box, clicking "Sync calendar" creates
`ExternalEvent`s (immediately visible on the Calendar tab); the "View Lead →"
link appears once a lead exists whose email matches a mock event's attendee.

- One `MockCalendarProvider` event uses a documented, memorable attendee email
  (e.g. `dana@acme.com`, reusing the cal.com test fixture address). Creating a
  lead with that email lights up the bridge in the UI with no other setup.
- The attendee→lead bridge is fully covered by unit tests regardless of seed
  state.

We do **not** add a dev-only demo lead — that would silently override the
"no leads by design" seed decision.

## Out of scope (deferred until we move out of local dev)

- Real Microsoft Graph implementation in `GraphCalendarProvider`.
- OAuth: `OAuthToken` model, `/api/integrations/outlook/connect` +
  `/callback` routes, Azure AD app registration (plan §1 "Auth").
- Cron/scheduled sync (we use the manual endpoint + button instead).
- Per-owner token handling (Alex vs Jordan) — the seam accepts an `owner`
  param but the mock ignores it.
