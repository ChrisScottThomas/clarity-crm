# How to run and extend the integrations

Clarity CRM has three inbound integrations: **Outlook email sync**, **Outlook calendar sync**, and the **cal.com booking webhook**. All three run against mocks in local dev, so you can exercise them with no credentials. This guide covers driving each one, and swapping a mock for the real provider when you go live.

## Prerequisites

- The app running locally (`npm run dev`) — see [Tutorial: Getting Started](tutorial-getting-started.md).
- At least one lead whose `email` matches a fixture address, so a sync has something to match against. The mock fixtures use `dana@acme.com` for both email and calendar.

## How to sync Outlook email into the Activity feed

The email sync pulls recent messages, matches each to a lead by the counterpart address, and logs matched ones as Activity entries.

### From the UI

1. Open **Activity** (`/activity`).
2. Click **↻ Sync email** (top right).

   The button POSTs to `/api/integrations/outlook/email/sync`, then refreshes the page. Matched emails appear as `✉️` entries tagged **Outlook**.

### From the command line

```bash
curl -X POST http://localhost:3000/api/integrations/outlook/email/sync \
  -H 'Cookie: clarity_session=<your session cookie>'
```

Expected response (with a `dana@acme.com` lead present — the mock has one inbound and one outbound message to Dana, plus one message to nobody in the CRM):

```json
{ "ok": true, "created": 2, "updated": 0, "skipped": 1 }
```

- `created` — new Activity entries written this run.
- `updated` — entries already present (matched by `externalId`) and refreshed.
- `skipped` — messages that matched no lead (or only matched a team mailbox).

With no matching lead at all, every message is skipped (`created: 0, skipped: 3`).

### What "matched to a lead" means

For each message, the sync computes the **counterpart** address (`lib/integrations/email-sync.ts`):

- **Inbound** message → the counterpart is the sender (`from`).
- **Outbound** message → the counterpart is the recipients (`to`) minus our own team mailboxes (`TEAM_EMAILS` = `alex@example.com`, `jordan@example.com`).

It then finds a lead whose `email` is in that counterpart set. No lead → the message is skipped. This is why a fixture email only lights up the feed once a lead with the matching email exists.

### Verification

Run the sync twice. The first run reports `created: N`; the second reports `updated: N, created: 0`. The Activity feed does not grow duplicates — entries are idempotent by `externalId`.

## How to sync the Outlook calendar

The calendar sync pulls upcoming events, matches each to a lead by attendee email, and mirrors them into the `ExternalEvent` table.

### From the UI

The **↻ Sync calendar** button (`components/SyncCalendarButton.tsx`) POSTs to `/api/integrations/outlook/sync`. It is wired wherever the calendar view surfaces it; you can also call the endpoint directly.

### From the command line

```bash
curl -X POST http://localhost:3000/api/integrations/outlook/sync \
  -H 'Cookie: clarity_session=<your session cookie>'
```

Response:

```json
{ "ok": true, "created": 1, "updated": 0, "linked": 1 }
```

`linked` counts events matched to a lead in this run (counted every run, not just the first link). Events with no matching attendee are still stored, just with `leadId: null`.

## How to wire the cal.com webhook

Unlike the sync endpoints, cal.com is **push, not pull** — cal.com calls the CRM. The webhook is exempt from the session gate and authenticates with an HMAC signature instead.

### Steps

1. **Set the signing secret.** Store it as a setting (preferred) or an env var. Via the API:

   ```bash
   curl -X PATCH http://localhost:3000/api/settings \
     -H 'Content-Type: application/json' \
     -H 'Cookie: clarity_session=<your session cookie>' \
     -d '{ "calcom_signing_secret": "<secret from cal.com>" }'
   ```

   The webhook resolves the secret from the `calcom_signing_secret` setting first, then falls back to the `CALCOM_SIGNING_SECRET` env var.

