# Integrations & Conversations Plan

How to populate the **Calendar** tab from Outlook, the **Meetings** tab from
cal.com, and what to do about the **Conversations** tab.

> **Status:** planning doc. The workflow execution engine (a prerequisite that
> several of these flows hook into) is already built and shipped — see
> `lib/workflow-engine.ts` / `lib/workflow-executor.ts`.

---

## 0. The one architectural fact that shapes everything

The CRM is a standalone Next.js app. **It cannot use the Outlook / Krisp / Google
MCP connectors that Claude has in the editor** — those exist only inside the
Claude session, not at the app's runtime. The deployed app must talk to each
provider directly through that provider's own API/OAuth.

Good news: the codebase already anticipates this with a **provider seam pattern**
in `lib/integrations/` (`booking.ts`, `inbox.ts`, `email.ts`, `sessionNotes.ts`).
Each is a small interface with a `Mock*` implementation that returns empty. The
work is to add a real implementation behind each interface and a sync/webhook
entry point — no page rewrites required.

---

## 1. Outlook Calendar → Calendar tab

**API:** Microsoft Graph (`graph.microsoft.com/v1.0`).

### Auth
- Register an app in Azure AD (Entra). Scopes: `Calendars.Read`, `offline_access`
  (and `User.Read`). Use the OAuth2 **authorization-code** flow.
- There are effectively two users (Alex, Jordan). Store each user's **refresh
  token** server-side. Add an `OAuthToken` model (`provider`, `owner`,
  `accessToken`, `refreshToken`, `expiresAt`) rather than overloading `Setting`.
- Add `/api/integrations/outlook/connect` (redirect to Microsoft consent) and
  `/api/integrations/outlook/callback` (exchange code → store tokens).

### Pulling events — two options
| | (i) Live fetch on page load | (ii) Periodic sync into DB *(recommended)* |
|---|---|---|
| How | Calendar server component calls Graph `calendarView` each render | A cron/sync endpoint pulls events into a table; Calendar reads the table |
| Pros | Always fresh, no storage | Fast, offline-resilient, lets us **link events to leads** |
| Cons | Latency + token refresh every load; no lead linking | Slight staleness between syncs |

Recommended: **(ii)**. Add an `ExternalEvent` model (`source`, `externalId`,
`title`, `start`, `end`, `attendees`, `leadId?`) — keep it separate from
`Meeting` so manual CRM meetings and synced calendar events don't get tangled.

### New seam
```ts
// lib/integrations/calendar.ts
export interface CalendarEvent { externalId: string; title: string; start: Date; end: Date; attendees: string[] }
export interface CalendarProvider { fetchEvents(owner: string, from: Date, to: Date): Promise<CalendarEvent[]> }
// MockCalendarProvider returns []  →  GraphCalendarProvider calls Microsoft Graph
```

### Surfacing in the Calendar tab
`app/calendar/page.tsx` already unions lead-derived dates (`callDate`,
`followUpDate`, `closedDate`) + `Meeting` rows into one `Event[]`. Add a fourth
source: `ExternalEvent` rows (type `'outlook'`). One new branch in the existing
loop; the day-grouping UI is untouched.

### The bridge that makes it *CRM* data, not just a calendar
On sync, match each event attendee email against `Lead.email`. On a hit, set
`ExternalEvent.leadId` → the event renders a "View Lead" link, and the lead's
profile can show its real calendar history.

---

## 2. cal.com → Meetings tab

cal.com is where booked calls originate, so this is the highest-value integration
and doubles as **inbound lead capture**. The seed already stores the booking link
(`booking_link_shared = https://cal.com/alex-jordan/discovery`).

### Approach: webhooks (push) — preferred over polling
Configure a cal.com webhook for `BOOKING_CREATED`, `BOOKING_RESCHEDULED`,
`BOOKING_CANCELLED` → `POST /api/integrations/calcom/webhook` (verify the
signature with the cal.com signing secret stored in `Setting`).

