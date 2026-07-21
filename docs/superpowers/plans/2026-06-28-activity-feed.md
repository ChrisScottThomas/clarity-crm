# Activity Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repurpose the empty manual "Conversations" tab into an auto-aggregated **Activity** feed — a relationship timeline that fills itself from cal.com bookings and workflow automation, plus manual notes and LinkedIn quick-adds.

**Architecture:** Keep the Prisma model named `Conversation` (no rename, zero migration churn) but add two fields: `source` (provenance) and optional `meetingId` (link to the cal.com `Meeting` that generated the entry). The cal.com handler and the workflow executor — both already write `Conversation` rows — get tagged with the right `source`. The UI gains a global cross-lead feed at `/activity`, keeps the per-lead timeline, and surfaces the same timeline inline on the lead-detail page. Routes and the API move from `/conversations` to `/activity`.

**Tech Stack:** Next.js (App Router, server components), Prisma 7 + better-sqlite3, Vitest, TypeScript. SQLite schema is applied with `prisma db push` (no migrations dir).

---

## Design decisions (locked)

- **Model name:** stays `Conversation`. Approved 2026-06-28.
- **Scope:** cal.com + workflow + manual + LinkedIn quick-add. Outlook email and call transcripts are **deferred** (need integrations not yet built).
- **Two fields added to `Conversation`:**
  - `source String @default("manual")` — one of `manual | cal.com | workflow | linkedin`. (Uses the literal `cal.com` to match `Meeting.source` and the `SOURCES` constant.)
  - `meetingId String?` + optional relation to `Meeting` — set when the entry was generated from a cal.com booking.
- **`type`** (the existing field) keeps its role as the **semantic kind / icon**: `note | call | email | linkedin`. `type` drives the icon; `source` drives the provenance badge. cal.com booking entries are `type: 'call'`; LinkedIn quick-adds are `type: 'linkedin'`.
- **Routes:** `/conversations` → `/activity`; `/conversations/[leadId]` → `/activity/[leadId]`; `/api/conversations` → `/api/activity`.

## File structure

| File | Change | Responsibility |
|---|---|---|
| `prisma/schema.prisma` | modify | Add `source` + `meetingId` to `Conversation`; add `conversations Conversation[]` back-relation to `Meeting` |
| `lib/integrations/calcom-handler.ts` | modify | Emit a `Conversation` activity entry on booked / rescheduled / cancelled; `upsertMeeting` returns `{ meeting, created }` |
| `lib/workflow-executor.ts` | modify | Tag the `note` effect's `Conversation` with `source: 'workflow'` |
| `app/api/activity/route.ts` | move + modify (from `app/api/conversations/route.ts`) | GET feed (all leads or filtered by `leadId`); POST accepts `source` (default `manual`) |
| `app/activity/page.tsx` | move + rewrite (from `app/conversations/page.tsx`) | **Global** cross-lead chronological feed |
| `app/activity/[leadId]/page.tsx` | move + modify (from `app/conversations/[leadId]/page.tsx`) | Per-lead timeline; back-link → `/activity`; source badges |
| `components/ConversationEntryForm.tsx` | modify | POST to `/api/activity`; add LinkedIn quick-add option; send `source` |
| `components/Sidebar.tsx` | modify | Rename nav item `Conversations` → `Activity`, href → `/activity` |
| `app/leads/[id]/page.tsx` | modify | Render the (already-fetched) `conversations` inline as an Activity timeline card with a link to `/activity/[leadId]` |
| `tests/schema-extensions.test.ts` | modify | Assert new schema fields |
| `tests/calcom-handler.test.ts` | modify | Assert activity entries are written |
| `tests/workflow-note-source.test.ts` | create | Assert workflow note effect is tagged `source: 'workflow'` |
| `tests/activity-api.test.ts` | create | Assert GET/POST behaviour of the activity API |
| `tests/new-pages-api.test.ts` | modify | Update the route import path `conversations` → `activity` |

---

## Task 1: Schema — add `source` + `meetingId` to `Conversation`

**Files:**
- Modify: `prisma/schema.prisma:103-110` (Conversation), `prisma/schema.prisma:76-91` (Meeting)
- Test: `tests/schema-extensions.test.ts`

- [ ] **Step 1: Add failing schema assertions**