2. **Point cal.com at the endpoint.** In cal.com's webhook settings, set the URL to `https://<your-host>/api/integrations/outlook/../calcom/webhook` → i.e. `https://<your-host>/api/integrations/calcom/webhook`, subscribed to `BOOKING_CREATED`, `BOOKING_RESCHEDULED`, and `BOOKING_CANCELLED`.

3. **What happens on a booking:**
   - `BOOKING_CREATED` — finds a lead by attendee email (creates one, `source: cal.com`, if none), upserts a `Meeting`, advances the lead to **Call Booked** (unless already past it), sets `callDate`, logs a `call` Activity entry, and fires workflows.
   - `BOOKING_RESCHEDULED` — updates the existing meeting's date/duration; logs "Call rescheduled." Treated as a new booking if never seen.
   - `BOOKING_CANCELLED` — marks the meeting `cancelled`; logs "Call cancelled."

### Verification

Send a signed test payload. The signature is `HMAC-SHA256(rawBody, secret)` hex-encoded, in the `x-cal-signature-256` header:

```bash
SECRET='your-secret'
BODY='{"triggerEvent":"BOOKING_CREATED","payload":{"uid":"test-1","startTime":"2026-08-01T10:00:00Z","endTime":"2026-08-01T10:30:00Z","title":"Discovery","attendees":[{"email":"dana@acme.com","name":"Dana"}]}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')
curl -X POST http://localhost:3000/api/integrations/calcom/webhook \
  -H "Content-Type: application/json" \
  -H "x-cal-signature-256: $SIG" \
  -d "$BODY"
```

- Valid signature + handled trigger → `{ "ok": true }`, and the lead moves to Call Booked.
- Wrong/absent signature → `401 { "error": "invalid signature" }`.
- Unhandled trigger or malformed payload → `{ "ok": true, "ignored": true }`.

## How to go live: swap a mock for the real provider

Every integration is a mock behind an interface. Replacing one is a two-line change plus the real implementation. Using the inbox as the example (`lib/integrations/inbox.ts`):

1. **Implement the real provider.** `GraphInboxProvider.fetchMessages()` currently throws. Fill it in with a Microsoft Graph call that returns `EmailMessage[]` — the same shape the mock returns.

2. **Flip the export.** Change the last line:

   ```ts
   // from
   export const inboxProvider: InboxProvider = new MockInboxProvider()
   // to
   export const inboxProvider: InboxProvider = new GraphInboxProvider()
   ```

   Nothing in `email-sync.ts` or the route changes — they depend only on the `InboxProvider` interface.

3. **Add auth to the open sync routes.** Both `outlook/email/sync` and `outlook/sync` carry a `// TODO: protect when live (auth + resolve owner from session)`. Before going online, gate them and resolve the `owner` (mailbox) from the session instead of the default `'shared'`.

4. **Do the same per integration:** `GraphCalendarProvider` (`calendar.ts`), and real providers for `booking.ts` / `email.ts` / `sessionNotes.ts` as those steps come online.

### Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `GraphInboxProvider not implemented` error | You flipped the export before implementing the real provider | Implement `fetchMessages`, or flip back to `MockInboxProvider` |
| Sync returns all `skipped` | No lead's `email` matches a fixture/message counterpart | Create a lead with a matching email (mock uses `dana@acme.com`) |
| Webhook returns `401` | Signature mismatch — wrong secret, or body altered before signing | Sign the **raw** bytes with the exact `calcom_signing_secret` value |
| Webhook returns `ignored: true` | Trigger not in the handled set, or payload missing `uid`/times/attendee | Only `BOOKING_CREATED/RESCHEDULED/CANCELLED` with a valid payload are acted on |
| Re-running a sync duplicates entries | Would only happen if `externalId` were dropped | Entries are keyed by `externalId`; confirm the provider returns stable ids |

## Related

- [Reference: API](reference-api.md) — exact request/response shapes
- [Explanation: Architecture](explanation-architecture.md#the-integration-seam) — why the seam is shaped this way
- [How-to: Workflows](howto-workflows.md) — what fires after a booking advances a lead
