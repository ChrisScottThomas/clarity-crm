# cal.com Webhook Integration — Design

**Date:** 2026-06-27
**Status:** approved (mock-and-test-first build)
**Drives:** §2 + §4.1 of `docs/integrations-and-conversations-plan.md`

## Goal

Turn a cal.com booking into CRM data end-to-end, in real time:

```
cal.com booking → Lead (captured or matched) + Meeting + stage advance → workflow engine fires
```

This doubles as **inbound lead capture** (a new attendee becomes a lead) and exercises
the workflow execution engine shipped in `lib/workflow-engine.ts` / `lib/workflow-executor.ts`.

Built mock-and-test-first: interfaces match the real cal.com v2 production schema, but the
whole flow is verified locally with simulated signed payloads and mocked Prisma — **no live
cal.com account and no live DB required to pass tests.**

## Production API facts (cal.com v2)

Source: <https://cal.com/docs/core-features/webhooks>, <https://cal.com/docs/api-reference/v2/introduction>.

- **Webhook envelope:** `{ "triggerEvent": "...", "createdAt": "ISO", "payload": { ... } }`
- **Triggers handled:** `BOOKING_CREATED`, `BOOKING_RESCHEDULED`, `BOOKING_CANCELLED`.
  All other triggers are accepted and ignored (200).
- **Booking payload fields used:**
  - `uid` — unique booking id (our idempotency / lookup key)
  - `title` — event title
  - `startTime`, `endTime` — ISO 8601 (duration = `endTime − startTime`, in minutes)
  - `status` — `ACCEPTED | PENDING | CANCELLED | REJECTED`
  - `organizer` — `{ name, email, timeZone, username }`
  - `attendees` — `[{ email, name, timeZone }]` (first attendee = the booker → the lead)
  - `responses`, `location`, `metadata.videoCallUrl` — captured into meeting notes
- **Signature:** header `x-cal-signature-256`; value is `HMAC-SHA256(rawBody, secret)` hex.
  The secret is the per-webhook signing secret configured in cal.com.

> Note on reschedule: cal.com may deliver a reschedule as a new booking carrying the prior
> booking's id (`rescheduleUid` / `rescheduleId` in `payload`). The handler matches an existing
> Meeting by `uid` **or** that reschedule reference, falling back to creating a Meeting if none
> is found.

## Components

### 1. `lib/integrations/calcom.ts` — pure, no DB, no Prisma

The production-schema contract + crypto. Unit-testable in isolation.

```ts
export type CalcomTrigger = 'BOOKING_CREATED' | 'BOOKING_RESCHEDULED' | 'BOOKING_CANCELLED'

export interface CalcomBooking {
  trigger: CalcomTrigger
  uid: string
  rescheduledFromUid?: string   // present on reschedule, points at prior booking
  title: string
  start: Date
  end: Date
  durationMinutes: number
  status: string
  attendeeEmail: string
  attendeeName: string
  organizerEmail?: string
  notes?: string                // assembled from location / videoCallUrl / responses
}

// Returns null for triggers we don't handle, or for malformed payloads.
export function parseCalcomPayload(raw: unknown): CalcomBooking | null

// Constant-time hex compare of HMAC-SHA256(rawBody, secret) against the header.
export function verifyCalcomSignature(rawBody: string, signature: string | null, secret: string): boolean
```

### 2. `lib/integrations/calcom-handler.ts` — effectful orchestration

`handleCalcomBooking(booking: CalcomBooking): Promise<void>` dispatches on `trigger`:

- **BOOKING_CREATED**
  1. Upsert Lead by `attendeeEmail`. New → `prisma.lead.create` with `source: 'cal.com'`,
     `stage: 'Call Booked'`, name from attendee. Existing → matched by email.
  2. Create Meeting: `externalId = uid`, `source = 'cal.com'`, `status = 'confirmed'`,
     `title`, `date = start`, `duration = durationMinutes`, `notes`, `leadId`.
     Idempotent: if a Meeting with this `externalId` exists, update it instead of duplicating.
  3. Set `lead.callDate = start` (so it also surfaces on the Calendar tab).
  4. Advance stage to `Call Booked` **only if not regressing** (see stage logic). Fires
     `runWorkflows({ kind: 'lead.created' })` for brand-new leads, and
     `runWorkflows({ kind: 'lead.stage_changed', fromStage, toStage })` when the stage moved.
- **BOOKING_RESCHEDULED**
  - Find Meeting by `externalId === uid` (or `rescheduledFromUid`). Update `date`, `duration`,
    `status: 'confirmed'`, `notes`, and `externalId = uid`. Update `lead.callDate`.
  - If no Meeting found, fall back to the BOOKING_CREATED path.