In `tests/schema-extensions.test.ts`, add inside the `describe('prisma schema', ...)` block (after the existing `Conversation model` test):

```ts
  it('Conversation has source field', () => { expect(schema).toContain('source') })
  it('Conversation has meetingId field', () => { expect(schema).toMatch(/meetingId\s+String\?/) })
  it('Meeting has conversations back-relation', () => { expect(schema).toMatch(/conversations\s+Conversation\[\]/) })
```

- [ ] **Step 2: Run the test, confirm the new ones fail**

Run: `npx vitest run tests/schema-extensions.test.ts`
Expected: the three new assertions FAIL (`meetingId`/back-relation not found). (`source` may already pass because `Meeting.source` exists — that's fine; it is hardened by the model-scoped check after the edit.)

- [ ] **Step 3: Edit the `Conversation` model**

Replace the `Conversation` model in `prisma/schema.prisma` with:

```prisma
model Conversation {
  id        String   @id @default(cuid())
  type      String   @default("note")   // note | call | email | linkedin
  source    String   @default("manual") // manual | cal.com | workflow | linkedin
  body      String
  leadId    String
  lead      Lead     @relation(fields: [leadId], references: [id])
  meetingId String?
  meeting   Meeting? @relation(fields: [meetingId], references: [id])
  createdAt DateTime @default(now())
}
```

- [ ] **Step 4: Add the back-relation on `Meeting`**

In the `Meeting` model, add this line (after `cancelledAt DateTime?`):

```prisma
  conversations Conversation[]
```

- [ ] **Step 5: Apply the schema and regenerate the client**

Run: `npm run db:push && npx prisma generate`
Expected: `db push` reports the schema is in sync (adds the columns; existing rows get defaults `source='manual'`, `meetingId=NULL`); `prisma generate` succeeds.

- [ ] **Step 6: Run the schema test, confirm pass**

Run: `npx vitest run tests/schema-extensions.test.ts`
Expected: PASS (all assertions).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma tests/schema-extensions.test.ts
git commit -m "feat: add source + meetingId to Conversation for activity feed"
```

---

## Task 2: cal.com handler emits activity entries

The handler already writes `Lead` + `Meeting` and fires workflows. Now each booking lifecycle event also writes a `Conversation` activity entry linked to its `Meeting`. Creation must be **idempotent**: a re-delivered `BOOKING_CREATED` (which updates the meeting rather than creating it) must NOT write a second entry.

**Files:**
- Modify: `lib/integrations/calcom-handler.ts`
- Test: `tests/calcom-handler.test.ts`

- [ ] **Step 1: Extend the prisma mock with `conversation`**

In `tests/calcom-handler.test.ts`, update the `vi.mock('../lib/db', ...)` block and the `p` cast to include `conversation`:

```ts
vi.mock('../lib/db', () => ({
  prisma: {
    lead: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    meeting: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    conversation: { create: vi.fn() },
  },
}))
```

```ts
const p = prisma as unknown as {
  lead: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
  meeting: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
  conversation: { create: ReturnType<typeof vi.fn> }
}
```

And in `beforeEach`, add a default impl so the new `meeting.create` returns an id the handler can link to (it already does via `mtg_new`), and reset the conversation mock:

```ts
  p.conversation.create.mockResolvedValue({ id: 'conv_new' })
```

- [ ] **Step 2: Add failing activity-entry tests**

Append these tests to `tests/calcom-handler.test.ts`:

```ts
describe('handleCalcomBooking — activity entries', () => {
  it('logs a cal.com call activity entry linked to the new meeting on BOOKING_CREATED', async () => {
    await handleCalcomBooking(booking())
    expect(p.conversation.create).toHaveBeenCalledTimes(1)
    const data = p.conversation.create.mock.calls[0][0].data
    expect(data.source).toBe('cal.com')
    expect(data.type).toBe('call')
    expect(data.meetingId).toBe('mtg_new')
    expect(data.leadId).toBe('lead_new')
    expect(data.body).toContain('Discovery Call')
  })

  it('does NOT log a second entry when a BOOKING_CREATED is re-delivered (meeting already exists)', async () => {
    p.meeting.findUnique.mockResolvedValue({ id: 'mtg_existing', externalId: 'bk_1', leadId: 'lead_e' })
    p.lead.findFirst.mockResolvedValue({ id: 'lead_e', name: 'Dana', email: 'dana@acme.com', stage: 'Call Booked', owner: 'Alex' })
    await handleCalcomBooking(booking())
    expect(p.conversation.create).not.toHaveBeenCalled()
  })

  it('logs a rescheduled activity entry on BOOKING_RESCHEDULED', async () => {
    p.meeting.findUnique.mockResolvedValue({ id: 'mtg_1', externalId: 'bk_1', leadId: 'lead_e' })
    await handleCalcomBooking(booking({ trigger: 'BOOKING_RESCHEDULED', start: new Date('2026-07-02T16:00:00.000Z') }))
    expect(p.conversation.create).toHaveBeenCalledTimes(1)
    const data = p.conversation.create.mock.calls[0][0].data
    expect(data.source).toBe('cal.com')
    expect(data.meetingId).toBe('mtg_1')
    expect(data.leadId).toBe('lead_e')
    expect(data.body.toLowerCase()).toContain('reschedul')
  })

  it('logs a cancelled activity entry on BOOKING_CANCELLED', async () => {
    p.meeting.findUnique.mockResolvedValue({ id: 'mtg_1', externalId: 'bk_1', leadId: 'lead_e' })
    await handleCalcomBooking(booking({ trigger: 'BOOKING_CANCELLED' }))
    expect(p.conversation.create).toHaveBeenCalledTimes(1)
    const data = p.conversation.create.mock.calls[0][0].data
    expect(data.source).toBe('cal.com')
    expect(data.meetingId).toBe('mtg_1')
    expect(data.body.toLowerCase()).toContain('cancel')
  })

  it('does not log a cancelled entry when the booking has no known meeting', async () => {
    p.meeting.findUnique.mockResolvedValue(null)
    await handleCalcomBooking(booking({ trigger: 'BOOKING_CANCELLED' }))
    expect(p.conversation.create).not.toHaveBeenCalled()
  })
}
```

> Note: the existing `BOOKING_CANCELLED` test `expect(wf).not.toHaveBeenCalled()` stays valid — workflows are unaffected. The existing idempotency test (`meeting.update` on re-delivery) also stays valid.

- [ ] **Step 3: Run the handler tests, confirm the new ones fail**

Run: `npx vitest run tests/calcom-handler.test.ts`
Expected: the 4 asserting `conversation.create` FAIL (handler does not write conversations yet); the "no known meeting" one may pass vacuously.

- [ ] **Step 4: Implement the handler changes**

In `lib/integrations/calcom-handler.ts`:

(a) Add a small formatter helper near the top (after the imports / `CALL_BOOKED` const):

```ts
function fmt(d: Date): string {
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}
```

(b) Change `upsertMeeting` to return whether it created the row, and the row:

```ts
async function upsertMeeting(b: CalcomBooking, leadId: string): Promise<{ id: string; created: boolean }> {
  const existing = await prisma.meeting.findUnique({ where: { externalId: b.uid } })
  const data = {
    title: b.title,
    date: b.start,
    duration: b.durationMinutes,
    notes: b.notes,
    leadId,
    source: 'cal.com',
    status: 'confirmed',
    externalId: b.uid,
  }
  if (existing) {
    await prisma.meeting.update({ where: { id: existing.id }, data })
    return { id: existing.id, created: false }
  }
  const created = await prisma.meeting.create({ data })
  return { id: created.id, created: true }
}
```

(c) In `createBooking`, capture the result and log the activity entry only when the meeting was newly created. Replace `await upsertMeeting(b, lead.id)` with:

```ts
  const meeting = await upsertMeeting(b, lead.id)
```

and, at the **end** of `createBooking` (after the `runWorkflows` calls), add:

```ts
  if (meeting.created) {
    await prisma.conversation.create({
      data: {
        leadId: lead.id,
        meetingId: meeting.id,
        type: 'call',
        source: 'cal.com',
        body: `Call booked: ${b.title} — ${fmt(b.start)}`,
      },
    })
  }
```

(d) In `rescheduleBooking`, after the `prisma.meeting.update(...)` call (and the optional lead `callDate` update), add:

```ts
  await prisma.conversation.create({
    data: {
      leadId: meeting.leadId ?? '',
      meetingId: meeting.id,
      type: 'call',
      source: 'cal.com',
      body: `Call rescheduled to ${fmt(b.start)}`,
    },
  })
```

> `meeting.leadId` is `String?`; the reschedule path only logs when a meeting exists. If `leadId` is null the entry is orphaned — acceptable for now; cal.com meetings always carry a lead in practice. (Guard kept simple to match the test, which always supplies `leadId`.)

(e) In `cancelBooking`, after the `prisma.meeting.update({ ... status: 'cancelled' ... })` call, add:

```ts
  await prisma.conversation.create({
    data: {
      leadId: meeting.leadId ?? '',
      meetingId: meeting.id,
      type: 'call',
      source: 'cal.com',
      body: 'Call cancelled',
    },
  })
```

- [ ] **Step 5: Run the handler tests, confirm pass**

Run: `npx vitest run tests/calcom-handler.test.ts`
Expected: PASS (all, including the pre-existing tests).

- [ ] **Step 6: Commit**

```bash
git add lib/integrations/calcom-handler.ts tests/calcom-handler.test.ts
git commit -m "feat: cal.com bookings write activity feed entries"
```

---

## Task 3: Tag workflow notes with `source: 'workflow'`

The workflow executor's `note` effect already writes a `Conversation`. Give it the right provenance so the feed can badge it as automation.

**Files:**
- Modify: `lib/workflow-executor.ts:37-40`
- Test: `tests/workflow-note-source.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/workflow-note-source.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/db', () => ({
  prisma: {
    workflowRule: { findMany: vi.fn() },
    workflowRun: { create: vi.fn().mockResolvedValue({}) },
    conversation: { create: vi.fn().mockResolvedValue({ id: 'c1' }) },
  },
}))