On `BOOKING_CREATED`:
1. **Upsert the Lead** by attendee email. New attendee → create a lead
   (`source: 'cal.com'`, `stage: 'Call Booked'`). This is the inbound capture.
2. **Create a `Meeting`** row (title, `date` = booking start, `duration`,
   `notes` = booking description, `leadId`). The existing Meetings tab renders it
   with zero changes.
3. **Set `lead.callDate`** so it also lands on the Calendar tab.
4. **Advance the stage** to `Call Booked` via `applyStageChange` — which now
   fires the workflow engine. So a booking can trigger "notify team", "log a
   note", etc. automatically. End-to-end: *booking → meeting + lead + workflow*.

`BOOKING_CANCELLED` → soft-cancel the meeting and optionally move the lead back.

This is exactly what the existing `bookingProvider.fetchNewBookings()` seam was
designed for; webhooks are simply the real-time version of that poll. Keep a
polling fallback (`GraphCalendarProvider`-style) for backfill / missed webhooks.

### Why not just use the Outlook integration for calls too?
You could — booked calls show up in Outlook. But the cal.com webhook carries
**structured booking metadata** (who booked, which event type, answers to intake
questions, reschedule/cancel state) that a raw calendar event lacks. That
metadata is what turns a calendar entry into a qualified CRM record.

---

## 3. Conversations tab — does it have value?

### Honest assessment of the current tab
Today `Conversation` is a **manual note** per lead (`type`, `body`, `leadId`).
But you've said the actual conversations happen on **cal.com calls** and
**LinkedIn** — channels nobody is going to re-type into a notes box. So as a
manual log it will sit empty and look broken. **In its current form it has little
value.**

### Where the value actually is
A Conversations tab is worth keeping **only if it becomes an auto-aggregated
relationship timeline** — "everything that's ever passed between us and this
person, in one place." That is genuinely valuable for a relationship-led sales
motion. The question is whether it can be fed automatically. Three sources:

| Source | Feasibility | How |
|---|---|---|
| **Call notes / transcripts** (cal.com calls) | **High** | After a call, the meeting + its transcript become a conversation entry. The `sessionNotesProvider` seam already exists; Krisp/Granola/Otter expose transcripts via API. |
| **Email** (Outlook) | **High** | The `inboxProvider` seam already exists. Inbound/outbound mail matched to a lead by address → conversation entries via Microsoft Graph `messages`. |
| **LinkedIn DMs** | **Low / risky** | LinkedIn has no sanctioned messaging API for this. Options: (a) a one-click "Log LinkedIn touch" quick-add (manual but frictionless), (b) third-party unofficial APIs (Unipile / Phantombuster) — paid and ToS-gray, fragile. **Recommend (a) for now.** |

Note: the **workflow engine already writes Conversation rows** ("Log activity
note" action) — the tab is *already* starting to auto-populate from automation.

### Recommendation
**Repurpose, don't delete.** Rename **Conversations → Activity** (or Timeline) and
make it an auto-merged feed of: cal.com call notes/transcripts + Outlook emails +
workflow-generated notes + manual LinkedIn quick-adds. Keep the `Conversation`
model but add a `source` field (`note | call | email | linkedin`) and an optional
`meetingId`/`externalId`. The per-lead detail page shows the same feed inline.

If you'd rather minimize surface area: fold it into the lead-detail timeline and
drop the standalone tab. But given calls + email can feed it cheaply, the
auto-activity feed is the higher-value path and reuses seams you already have.

**Decision needed from you:** (a) repurpose into an auto Activity feed
*(recommended)*, (b) keep manual-only, or (c) remove the tab.

---

## 4. Recommended build order

1. **cal.com webhook** → Meetings + lead capture + stage advance. Highest value,
   self-contained, and exercises the workflow engine you just shipped.
2. **Outlook calendar sync** → `ExternalEvent` + Calendar tab, with attendee→lead
   matching.
3. **Conversations → Activity feed**: first auto-fill from the cal.com meetings
   and workflow notes you already have, then add Outlook email, then a LinkedIn
   quick-add. (Pending your decision in §3.)

Each step is independent and ships value on its own.