- **BOOKING_CANCELLED**
  - Find Meeting by `externalId`. Set `status: 'cancelled'`, `cancelledAt: now`.
  - Lead stage is left untouched (no auto-regression).

### 3. `app/api/integrations/calcom/webhook/route.ts` — HTTP edge

`POST` handler:
1. Read the **raw** request body as text (needed for signature — do not `req.json()` first).
2. Resolve secret: `Setting['calcom_signing_secret']` → fallback `process.env.CALCOM_SIGNING_SECRET`.
3. `verifyCalcomSignature(raw, header, secret)` → **401** on failure or missing secret.
4. `parseCalcomPayload(JSON.parse(raw))` → **400** if unparseable; **200** (ignored) if an
   unhandled trigger.
5. `await handleCalcomBooking(booking)` → **200** on success.
6. Unexpected handler error → **500** (lets cal.com retry per its backoff).

### 4. `middleware.ts` — bypass the session gate

Add `/api/integrations/calcom/webhook` to the public path allowlist alongside `/login`.
The endpoint self-authenticates via signature; cal.com has no session cookie.

## Schema changes (additive — `prisma db push`)

```prisma
model Meeting {
  // ...existing fields...
  externalId  String?   @unique   // cal.com booking uid; idempotency + lookup key
  source      String    @default("manual")   // 'manual' | 'cal.com'
  status      String    @default("confirmed") // 'confirmed' | 'cancelled'
  cancelledAt DateTime?
}
```

All additive with defaults — existing Meeting rows migrate cleanly.

## Constants & settings

- `lib/constants.ts`: add `'cal.com'` to `SOURCES`.
- Signing secret: `Setting['calcom_signing_secret']`, fallback env `CALCOM_SIGNING_SECRET`.
  (Settings-UI entry is out of scope here; the seam reads Setting first so the UI can come later.)

## Stage logic — never regress

`STAGES` is ordered: `New Lead → Contacted → Replied → Call Booked → Call Done → Closed Won/Lost`.
Advance to `Call Booked` only when `indexOf(current) < indexOf('Call Booked')`. Otherwise leave
the stage as-is and do not fire `lead.stage_changed`. A booking must never drag a `Call Done` or
`Closed Won` lead backwards. Reuses `applyStageChange` from `lib/leads.ts` for the actual transition.

## Error handling / response codes

| Situation | Response |
|---|---|
| Missing/invalid signature, or no secret configured | 401 |
| Body not valid JSON | 400 |
| Valid but unhandled `triggerEvent` | 200 (ignored) |
| Handled successfully | 200 |
| Unexpected error inside handler | 500 (cal.com retries) |

## Testing (TDD, local-first — no live cal.com, no live DB)

Follows the repo's established pattern: pure logic tested directly; DB code tested with
`vi.mock('../lib/db')`.

1. **`tests/calcom-parse.test.ts`** (pure)
   - `verifyCalcomSignature`: known secret + known body → known hex passes; tampered body / wrong
     secret / missing header → false; constant-time path exercised.
   - `parseCalcomPayload`: each handled trigger maps correctly; duration derived from start/end;
     unhandled trigger → null; missing attendee / malformed → null; reschedule ref extracted.
2. **`tests/calcom-handler.test.ts`** (mocked `lib/db` + mocked `workflow-executor`)
   - CREATED, new attendee → `lead.create` (`source:'cal.com'`), `meeting.create`, `callDate` set,
     `runWorkflows` called with `lead.created` then `lead.stage_changed`.
   - CREATED, existing lead earlier than Call Booked → matched, stage advanced, `stage_changed` fired.
   - CREATED, existing lead at Call Done / Closed Won → **no regression**, no `stage_changed`.
   - CREATED re-delivered (same `uid`) → Meeting updated, not duplicated (idempotency).
   - RESCHEDULED → Meeting date/duration updated, `callDate` updated.
   - CANCELLED → Meeting `status:'cancelled'` + `cancelledAt`, lead stage untouched.
3. **`tests/calcom-route.test.ts`** (mocked handler + db)
   - Bad signature → 401; unhandled trigger → 200; happy path → 200 and handler invoked once.

A small fixtures helper builds signed payloads with a known test secret so signature + dispatch
are exercised exactly as production would.

## Out of scope (deferred)

- Settings UI to enter the signing secret.
- Polling/backfill fallback for missed webhooks (the `bookingProvider` seam stays for this).
- Outlook calendar sync (§2 build order step 2) and the Conversations→Activity feed (step 3).