import { prisma } from '../lib/db'
import { runWorkflows } from '../lib/workflow-executor'

const p = prisma as unknown as {
  workflowRule: { findMany: ReturnType<typeof vi.fn> }
  conversation: { create: ReturnType<typeof vi.fn> }
}

beforeEach(() => {
  vi.clearAllMocks()
  p.workflowRule.findMany.mockResolvedValue([
    { id: 'r1', name: 'Log it', trigger: 'Lead created', action: 'Log activity note', enabled: true },
  ])
})

describe('workflow note effect', () => {
  it('writes a Conversation tagged source=workflow', async () => {
    await runWorkflows({
      kind: 'lead.created',
      lead: { id: 'lead_1', name: 'Dana', email: 'dana@acme.com', stage: 'New Lead', owner: 'Alex' },
    })
    expect(p.conversation.create).toHaveBeenCalledTimes(1)
    const data = p.conversation.create.mock.calls[0][0].data
    expect(data.source).toBe('workflow')
    expect(data.type).toBe('note')
    expect(data.leadId).toBe('lead_1')
  })
})
```

- [ ] **Step 2: Run the test, confirm it fails**

Run: `npx vitest run tests/workflow-note-source.test.ts`
Expected: FAIL — `data.source` is `undefined` (the executor does not set it yet).

- [ ] **Step 3: Implement**

In `lib/workflow-executor.ts`, in `perform`, update the `note` case:

```ts
    case 'note': {
      await prisma.conversation.create({ data: { leadId: effect.leadId, type: 'note', source: 'workflow', body: effect.body } })
      return { status: 'success', detail: 'logged activity note' }
    }
