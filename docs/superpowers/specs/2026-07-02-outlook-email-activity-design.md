# Outlook Email → Activity feed (mock-first) — design spec

**Date:** 2026-07-02
**Status:** approved, ready for implementation planning
**Precedent:** mirrors the shipped Outlook *calendar* sync
(`docs/superpowers/specs/2026-06-28-outlook-calendar-sync-design.md`). This feature
reuses the same provider-seam pattern but writes into the **Activity feed**
(`Conversation` rows) instead of the Calendar tab.

Implements §3 (row: "Email (Outlook)") and step 3 of §4 in
`docs/integrations-and-conversations-plan.md`.

---

## Goal

Auto-populate the Activity feed with a lead's real email history from Outlook,
matched to the lead by address — so the feed becomes a genuine relationship
timeline rather than a manual-notes box. Mock-first: fully built and tested
against a mock provider in local dev; the real Microsoft Graph implementation is
a stub deferred until we move off local dev.

## Locked decisions (from brainstorming)

1. **Both directions** — capture mail we send to a lead (outbound) and mail they
   send us (inbound).
2. **Skip unmatched** — an email whose counterpart address matches no existing
   `Lead` produces no Activity entry. Keeps `Conversation.leadId` required; no
   pipeline pollution from newsletters/vendors/spam. New prospects are captured
   via the cal.com booking path, not stray email.
3. **Write into `Conversation`** with a new nullable, unique `externalId` for
   dedup — email rows render through the feed's existing `Conversation` path with
   zero feed-query changes.
4. **Direction encoded in `body`** as a leading glyph (no new column) — a
   two-way door; can promote to a dedicated column later if we need filtering.
5. **Backward 30-day window** — emails are past-facing (the calendar window is
   forward-facing).
6. **`createdAt = sentAt`** — synced rows carry the email's real timestamp so the
   timeline sorts correctly, overriding the `now()` default.

---

## 1. Schema change

One field on the existing `Conversation` model:

```prisma
model Conversation {
  ...
  externalId String? @unique  // provider message id — idempotency for synced email;
                              // null for manual / workflow / cal.com rows
}
```

- **Nullable:** existing sources (manual, workflow, cal.com) leave it null and are
  unaffected.
- **Unique:** re-syncs upsert on `externalId` instead of duplicating.
- Applied via `prisma db push` (no migrations dir — same as the calendar work).

## 2. Provider seam — widen `lib/integrations/inbox.ts`

The current `fetchInbound()` seam is too thin (no direction, no message id, no
window). Nothing consumes it yet (it returns `[]`), so replacing it wholesale is
safe.

```ts
export interface EmailMessage {
  externalId: string                    // Graph message id — idempotency key
  direction: 'inbound' | 'outbound'
  from: string
  to: string[]
  subject: string
  snippet: string
  sentAt: Date
}

export interface InboxProvider {
  // owner: the mailbox to read — a user identifier (UPN) when Graph is live; ignored by the mock.
  fetchMessages(owner: string, from: Date, to: Date): Promise<EmailMessage[]>
}
```

- **`MockInboxProvider`** (active in local dev): returns a small fixed set of
  plausible messages spread across the requested window. At least one **inbound**
  and one **outbound** message touch `dana@acme.com` — the same documented lead
  the calendar mock uses, so both integrations light up a single lead in a demo.
  Other messages use clearly-fake addresses that match nothing. Messages are
  filtered to the `[from, to]` window (mirrors the calendar mock's window
  honoring).
- **`GraphInboxProvider`** (stub, inactive): `fetchMessages` throws
  `"GraphInboxProvider not implemented — using mock in local dev"`. Built against
  Graph `messages` when we leave local dev.
- `export const inboxProvider: InboxProvider = new MockInboxProvider()`

## 3. Sync handler — `lib/integrations/email-sync.ts`

Mirrors `lib/integrations/calendar-sync.ts`.

```ts
export async function syncEmailActivity(
  owner = 'shared',
): Promise<{ created: number; updated: number; skipped: number }>
```

Behavior:

1. **Window looks backward:** `from = now − WINDOW_DAYS(30)`, `to = now`. (This is
   the one substantive difference from the calendar handler, whose window is
   forward-facing.)
2. Fetch messages: `inboxProvider.fetchMessages(owner, from, to)`.
3. For each message, compute the **counterpart address set**:
   - inbound → `[from]`
   - outbound → `to`, with any address in a new `TEAM_EMAILS` constant removed
     (so our own team never matches as the "lead").
