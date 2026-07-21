# Outlook Calendar Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync Outlook calendar events into a new `ExternalEvent` table, bridge each event to a CRM lead by attendee email, and surface them on the Calendar tab — all mock-first, runnable and testable offline.

**Architecture:** A provider seam (`lib/integrations/calendar.ts`) with an active `MockCalendarProvider` and an inactive `GraphCalendarProvider` stub. An effectful sync handler (`lib/integrations/calendar-sync.ts`) pulls events from the provider, matches attendees to leads, and upserts `ExternalEvent` rows idempotently by `externalId`. A thin `POST /api/integrations/outlook/sync` route drives it, plus a "Sync calendar" button on the Calendar tab.

**Tech Stack:** Next.js (App Router, server components + route handlers), Prisma (SQLite, `prisma db push`), Vitest with mocked `prisma`. Generated Prisma client lives at `app/generated/prisma/client`.

> **Next.js caveat (AGENTS.md):** This repo's Next.js differs from training data. Do not invent route-handler or client-component syntax — copy the established in-repo patterns referenced in each task (`app/api/integrations/calcom/webhook/route.ts` for routes, `components/ConversationEntryForm.tsx` for client components). If unsure, read `node_modules/next/dist/docs/` before writing.

---

## File Structure

- **Create** `lib/integrations/calendar.ts` — the seam: `CalendarEvent`/`CalendarProvider` types, `MockCalendarProvider` (active, sample events), `GraphCalendarProvider` (stub), exported `calendarProvider`.
- **Create** `lib/integrations/calendar-sync.ts` — `syncCalendarEvents()`: fetch → attendee→lead match → idempotent upsert.
- **Create** `app/api/integrations/outlook/sync/route.ts` — `POST` entry point.
- **Create** `app/calendar/SyncCalendarButton.tsx` — client component button calling the sync route + `router.refresh()`.
- **Modify** `prisma/schema.prisma` — add `ExternalEvent` model + `Lead.externalEvents` back-relation.
- **Modify** `app/calendar/page.tsx` — add `ExternalEvent` as a fourth event source + mount the sync button.
- **Modify** `tests/schema-extensions.test.ts` — assert the `ExternalEvent` model shape.
- **Create** `tests/calendar-provider.test.ts`, `tests/calendar-sync.test.ts`, `tests/outlook-sync-route.test.ts`.

---

## Task 1: `ExternalEvent` schema

**Files:**
- Modify: `prisma/schema.prisma`
- Test: `tests/schema-extensions.test.ts`

- [ ] **Step 1: Write the failing tests**

Add these cases inside the existing `describe('prisma schema', ...)` block in `tests/schema-extensions.test.ts`:

```ts
  it('has ExternalEvent model', () => { expect(schema).toContain('model ExternalEvent') })
  it('ExternalEvent has unique externalId', () => { expect(schema).toMatch(/externalId\s+String\s+@unique/) })
  it('Lead has externalEvents back-relation', () => { expect(schema).toMatch(/externalEvents\s+ExternalEvent\[\]/) })
```