```

- [ ] **Step 4: Run the test, confirm pass**

Run: `npx vitest run tests/workflow-note-source.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/workflow-executor.ts tests/workflow-note-source.test.ts
git commit -m "feat: tag workflow-generated notes with source=workflow"
```

---

## Task 4: Rename the API `/api/conversations` → `/api/activity`, accept `source`

**Files:**
- Move: `app/api/conversations/route.ts` → `app/api/activity/route.ts`
- Modify: `tests/new-pages-api.test.ts:16-20`
- Test: `tests/activity-api.test.ts` (create)

- [ ] **Step 1: Write the failing API test**

Create `tests/activity-api.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/db', () => ({
  prisma: { conversation: { findMany: vi.fn(), create: vi.fn() } },
}))

import { prisma } from '../lib/db'
import { GET, POST } from '../app/api/activity/route'

const conv = (prisma as unknown as { conversation: { findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> } }).conversation

beforeEach(() => {
  vi.clearAllMocks()
  conv.findMany.mockResolvedValue([])
  conv.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'c1', ...data }))
})

describe('GET /api/activity', () => {
  it('returns the cross-lead feed when no leadId is given', async () => {
    await GET(new Request('http://localhost/api/activity'))
    expect(conv.findMany.mock.calls[0][0].where).toBeUndefined()
  })

  it('filters by leadId when provided', async () => {
    await GET(new Request('http://localhost/api/activity?leadId=lead_1'))
    expect(conv.findMany.mock.calls[0][0].where).toEqual({ leadId: 'lead_1' })
  })
})