4. Find the lead: `prisma.lead.findFirst({ where: { email: { in: counterpart } } })`.
   - **No lead → `skipped++`, continue** (no row written).
5. Compose `body`: a direction glyph + subject + snippet, e.g.
   `` `← Re: Pricing — "thanks, let's get a call booked…"` `` (inbound) /
   `` `→ Intro — "great to connect…"` `` (outbound).
6. Upsert by `externalId`:
   - row data: `{ type: 'email', source: 'outlook', externalId, leadId, body,
     createdAt: sentAt }`.
   - existing (by `externalId`) → `update` (`updated++`); else `create`
     (`created++`).

`TEAM_EMAILS` lives in `lib/constants.ts` (e.g.
`['alex@example.com', 'jordan@example.com']`); it is also what the future
Graph provider will use to *determine* direction.

## 4. Entry point — `POST /api/integrations/outlook/email/sync`

Mirrors `app/api/integrations/outlook/sync/route.ts`. Calls
`syncEmailActivity()`, returns `{ ok: true, created, updated, skipped }` on
success and `{ error }` with status 500 on failure. Marked
`// TODO: protect when live (auth + resolve owner from session)`. The calendar
route stays at `/outlook/sync`; email gets its own `/outlook/email/sync`.

## 5. UI surfacing (minimal)

The Activity feed already renders `Conversation` rows and already maps
`type:'email'` → ✉️ icon (`TYPE_ICONS` in `app/activity/page.tsx`). So:

- **Add `outlook: 'Outlook'` to `SOURCE_LABELS`** (`lib/constants.ts`) so the
  provenance chip reads "Outlook" instead of the raw source string. Applies to all
  three activity surfaces (`app/activity/page.tsx`,
  `app/activity/[leadId]/page.tsx`, `app/leads/[id]/page.tsx`) that already read
  `SOURCE_LABELS`.
- **Direction** is conveyed by the glyph in `body` (§3.5) — no layout change.
- **New `components/SyncEmailButton.tsx`** — client component cloned from
  `SyncCalendarButton`, labeled e.g. "↻ Sync email", POSTing to
  `/api/integrations/outlook/email/sync` then refreshing. Placed in the
  `/activity` page header.

No feed-query or day-grouping changes anywhere.

## 6. Testing (mirror the calendar suite)

- `tests/inbox-provider.test.ts` — mock returns messages within the window; count
  is stable-ish (`toBeGreaterThanOrEqual`, not a brittle exact count);
  `dana@acme.com` appears in both an inbound and an outbound message.
- `tests/email-sync.test.ts` —
  - matched **inbound** email → creates a `Conversation` (`type:'email'`,
    `source:'outlook'`, correct `leadId`);
  - matched **outbound** email → creates a row;
  - **unmatched** address → `skipped`, no row;
  - **re-sync is idempotent** — second run `update`s, produces no duplicates;
  - `createdAt === sentAt`;
  - an outbound email whose `to` includes a `TEAM_EMAILS` address plus a lead
    address matches the *lead*, not the team member.
- `tests/email-sync-route.test.ts` — `POST` returns `ok` + the counts.

## Out of scope (same deferrals as calendar)

- Real `GraphInboxProvider` (Microsoft Graph `messages`).
- OAuth / `OAuthToken` model / `/connect` / `/callback`, Azure AD registration.
- Cron / scheduled sync — sync is button-triggered for now.
- Attachments, full thread bodies, HTML rendering (snippet only).
- Auth on the sync route (shared with the calendar route's deferral).

## Files touched

| File | Change |
|---|---|
| `prisma/schema.prisma` | add `Conversation.externalId String? @unique` |
| `lib/integrations/inbox.ts` | widen seam: `EmailMessage`, `fetchMessages`, Mock (active) + Graph (stub) |
| `lib/integrations/email-sync.ts` | **new** — `syncEmailActivity` |
| `lib/constants.ts` | add `TEAM_EMAILS`; add `outlook` to `SOURCE_LABELS` |
| `app/api/integrations/outlook/email/sync/route.ts` | **new** — POST entry point |
| `components/SyncEmailButton.tsx` | **new** — client sync button |
| `app/activity/page.tsx` | render the `SyncEmailButton` in the header |
| `tests/inbox-provider.test.ts` | **new** |
| `tests/email-sync.test.ts` | **new** |
| `tests/email-sync-route.test.ts` | **new** |