(The `externalId String @unique` regex deliberately omits `?`, so it matches `ExternalEvent` and not `Meeting`'s `externalId String? @unique`.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/schema-extensions.test.ts`
Expected: FAIL — the three new assertions fail (schema has no `ExternalEvent`).

- [ ] **Step 3: Add the model and back-relation**

In `prisma/schema.prisma`, add the back-relation line to the `Lead` model, next to `conversations Conversation[]`:

```prisma
  conversations       Conversation[]
  externalEvents      ExternalEvent[]
```

Then add the new model at the end of the file:

```prisma
model ExternalEvent {
  id         String   @id @default(cuid())
  source     String   @default("outlook") // provider tag; future-proofs for google etc.
  externalId String   @unique // provider event id — idempotency key
  title      String
  start      DateTime
  end        DateTime
  attendees  String // JSON-encoded string[] (SQLite has no array type)
  leadId     String?
  lead       Lead?    @relation(fields: [leadId], references: [id])
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}
```

- [ ] **Step 4: Apply the schema and regenerate the client**

Run: `npx prisma db push && npx prisma generate`
Expected: "Your database is now in sync with your Prisma schema." and "Generated Prisma Client".

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/schema-extensions.test.ts`
Expected: PASS (all assertions green).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma tests/schema-extensions.test.ts
git commit -m "feat: add ExternalEvent model for synced calendar events

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Calendar provider seam

**Files:**
- Create: `lib/integrations/calendar.ts`
- Test: `tests/calendar-provider.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/calendar-provider.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { MockCalendarProvider, GraphCalendarProvider, calendarProvider } from '../lib/integrations/calendar'

const from = new Date('2026-06-28T00:00:00.000Z')
const to = new Date('2026-07-28T00:00:00.000Z')

describe('MockCalendarProvider', () => {
  it('returns at least three sample events', async () => {
    const events = await new MockCalendarProvider().fetchEvents('shared', from, to)
    expect(events.length).toBeGreaterThanOrEqual(3)
  })

  it('places every event inside the requested window', async () => {
    const events = await new MockCalendarProvider().fetchEvents('shared', from, to)
    for (const e of events) {
      expect(e.start.getTime()).toBeGreaterThanOrEqual(from.getTime())
      expect(e.start.getTime()).toBeLessThanOrEqual(to.getTime())
      expect(e.end.getTime()).toBeGreaterThan(e.start.getTime())
    }
  })

  it('includes a documented attendee so the lead bridge can be demonstrated', async () => {
    const events = await new MockCalendarProvider().fetchEvents('shared', from, to)
    expect(events.some((e) => e.attendees.includes('dana@acme.com'))).toBe(true)
  })

  it('gives every event a unique externalId', async () => {
    const events = await new MockCalendarProvider().fetchEvents('shared', from, to)
    const ids = events.map((e) => e.externalId)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('GraphCalendarProvider', () => {
  it('throws until implemented (we are mock-first in local dev)', async () => {
    await expect(new GraphCalendarProvider().fetchEvents('shared', from, to)).rejects.toThrow(/not implemented/i)
  })
})

describe('calendarProvider', () => {
  it('is the mock in local dev', () => {
    expect(calendarProvider).toBeInstanceOf(MockCalendarProvider)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/calendar-provider.test.ts`
Expected: FAIL — "Failed to resolve import '../lib/integrations/calendar'".

- [ ] **Step 3: Write the seam**

Create `lib/integrations/calendar.ts`:

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

/**
 * Active provider in local dev. Returns a small fixed set of plausible Outlook
 * events spread across the requested window. One uses a documented attendee
 * (dana@acme.com) so the attendee->lead bridge can be shown once a matching lead
 * exists; the others use clearly-fake addresses that won't match anything.
 */
export class MockCalendarProvider implements CalendarProvider {
  async fetchEvents(_owner: string, from: Date, _to: Date): Promise<CalendarEvent[]> {
    const at = (days: number, hours: number) => new Date(from.getTime() + days * 86400000 + hours * 3600000)
    const mk = (
      externalId: string,
      title: string,
      start: Date,
      durationMinutes: number,
      attendees: string[],
    ): CalendarEvent => ({
      externalId,
      title,
      start,
      end: new Date(start.getTime() + durationMinutes * 60000),
      attendees,
    })
    return [
      mk('outlook-mock-1', 'Discovery Call — Dana Acme', at(1, 10), 30, ['dana@acme.com']),
      mk('outlook-mock-2', 'Product Sync', at(3, 14), 60, ['sam@northwind.example']),
      mk('outlook-mock-3', 'Quarterly Review', at(7, 9), 45, ['jordan@example.com', 'lee@globex.example']),
    ]
  }
}

/** Real Microsoft Graph provider — inactive. Built when we move out of local dev. */
export class GraphCalendarProvider implements CalendarProvider {
  async fetchEvents(_owner: string, _from: Date, _to: Date): Promise<CalendarEvent[]> {
    throw new Error('GraphCalendarProvider not implemented — using mock in local dev')
  }
}

export const calendarProvider: CalendarProvider = new MockCalendarProvider()
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/calendar-provider.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add lib/integrations/calendar.ts tests/calendar-provider.test.ts
git commit -m "feat: add calendar provider seam (mock active, Graph stub)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Sync handler

**Files:**
- Create: `lib/integrations/calendar-sync.ts`
- Test: `tests/calendar-sync.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/calendar-sync.test.ts`. It mocks both `prisma` and the provider module so the handler runs fully offline:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CalendarEvent } from '../lib/integrations/calendar'

vi.mock('../lib/db', () => ({
  prisma: {
    lead: { findFirst: vi.fn() },
    externalEvent: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('../lib/integrations/calendar', () => ({ calendarProvider: { fetchEvents: vi.fn() } }))

import { prisma } from '../lib/db'
import { calendarProvider } from '../lib/integrations/calendar'
import { syncCalendarEvents } from '../lib/integrations/calendar-sync'

const p = prisma as unknown as {
  lead: { findFirst: ReturnType<typeof vi.fn> }
  externalEvent: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
}
const fetchEvents = (calendarProvider as unknown as { fetchEvents: ReturnType<typeof vi.fn> }).fetchEvents

function ev(over: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    externalId: 'evt_1',
    title: 'Discovery Call',
    start: new Date('2026-07-01T10:00:00.000Z'),
    end: new Date('2026-07-01T10:30:00.000Z'),
    attendees: ['dana@acme.com'],
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  p.lead.findFirst.mockResolvedValue(null)
  p.externalEvent.findUnique.mockResolvedValue(null)
  p.externalEvent.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'ext_new', ...data }))
  p.externalEvent.update.mockImplementation(({ data }: any) => Promise.resolve({ id: 'ext_x', ...data }))
  fetchEvents.mockResolvedValue([])
})

describe('syncCalendarEvents', () => {
  it('creates a new ExternalEvent for an unseen event', async () => {
    fetchEvents.mockResolvedValue([ev()])
    const result = await syncCalendarEvents()
    expect(p.externalEvent.create).toHaveBeenCalledTimes(1)
    const data = p.externalEvent.create.mock.calls[0][0].data
    expect(data.externalId).toBe('evt_1')
    expect(data.source).toBe('outlook')
    expect(data.title).toBe('Discovery Call')
    expect(result).toEqual({ created: 1, updated: 0, linked: 0 })
  })

  it('serializes attendees to a JSON string', async () => {
    fetchEvents.mockResolvedValue([ev({ attendees: ['a@x.com', 'b@y.com'] })])
    await syncCalendarEvents()
    const data = p.externalEvent.create.mock.calls[0][0].data
    expect(data.attendees).toBe(JSON.stringify(['a@x.com', 'b@y.com']))
  })

  it('links the event to a lead whose email matches an attendee', async () => {
    p.lead.findFirst.mockResolvedValue({ id: 'lead_1', email: 'dana@acme.com' })
    fetchEvents.mockResolvedValue([ev()])
    const result = await syncCalendarEvents()
    expect(p.lead.findFirst).toHaveBeenCalledWith({ where: { email: { in: ['dana@acme.com'] } } })
    expect(p.externalEvent.create.mock.calls[0][0].data.leadId).toBe('lead_1')
    expect(result.linked).toBe(1)
  })

  it('leaves leadId null when no lead matches', async () => {
    fetchEvents.mockResolvedValue([ev()])
    const result = await syncCalendarEvents()
    expect(p.externalEvent.create.mock.calls[0][0].data.leadId).toBeNull()
    expect(result.linked).toBe(0)
  })

  it('is idempotent: a re-synced event updates instead of duplicating', async () => {
    p.externalEvent.findUnique.mockResolvedValue({ id: 'ext_existing', externalId: 'evt_1' })
    fetchEvents.mockResolvedValue([ev()])
    const result = await syncCalendarEvents()
    expect(p.externalEvent.create).not.toHaveBeenCalled()
    expect(p.externalEvent.update).toHaveBeenCalledTimes(1)
    expect(p.externalEvent.update.mock.calls[0][0].where).toEqual({ id: 'ext_existing' })
    expect(result).toEqual({ created: 0, updated: 1, linked: 0 })
  })

  it('skips the lead lookup when an event has no attendees', async () => {
    fetchEvents.mockResolvedValue([ev({ attendees: [] })])
    await syncCalendarEvents()
    expect(p.lead.findFirst).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/calendar-sync.test.ts`
Expected: FAIL — "Failed to resolve import '../lib/integrations/calendar-sync'".

- [ ] **Step 3: Write the handler**

Create `lib/integrations/calendar-sync.ts`:

```ts
import { prisma } from '../db'
import { calendarProvider } from './calendar'

const WINDOW_DAYS = 30

/**
 * Pull calendar events from the active provider, match each to a lead by
 * attendee email, and upsert ExternalEvent rows idempotently by externalId.
 * Effectful. Returns per-sync counts.
 */
export async function syncCalendarEvents(
  owner = 'shared',
): Promise<{ created: number; updated: number; linked: number }> {
  const now = new Date()
  const to = new Date(now.getTime() + WINDOW_DAYS * 86400000)
  const events = await calendarProvider.fetchEvents(owner, now, to)

  let created = 0
  let updated = 0
  let linked = 0

  for (const e of events) {
    const lead = e.attendees.length
      ? await prisma.lead.findFirst({ where: { email: { in: e.attendees } } })
      : null
    const leadId = lead?.id ?? null
    if (leadId) linked++

    const data = {
      source: 'outlook',
      title: e.title,
      start: e.start,
      end: e.end,
      attendees: JSON.stringify(e.attendees),
      leadId,
    }

    const existing = await prisma.externalEvent.findUnique({ where: { externalId: e.externalId } })
    if (existing) {
      await prisma.externalEvent.update({ where: { id: existing.id }, data })
      updated++
    } else {
      await prisma.externalEvent.create({ data: { ...data, externalId: e.externalId } })
      created++
    }
  }

  return { created, updated, linked }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/calendar-sync.test.ts`
Expected: PASS (all six cases green).

- [ ] **Step 5: Commit**

```bash
git add lib/integrations/calendar-sync.ts tests/calendar-sync.test.ts
git commit -m "feat: add calendar sync handler with attendee->lead matching

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Sync API route

**Files:**
- Create: `app/api/integrations/outlook/sync/route.ts`
- Test: `tests/outlook-sync-route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/outlook-sync-route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/integrations/calendar-sync', () => ({ syncCalendarEvents: vi.fn() }))

import { syncCalendarEvents } from '../lib/integrations/calendar-sync'
import { POST } from '../app/api/integrations/outlook/sync/route'

const sync = syncCalendarEvents as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  sync.mockResolvedValue({ created: 2, updated: 1, linked: 1 })
})

describe('POST /api/integrations/outlook/sync', () => {
  it('runs the sync and returns the counts', async () => {
    const res = await POST()
    expect(sync).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ ok: true, created: 2, updated: 1, linked: 1 })
  })

  it('500s when the sync throws', async () => {
    sync.mockRejectedValue(new Error('boom'))
    const res = await POST()
    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/outlook-sync-route.test.ts`
Expected: FAIL — "Failed to resolve import '../app/api/integrations/outlook/sync/route'".

- [ ] **Step 3: Write the route**

Create `app/api/integrations/outlook/sync/route.ts` (mirrors `app/api/integrations/calcom/webhook/route.ts`; note the five `../` to reach `lib`):

```ts
import { NextResponse } from 'next/server'
import { syncCalendarEvents } from '../../../../../lib/integrations/calendar-sync'

// TODO: protect when live (auth + resolve owner from session) — local/mock for now.
export async function POST() {
  try {
    const result = await syncCalendarEvents()
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    console.error('outlook calendar sync error', e)
    return NextResponse.json({ error: 'sync error' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/outlook-sync-route.test.ts`
Expected: PASS (both cases green).

- [ ] **Step 5: Commit**

```bash
git add app/api/integrations/outlook/sync/route.ts tests/outlook-sync-route.test.ts
git commit -m "feat: add POST /api/integrations/outlook/sync entry point

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Surface on the Calendar tab

This task has no unit test (it is server-component rendering + a thin client button); it is verified by the build and the manual smoke check in Task 6. Follow the existing client-component pattern in `components/ConversationEntryForm.tsx` (`'use client'` + `useRouter` from `next/navigation`).

**Files:**
- Create: `app/calendar/SyncCalendarButton.tsx`
- Modify: `app/calendar/page.tsx`

- [ ] **Step 1: Create the sync button client component**

Create `app/calendar/SyncCalendarButton.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SyncCalendarButton() {
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)

  async function sync() {
    setSyncing(true)
    try {
      await fetch('/api/integrations/outlook/sync', { method: 'POST' })
      router.refresh()
    } finally {
      setSyncing(false)
    }
  }

  return (
    <button
      onClick={sync}
      disabled={syncing}
      style={{
        padding: '8px 16px', borderRadius: 6, fontSize: 14, fontWeight: 500, cursor: 'pointer',
        background: 'var(--bg-overlay)', color: 'var(--text-secondary)', border: '1px solid var(--border)',
        opacity: syncing ? 0.6 : 1,
      }}
    >
      {syncing ? 'Syncing…' : '↻ Sync calendar'}
    </button>
  )
}
```

- [ ] **Step 2: Add the ExternalEvent source to the Calendar page**

In `app/calendar/page.tsx`, make the following edits.

(a) Add the import near the top, after `import Link from 'next/link'`:

```tsx
import SyncCalendarButton from './SyncCalendarButton'
```

(b) Extend the `Event` type union (`app/calendar/page.tsx:8`) to include `'outlook'`:

```tsx
type Event = {
  id: string
  type: 'call' | 'follow-up' | 'close' | 'meeting' | 'outlook'
  title: string
  date: Date
  leadId?: string
}
```

(c) Add an `externalEvent` query to the `Promise.all` (alongside `leads` and `meetings`). Replace `const [leads, meetings] = await Promise.all([` ... `])` so it reads:

```tsx
  const [leads, meetings, externalEvents] = await Promise.all([
    prisma.lead.findMany({
      where: {
        OR: [
          { callDate: { gte: now, lte: thirtyDaysOut } },
          { followUpDate: { gte: now, lte: thirtyDaysOut } },
          { closedDate: { gte: now, lte: thirtyDaysOut } },
        ],
      },
      select: { id: true, name: true, callDate: true, followUpDate: true, closedDate: true },
    }),
    prisma.meeting.findMany({
      where: { date: { gte: now, lte: thirtyDaysOut } },
      include: { lead: { select: { id: true, name: true } } },
      orderBy: { date: 'asc' },
    }),
    prisma.externalEvent.findMany({
      where: { start: { gte: now, lte: thirtyDaysOut } },
      include: { lead: { select: { id: true, name: true } } },
      orderBy: { start: 'asc' },
    }),
  ])
```

(d) After the `for (const m of meetings)` loop that pushes meeting events, add a loop for external events:

```tsx
  for (const ev of externalEvents) {
    events.push({ id: `ext-${ev.id}`, type: 'outlook', title: ev.title, date: ev.start, leadId: ev.lead?.id })
  }
```

(e) Add an `outlook` entry to `typeConfig`:

```tsx
  const typeConfig: Record<string, { color: string; icon: string }> = {
    call: { color: 'var(--accent-blue)', icon: '📞' },
    'follow-up': { color: 'var(--accent-yellow)', icon: '🔔' },
    close: { color: 'var(--accent-green)', icon: '🎯' },
    meeting: { color: 'var(--accent-purple)', icon: '🗓️' },
    outlook: { color: 'var(--accent-blue)', icon: '📆' },
  }
```

(f) Mount the sync button in the header. Replace the existing `<Link href="/meetings" ...>+ Log Meeting</Link>` with both controls wrapped in a flex container:

```tsx
        <div style={{ display: 'flex', gap: 8 }}>
          <SyncCalendarButton />
          <Link href="/meetings" style={{
            padding: '8px 16px', borderRadius: 6, fontSize: 14, fontWeight: 500,
            background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)', textDecoration: 'none',
          }}>+ Log Meeting</Link>
        </div>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: exits 0. (If you see stale `.next/dev/types` errors, run `rm -rf .next` and retry.)

- [ ] **Step 4: Commit**

```bash
git add app/calendar/page.tsx app/calendar/SyncCalendarButton.tsx
git commit -m "feat: surface synced Outlook events + Sync button on Calendar tab

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — all prior tests plus the new `calendar-provider`, `calendar-sync`, `outlook-sync-route`, and extended `schema-extensions` cases. (Baseline before this work was 95 tests / 17 files; expect that plus the new files and cases.)

- [ ] **Step 2: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: exits 0. (If stale `.next/dev/types` errors reference old paths, `rm -rf .next` and retry.)

- [ ] **Step 3: Production build**

Run: `npx next build`
Expected: succeeds; the route table lists `ƒ /api/integrations/outlook/sync`.

- [ ] **Step 4: Manual smoke check (mock flow end-to-end)**

```bash
npx next dev
```

Then:
1. Open `/calendar`. Click **↻ Sync calendar**. Three Outlook events (📆) appear in the next-30-days feed — "Discovery Call — Dana Acme", "Product Sync", "Quarterly Review".
2. Click **Sync calendar** again → no duplicates (idempotent upsert).
3. (Bridge demo) Create a lead with email `dana@acme.com`, click **Sync calendar** again → the "Discovery Call — Dana Acme" event now shows a **View Lead →** link.

Stop the dev server when done.

- [ ] **Step 5: Final commit (if any uncommitted changes remain)**

```bash
git status --short
# If nothing is staged/modified, this task is complete — no commit needed.
```

---

## Notes for the implementer

- **No migrations dir** — schema changes go through `npx prisma db push` (Task 1, Step 4). The Prisma client must be regenerated (`npx prisma generate`) in this worktree or types won't resolve.
- **Mock-first** — `GraphCalendarProvider` intentionally throws. Do not wire real Microsoft Graph / OAuth; that is explicitly out of scope (see the spec's "Out of scope" section).
- **Seed stays leadless by design** — do not add demo leads to `prisma/seed.ts`. The bridge is proven by `tests/calendar-sync.test.ts` and the optional manual step in Task 6.
- Spec: `docs/superpowers/specs/2026-06-28-outlook-calendar-sync-design.md`.