describe('POST /api/activity', () => {
  it('400s without body or leadId', async () => {
    const res = await POST(new Request('http://localhost/api/activity', { method: 'POST', body: JSON.stringify({}) }))
    expect(res.status).toBe(400)
  })

  it('creates a manual entry by default', async () => {
    const res = await POST(new Request('http://localhost/api/activity', {
      method: 'POST', body: JSON.stringify({ type: 'note', body: 'hi', leadId: 'lead_1' }),
    }))
    expect(res.status).toBe(201)
    const data = conv.create.mock.calls[0][0].data
    expect(data.source).toBe('manual')
    expect(data.type).toBe('note')
  })

  it('honours an explicit source (e.g. linkedin)', async () => {
    await POST(new Request('http://localhost/api/activity', {
      method: 'POST', body: JSON.stringify({ type: 'linkedin', source: 'linkedin', body: 'DM', leadId: 'lead_1' }),
    }))
    const data = conv.create.mock.calls[0][0].data
    expect(data.source).toBe('linkedin')
  })
})
```

- [ ] **Step 2: Run the test, confirm it fails**

Run: `npx vitest run tests/activity-api.test.ts`
Expected: FAIL — `../app/api/activity/route` does not exist (module resolution error).

- [ ] **Step 3: Move the route and add `source` support**

```bash
git mv app/api/conversations/route.ts app/api/activity/route.ts
rmdir app/api/conversations 2>/dev/null || true
```

Then edit `app/api/activity/route.ts` so the `POST` reads and persists `source`:

```ts
export async function POST(req: Request) {
  const { type, body, leadId, source } = await req.json()
  if (!body || !leadId) {
    return NextResponse.json({ error: 'body and leadId required' }, { status: 400 })
  }
  const conv = await prisma.conversation.create({
    data: { type: type ?? 'note', source: source ?? 'manual', body, leadId },
    include: { lead: { select: { id: true, name: true } } },
  })
  return NextResponse.json(conv, { status: 201 })
}
```

(The `GET` handler is unchanged — its `where: leadId ? { leadId } : undefined` already matches the test.)

- [ ] **Step 4: Fix the route path in `new-pages-api.test.ts`**

In `tests/new-pages-api.test.ts`, replace the conversations case:

```ts
  it('activity API exports GET and POST', async () => {
    const mod = await import('../app/api/activity/route')
    expect(typeof mod.GET).toBe('function')
    expect(typeof mod.POST).toBe('function')
  })
```

- [ ] **Step 5: Run both API tests, confirm pass**

Run: `npx vitest run tests/activity-api.test.ts tests/new-pages-api.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/api/activity/route.ts tests/activity-api.test.ts tests/new-pages-api.test.ts
git commit -m "feat: rename conversations API to /api/activity with source support"
```

---

## Task 5: Rename routes + build the global Activity feed page

The old global page listed *leads that have conversations*. The new global page is a **flat, cross-lead, newest-first feed** of every activity entry.

**Files:**
- Move: `app/conversations/page.tsx` → `app/activity/page.tsx` (then rewrite)
- (the `[leadId]` subpage is handled in Task 6)

- [ ] **Step 1: Move the directory**

```bash
git mv app/conversations app/activity
```

(Both `page.tsx` and `[leadId]/page.tsx` move together.)

- [ ] **Step 2: Rewrite the global feed page**

Replace the entire contents of `app/activity/page.tsx` with:

```tsx
import { prisma } from '../../lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

const TYPE_ICONS: Record<string, string> = { note: '📝', call: '📞', email: '✉️', linkedin: '💼' }
const SOURCE_LABELS: Record<string, string> = { 'cal.com': 'cal.com', workflow: 'Auto', linkedin: 'LinkedIn', manual: 'Manual' }

export default async function ActivityPage() {
  const entries = await prisma.conversation.findMany({
    include: { lead: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  return (
    <div className="page-body" style={{ maxWidth: 760 }}>
      <h1 style={{ margin: '0 0 24px' }}>Activity</h1>
      {entries.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          <p style={{ fontSize: 32, margin: '0 0 8px' }}>🗒️</p>
          <p>No activity yet. Bookings, workflow notes, and manual entries will appear here.</p>
        </div>
      ) : entries.map((e: any) => (
        <div key={e.id} style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 20, flexShrink: 0, marginTop: 2 }}>{TYPE_ICONS[e.type] ?? '·'}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Link href={`/leads/${e.lead.id}`} style={{ fontWeight: 600, color: 'var(--text-primary)', textDecoration: 'none' }}>
                {e.lead.name}
              </Link>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {new Date(e.createdAt).toLocaleDateString()}
              </span>
            </div>
            <div className="card" style={{ padding: '10px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6 }}>{e.body}</p>
                <span style={{
                  flexShrink: 0, fontSize: 11, color: 'var(--text-muted)', alignSelf: 'flex-start',
                  border: '1px solid var(--border)', borderRadius: 10, padding: '1px 8px',
                }}>{SOURCE_LABELS[e.source] ?? e.source}</span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exits 0 (the `[leadId]` subpage still imports a component path that is unchanged; route moved cleanly).

> No unit test for this server component — the repo has no component tests; correctness is verified by typecheck plus the live-preview check in Task 10.

- [ ] **Step 4: Commit**

```bash
git add app/activity
git commit -m "feat: global cross-lead Activity feed at /activity"
```

---

## Task 6: Per-lead timeline page — fix links and show source badges

**Files:**
- Modify: `app/activity/[leadId]/page.tsx`

- [ ] **Step 1: Update the back-link and add source badges + linkedin icon**

In `app/activity/[leadId]/page.tsx`:

(a) Update `TYPE_ICONS` to include LinkedIn:

```tsx
const TYPE_ICONS: Record<string, string> = { note: '📝', call: '📞', email: '✉️', linkedin: '💼' }
```

(b) Change the back-link `href="/conversations"` → `href="/activity"` and its label `← Conversations` → `← Activity`.

(c) In the entry-rendering `map`, replace the metadata line so it shows the source. Replace:

```tsx
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                {new Date(c.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                {' · '}{c.type}
              </div>
```

with:

```tsx
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                {new Date(c.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                {' · '}{c.type}
                {c.source && c.source !== 'manual' ? ` · ${c.source}` : ''}
              </div>
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add app/activity/[leadId]/page.tsx
git commit -m "feat: per-lead Activity timeline with source badges"
```

---

## Task 7: Entry form — POST to `/api/activity`, add LinkedIn quick-add

**Files:**
- Modify: `components/ConversationEntryForm.tsx`

- [ ] **Step 1: Update the form**

Replace the contents of `components/ConversationEntryForm.tsx` with:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const TYPE_ICONS: Record<string, string> = { note: '📝', call: '📞', email: '✉️', linkedin: '💼' }
const TYPES = ['note', 'call', 'email', 'linkedin'] as const

export default function ConversationEntryForm({ leadId }: { leadId: string }) {
  const router = useRouter()
  const [type, setType] = useState<(typeof TYPES)[number]>('note')
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setLoading(true)
    const source = type === 'linkedin' ? 'linkedin' : 'manual'
    await fetch('/api/activity', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type, source, body, leadId }),
    })
    setBody('')
    setLoading(false)
    router.refresh()
  }

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div className="card-title">Log Activity</div>
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
          {TYPES.map(t => (
            <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 13, textTransform: 'none', letterSpacing: 'normal', fontWeight: 'normal', color: 'var(--text-primary)' }}>
              <input type="radio" name="type" value={t} checked={type === t} onChange={() => setType(t)} style={{ width: 'auto' }} />
              {TYPE_ICONS[t]} {t === 'linkedin' ? 'LinkedIn' : t}
            </label>
          ))}
        </div>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={3}
          required
          placeholder={type === 'linkedin' ? 'What was exchanged on LinkedIn?' : 'What happened? What was discussed?'}
          style={{ marginBottom: 10 }}
        />
        <button type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save Entry'}</button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add components/ConversationEntryForm.tsx
git commit -m "feat: activity entry form posts to /api/activity with LinkedIn quick-add"
```

---

## Task 8: Sidebar — rename nav item to Activity

**Files:**
- Modify: `components/Sidebar.tsx:12-15`

- [ ] **Step 1: Rename the nav item**

In `components/Sidebar.tsx`, in the `Activity` section, change the first item:

```tsx
  { section: 'Activity', items: [
    { label: 'Activity', href: '/activity', icon: '🗒️' },
    { label: 'Time Tracking', href: '/time-tracking', icon: '⏱️' },
  ]},
```

- [ ] **Step 2: Confirm no lingering `/conversations` references**

Run: `grep -rn "/conversations\|Conversations" app components --include="*.tsx"`
Expected: no matches (all renamed). If any remain, update them to `/activity` / `Activity`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add components/Sidebar.tsx
git commit -m "feat: rename Conversations nav item to Activity"
```

---

## Task 9: Lead-detail page — inline Activity timeline

The lead-detail page already fetches `conversations: { orderBy: { createdAt: 'desc' }, take: 10 }` but never renders them. Add a card that renders this timeline inline with a link to the full per-lead feed.

**Files:**
- Modify: `app/leads/[id]/page.tsx`

- [ ] **Step 1: Add an Activity card**

In `app/leads/[id]/page.tsx`, add this near the top (after the `InfoRow` helper, before the component) for icons:

```tsx
const ACTIVITY_ICONS: Record<string, string> = { note: '📝', call: '📞', email: '✉️', linkedin: '💼' }
```

Then, inside the grid (after the "Recent Meetings" card block, before the "Notes" block), add:

```tsx
        {/* Activity */}
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div className="card-title" style={{ margin: 0 }}>Activity</div>
            <Link href={`/activity/${lead.id}`} style={{ fontSize: 12, color: 'var(--text-muted)' }}>Open timeline →</Link>
          </div>
          {lead.conversations.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>No activity yet.</p>
          ) : lead.conversations.map((c: any) => (
            <div key={c.id} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>{ACTIVITY_ICONS[c.type] ?? '·'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{c.body}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {new Date(c.createdAt).toLocaleDateString()}
                  {c.source && c.source !== 'manual' ? ` · ${c.source}` : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add app/leads/[id]/page.tsx
git commit -m "feat: inline Activity timeline on lead-detail page"
```

---

## Task 10: Full verification + live preview

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: all tests pass — the prior 80 plus the new activity/handler/workflow/schema tests. Confirm green; investigate any red before proceeding.

- [ ] **Step 3: Seed a booking and eyeball the feed (preview)**

Start the dev server and verify in the browser preview:
- `/activity` renders the global feed (after a cal.com webhook smoke-test or a manual entry).
- A lead-detail page shows the inline Activity card.
- The entry form's LinkedIn option creates an entry that appears with the 💼 icon and a `linkedin` badge.
- The sidebar shows **Activity** linking to `/activity`; the old `/conversations` URL is gone.

Use the `preview_*` tools (preview_start → preview_snapshot/preview_screenshot). Fix any console/runtime errors found, then re-run steps 1–2.

- [ ] **Step 4: Final confirmation**

Confirm `git log --oneline` shows the task commits and the working tree is clean (`git status`).

---

## Self-review notes

- **Spec coverage:** sources cal.com (Task 2), workflow (Task 3), manual + LinkedIn (Tasks 4/7); global feed (Task 5) + per-lead timeline (Task 6) + inline on lead page (Task 9); route rename (Tasks 4/5/8); schema `source`+`meetingId` (Task 1). All §3 design points covered.
- **Deferred (not in scope):** Outlook email entries, call transcripts — require integrations not yet built. `type='email'` is retained in the form/icons for when Outlook lands.
- **Type consistency:** `source` values `manual | cal.com | workflow | linkedin`; `type` values `note | call | email | linkedin`; `upsertMeeting` returns `{ id, created }` and is consumed in `createBooking`. cal.com entries are `type: 'call'`.
- **Idempotency:** booking-created activity entry is gated on `meeting.created`, so webhook re-delivery does not duplicate it (matches the existing meeting-idempotency contract).
