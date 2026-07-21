# Outlook Email → Activity Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-populate the Activity feed with a lead's Outlook email history (both directions), matched to the lead by address, using the same mock-first provider seam as the shipped calendar sync.

**Architecture:** Widen the `inbox.ts` provider seam to return directional `EmailMessage`s; a `syncEmailActivity` handler matches each message's counterpart address to a `Lead` and upserts matched messages as `Conversation` rows (`type:'email'`, `source:'outlook'`) idempotently by a new `Conversation.externalId`. Unmatched messages are skipped. A `POST` route + a client "Sync email" button on the Activity page trigger it. The Activity feed already renders `Conversation` rows, so there are no feed-query changes.

**Tech Stack:** Next.js (app router, server components), Prisma + SQLite, Vitest, TypeScript.

**Spec:** `docs/superpowers/specs/2026-07-02-outlook-email-activity-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` | add `Conversation.externalId String? @unique` (idempotency key) |
| `lib/integrations/inbox.ts` | provider seam: `EmailMessage`, `InboxProvider.fetchMessages`, `MockInboxProvider` (active), `GraphInboxProvider` (stub) |
| `lib/integrations/email-sync.ts` | **new** — `syncEmailActivity`: fetch → match → upsert Conversation |
| `lib/constants.ts` | add `TEAM_EMAILS`; add `outlook` to `SOURCE_LABELS` |
| `app/api/integrations/outlook/email/sync/route.ts` | **new** — POST entry point |
| `components/SyncEmailButton.tsx` | **new** — client "Sync email" button |
| `app/activity/page.tsx` | render `SyncEmailButton` in the header |
| `tests/schema-extensions.test.ts` | assert the new schema field |
| `tests/inbox-provider.test.ts` | **new** — mock/stub provider behavior |
| `tests/email-sync.test.ts` | **new** — sync handler behavior |
| `tests/email-sync-route.test.ts` | **new** — route behavior |

**Convention note:** run all commands from the worktree root
(e.g. `<repo>/.claude/worktrees/<worktree-name>`).
Prisma client is per-worktree — if types don't resolve, run `npx prisma generate`.

---

## Task 1: Add `Conversation.externalId` schema field

**Files:**
- Modify: `prisma/schema.prisma` (the `model Conversation { … }` block)
- Test: `tests/schema-extensions.test.ts`

- [ ] **Step 1: Write the failing test**

Add this `it(...)` inside the `describe('prisma schema', …)` block in `tests/schema-extensions.test.ts` (after the existing `Conversation has meetingId field` line):

```ts
  it('Conversation has unique externalId', () => { expect(schema).toMatch(/externalId\s+String\?\s+@unique/) })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/schema-extensions.test.ts`
Expected: FAIL — the `Conversation has unique externalId` assertion does not match (no such field yet).

- [ ] **Step 3: Add the field to the schema**

In `prisma/schema.prisma`, add one line to the `Conversation` model (after the `meetingId` / `meeting` lines, before the closing `}`):

```prisma
  externalId String? @unique // provider message id — idempotency for synced email; null for manual/workflow/cal.com
```

- [ ] **Step 4: Push the schema and regenerate the client**

Run: `npx prisma db push && npx prisma generate`
Expected: "Your database is now in sync with your Prisma schema" and a generated client. (No migrations dir — this project uses `db push`, matching the calendar work.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/schema-extensions.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma tests/schema-extensions.test.ts
git commit -m "feat: add Conversation.externalId for synced-email idempotency"
```

---

## Task 2: Widen the inbox provider seam

**Files:**
- Modify: `lib/integrations/inbox.ts` (full rewrite — nothing consumes the old seam yet)
- Test: `tests/inbox-provider.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/inbox-provider.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { MockInboxProvider, GraphInboxProvider, inboxProvider } from '../lib/integrations/inbox'

const to = new Date()
const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000)

describe('MockInboxProvider', () => {
  it('returns at least three sample messages', async () => {
    const msgs = await new MockInboxProvider().fetchMessages('shared', from, to)
    expect(msgs.length).toBeGreaterThanOrEqual(3)
  })

  it('places every message inside the requested window', async () => {
    const msgs = await new MockInboxProvider().fetchMessages('shared', from, to)
    for (const m of msgs) {
      expect(m.sentAt.getTime()).toBeGreaterThanOrEqual(from.getTime())
      expect(m.sentAt.getTime()).toBeLessThanOrEqual(to.getTime())
    }
  })

  it('includes dana@acme.com in both an inbound and an outbound message', async () => {
    const msgs = await new MockInboxProvider().fetchMessages('shared', from, to)
    const touchesDana = (m: { from: string; to: string[] }) =>
      m.from === 'dana@acme.com' || m.to.includes('dana@acme.com')
    expect(msgs.some((m) => touchesDana(m) && m.direction === 'inbound')).toBe(true)
    expect(msgs.some((m) => touchesDana(m) && m.direction === 'outbound')).toBe(true)
  })

  it('gives every message a unique externalId', async () => {
    const msgs = await new MockInboxProvider().fetchMessages('shared', from, to)
    const ids = msgs.map((m) => m.externalId)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('GraphInboxProvider', () => {
  it('throws until implemented (mock-first in local dev)', async () => {
    await expect(new GraphInboxProvider().fetchMessages('shared', from, to)).rejects.toThrow(/not implemented/i)
  })
})

describe('inboxProvider', () => {
  it('is the mock in local dev', () => {
    expect(inboxProvider).toBeInstanceOf(MockInboxProvider)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/inbox-provider.test.ts`
Expected: FAIL — `MockInboxProvider` / `GraphInboxProvider` are not exported (old file only has `MockInboxProvider` with `fetchInbound`).

- [ ] **Step 3: Rewrite the seam**

Replace the entire contents of `lib/integrations/inbox.ts` with:

```ts
export interface EmailMessage {
  externalId: string                    // provider message id — idempotency key
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

/**
 * Active provider in local dev. Returns a small fixed set of plausible Outlook
 * messages spread across the (backward-looking) window. Two touch dana@acme.com —
 * one inbound, one outbound — the same documented lead the calendar mock uses, so
 * both integrations light up one lead. Others use clearly-fake addresses that
 * won't match anything.
 */
export class MockInboxProvider implements InboxProvider {
  async fetchMessages(_owner: string, from: Date, to: Date): Promise<EmailMessage[]> {
    const daysBefore = (days: number, hours: number) =>
      new Date(to.getTime() - days * 86400000 + hours * 3600000)
    const mk = (
      externalId: string,
      direction: 'inbound' | 'outbound',
      fromAddr: string,
      toAddrs: string[],
      subject: string,
      snippet: string,
      sentAt: Date,
    ): EmailMessage => ({ externalId, direction, from: fromAddr, to: toAddrs, subject, snippet, sentAt })
    return [
      mk('outlook-msg-1', 'inbound', 'dana@acme.com', ['alex@example.com'],
        'Re: Pricing', "thanks, let's get a call booked next week", daysBefore(2, 9)),
      mk('outlook-msg-2', 'outbound', 'alex@example.com', ['dana@acme.com'],
        'Intro & next steps', 'great to connect — quick overview attached', daysBefore(5, 14)),
      mk('outlook-msg-3', 'inbound', 'sam@northwind.example', ['jordan@example.com'],
        'Question about your service', 'do you work with teams under 10?', daysBefore(9, 11)),
    ].filter((m) => m.sentAt >= from && m.sentAt <= to)
  }
}

/** Real Microsoft Graph provider — inactive. Built when we move out of local dev. */
export class GraphInboxProvider implements InboxProvider {
  async fetchMessages(_owner: string, _from: Date, _to: Date): Promise<EmailMessage[]> {
    throw new Error('GraphInboxProvider not implemented — using mock in local dev')
  }
}

export const inboxProvider: InboxProvider = new MockInboxProvider()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/inbox-provider.test.ts`
Expected: PASS (all 6 assertions).

- [ ] **Step 5: Commit**

```bash
git add lib/integrations/inbox.ts tests/inbox-provider.test.ts
git commit -m "feat: widen inbox seam to directional EmailMessage (mock active, Graph stub)"
```

---

## Task 3: Sync handler `syncEmailActivity`

**Files:**
- Create: `lib/integrations/email-sync.ts`
- Modify: `lib/constants.ts` (add `TEAM_EMAILS`)
- Test: `tests/email-sync.test.ts` (new)

- [ ] **Step 1: Add the `TEAM_EMAILS` constant**

In `lib/constants.ts`, add near the top-level constants (e.g. just below the `SOURCE_LABELS` block):

```ts
// Our own team mailboxes — excluded when matching a synced email's counterpart to a lead,
// so an internal recipient never matches as the "lead". Real addresses arrive with the Graph provider.
export const TEAM_EMAILS = ['alex@example.com', 'jordan@example.com'] as const
```

- [ ] **Step 2: Write the failing test**

Create `tests/email-sync.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { EmailMessage } from '../lib/integrations/inbox'

vi.mock('../lib/db', () => ({
  prisma: {
    lead: { findFirst: vi.fn() },
    conversation: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('../lib/integrations/inbox', () => ({ inboxProvider: { fetchMessages: vi.fn() } }))

import { prisma } from '../lib/db'
import { inboxProvider } from '../lib/integrations/inbox'
import { syncEmailActivity } from '../lib/integrations/email-sync'

const p = prisma as unknown as {
  lead: { findFirst: ReturnType<typeof vi.fn> }
  conversation: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
}
const fetchMessages = (inboxProvider as unknown as { fetchMessages: ReturnType<typeof vi.fn> }).fetchMessages

function msg(over: Partial<EmailMessage> = {}): EmailMessage {
  return {
    externalId: 'msg_1',
    direction: 'inbound',
    from: 'dana@acme.com',
    to: ['alex@example.com'],
    subject: 'Re: Pricing',
    snippet: 'lets book a call',
    sentAt: new Date('2026-06-20T09:00:00.000Z'),
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  p.lead.findFirst.mockResolvedValue(null)
  p.conversation.findUnique.mockResolvedValue(null)
  p.conversation.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'conv_new', ...data }))
  p.conversation.update.mockImplementation(({ data }: any) => Promise.resolve({ id: 'conv_x', ...data }))
  fetchMessages.mockResolvedValue([])
})

describe('syncEmailActivity', () => {
  it('creates a Conversation for a matched inbound email', async () => {
    p.lead.findFirst.mockResolvedValue({ id: 'lead_1', email: 'dana@acme.com' })
    fetchMessages.mockResolvedValue([msg()])
    const result = await syncEmailActivity()
    expect(p.lead.findFirst).toHaveBeenCalledWith({ where: { email: { in: ['dana@acme.com'] } } })
    const data = p.conversation.create.mock.calls[0][0].data
    expect(data.type).toBe('email')
    expect(data.source).toBe('outlook')
    expect(data.leadId).toBe('lead_1')
    expect(data.externalId).toBe('msg_1')
    expect(data.createdAt).toEqual(new Date('2026-06-20T09:00:00.000Z'))
    expect(data.body).toContain('←')
    expect(result).toEqual({ created: 1, updated: 0, skipped: 0 })
  })

  it('matches an outbound email by its recipient (to) address', async () => {
    p.lead.findFirst.mockResolvedValue({ id: 'lead_1', email: 'dana@acme.com' })
    fetchMessages.mockResolvedValue([msg({
      direction: 'outbound', from: 'alex@example.com', to: ['dana@acme.com'],
    })])
    const result = await syncEmailActivity()
    expect(p.lead.findFirst).toHaveBeenCalledWith({ where: { email: { in: ['dana@acme.com'] } } })
    expect(p.conversation.create.mock.calls[0][0].data.body).toContain('→')
    expect(result.created).toBe(1)
  })

  it('skips an email whose counterpart matches no lead', async () => {
    fetchMessages.mockResolvedValue([msg({ from: 'stranger@nowhere.example' })])
    const result = await syncEmailActivity()
    expect(p.conversation.create).not.toHaveBeenCalled()
    expect(result).toEqual({ created: 0, updated: 0, skipped: 1 })
  })

  it('excludes team addresses when matching an outbound recipient list', async () => {
    p.lead.findFirst.mockResolvedValue({ id: 'lead_1', email: 'dana@acme.com' })
    fetchMessages.mockResolvedValue([msg({
      direction: 'outbound', from: 'alex@example.com',
      to: ['jordan@example.com', 'dana@acme.com'],
    })])
    await syncEmailActivity()
    expect(p.lead.findFirst).toHaveBeenCalledWith({ where: { email: { in: ['dana@acme.com'] } } })
  })

  it('is idempotent: a re-synced email updates instead of duplicating', async () => {
    p.lead.findFirst.mockResolvedValue({ id: 'lead_1', email: 'dana@acme.com' })
    p.conversation.findUnique.mockResolvedValue({ id: 'conv_existing', externalId: 'msg_1' })
    fetchMessages.mockResolvedValue([msg()])
    const result = await syncEmailActivity()
    expect(p.conversation.create).not.toHaveBeenCalled()
    expect(p.conversation.update).toHaveBeenCalledTimes(1)
    expect(p.conversation.update.mock.calls[0][0].where).toEqual({ id: 'conv_existing' })
    expect(result).toEqual({ created: 0, updated: 1, skipped: 0 })
  })

  it('sets createdAt to the email sentAt so the timeline sorts correctly', async () => {
    p.lead.findFirst.mockResolvedValue({ id: 'lead_1', email: 'dana@acme.com' })
    fetchMessages.mockResolvedValue([msg({ sentAt: new Date('2026-06-15T12:00:00.000Z') })])
    await syncEmailActivity()
    expect(p.conversation.create.mock.calls[0][0].data.createdAt).toEqual(new Date('2026-06-15T12:00:00.000Z'))
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/email-sync.test.ts`
Expected: FAIL — `syncEmailActivity` is not defined (module does not exist yet).

- [ ] **Step 4: Write the handler**

Create `lib/integrations/email-sync.ts`:

```ts
import { prisma } from '../db'
import { inboxProvider } from './inbox'
import { TEAM_EMAILS } from '../constants'

const WINDOW_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000
const DIRECTION_GLYPH = { inbound: '←', outbound: '→' } as const

/**
 * Pull recent emails from the active inbox provider, match each to a lead by the
 * counterpart address (inbound: sender; outbound: recipients minus our own team),
 * and upsert matched messages as Conversation rows (type 'email', source 'outlook')
 * idempotently by externalId. Unmatched messages are skipped. Effectful.
 * `createdAt` is set to the email's sentAt so the timeline sorts correctly.
 */
export async function syncEmailActivity(
  owner = 'shared',
): Promise<{ created: number; updated: number; skipped: number }> {
  const now = new Date()
  const from = new Date(now.getTime() - WINDOW_DAYS * DAY_MS)
  const messages = await inboxProvider.fetchMessages(owner, from, now)

  let created = 0
  let updated = 0
  let skipped = 0

  for (const m of messages) {
    const counterpart = (m.direction === 'inbound' ? [m.from] : m.to)
      .filter((addr) => !TEAM_EMAILS.includes(addr as (typeof TEAM_EMAILS)[number]))
    const lead = counterpart.length
      ? await prisma.lead.findFirst({ where: { email: { in: counterpart } } })
      : null
    if (!lead) {
      skipped++
      continue
    }

    const data = {
      type: 'email',
      source: 'outlook',
      body: `${DIRECTION_GLYPH[m.direction]} ${m.subject} — "${m.snippet}"`,
      leadId: lead.id,
      createdAt: m.sentAt,
    }

    const existing = await prisma.conversation.findUnique({ where: { externalId: m.externalId } })
    if (existing) {
      await prisma.conversation.update({ where: { id: existing.id }, data })
      updated++
    } else {
      await prisma.conversation.create({ data: { ...data, externalId: m.externalId } })
      created++
    }
  }

  return { created, updated, skipped }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/email-sync.test.ts`
Expected: PASS (all 6 assertions).

- [ ] **Step 6: Commit**

```bash
git add lib/integrations/email-sync.ts lib/constants.ts tests/email-sync.test.ts
git commit -m "feat: add email sync handler with counterpart->lead matching"
```

---

## Task 4: POST route `/api/integrations/outlook/email/sync`

**Files:**
- Create: `app/api/integrations/outlook/email/sync/route.ts`
- Test: `tests/email-sync-route.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/email-sync-route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/integrations/email-sync', () => ({ syncEmailActivity: vi.fn() }))

import { syncEmailActivity } from '../lib/integrations/email-sync'
import { POST } from '../app/api/integrations/outlook/email/sync/route'

const sync = syncEmailActivity as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  sync.mockResolvedValue({ created: 2, updated: 1, skipped: 3 })
})

describe('POST /api/integrations/outlook/email/sync', () => {
  it('runs the sync and returns the counts', async () => {
    const res = await POST()
    expect(sync).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ ok: true, created: 2, updated: 1, skipped: 3 })
  })

  it('500s when the sync throws', async () => {
    sync.mockRejectedValue(new Error('boom'))
    const res = await POST()
    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/email-sync-route.test.ts`
Expected: FAIL — cannot resolve `../app/api/integrations/outlook/email/sync/route` (route does not exist).

- [ ] **Step 3: Write the route**

Create `app/api/integrations/outlook/email/sync/route.ts` (note: **six** `../` — one deeper than the calendar route because of the extra `email/` segment):

```ts
import { NextResponse } from 'next/server'
import { syncEmailActivity } from '../../../../../../lib/integrations/email-sync'

// TODO: protect when live (auth + resolve owner from session) — local/mock for now.
export async function POST() {
  try {
    const result = await syncEmailActivity()
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    console.error('outlook email sync error', e)
    return NextResponse.json({ error: 'sync error' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/email-sync-route.test.ts`
Expected: PASS (both assertions).

- [ ] **Step 5: Commit**

```bash
git add app/api/integrations/outlook/email/sync/route.ts tests/email-sync-route.test.ts
git commit -m "feat: add POST /api/integrations/outlook/email/sync entry point"
```

---

## Task 5: Surface in the Activity feed (button + source label)

**Files:**
- Create: `components/SyncEmailButton.tsx`
- Modify: `lib/constants.ts` (add `outlook` to `SOURCE_LABELS`)
- Modify: `app/activity/page.tsx` (header)

This task is presentation (mirrors `SyncCalendarButton`, which has no unit test); verify via type-check, build, and an optional browser check in Task 6.

- [ ] **Step 1: Add the source label**

In `lib/constants.ts`, extend the existing `SOURCE_LABELS` object to include `outlook`:

```ts
export const SOURCE_LABELS: Record<string, string> = {
  'cal.com': 'cal.com', workflow: 'Auto', linkedin: 'LinkedIn', manual: 'Manual', outlook: 'Outlook',
}
```

- [ ] **Step 2: Create the sync button**

Create `components/SyncEmailButton.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SyncEmailButton() {
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)

  async function sync() {
    setSyncing(true)
    try {
      await fetch('/api/integrations/outlook/email/sync', { method: 'POST' })
      router.refresh()
    } finally {
      setSyncing(false)
    }
  }

  return (
    <button
      type="button"
      onClick={sync}
      disabled={syncing}
      style={{
        padding: '8px 16px', borderRadius: 6, fontSize: 14, fontWeight: 500, cursor: 'pointer',
        background: 'var(--bg-overlay)', color: 'var(--text-secondary)', border: '1px solid var(--border)',
        opacity: syncing ? 0.6 : 1,
      }}
    >
      {syncing ? 'Syncing…' : '↻ Sync email'}
    </button>
  )
}
```

- [ ] **Step 3: Wire the button into the Activity page header**

In `app/activity/page.tsx`:

(a) Add the import after the existing `SOURCE_LABELS` import (line 3):

```tsx
import SyncEmailButton from '../../components/SyncEmailButton'
```

(b) Replace the heading line:

```tsx
      <h1 style={{ margin: '0 0 24px' }}>Activity</h1>
```

with a flex header that keeps the title and adds the button on the right:

```tsx
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 24px' }}>
        <h1 style={{ margin: 0 }}>Activity</h1>
        <SyncEmailButton />
      </div>
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: exits 0. (If stale `.next/dev/types` errors appear, run `rm -rf .next` and retry.)

- [ ] **Step 5: Commit**

```bash
git add components/SyncEmailButton.tsx lib/constants.ts app/activity/page.tsx
git commit -m "feat: surface synced Outlook emails + Sync button on Activity feed"
```

---

## Task 6: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass, including the 4 new/extended files (`inbox-provider`, `email-sync`, `email-sync-route`, `schema-extensions`). This is the calendar suite's 113 tests plus the new email tests.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Production build**

Run: `npx next build`
Expected: succeeds; the route table lists `ƒ /api/integrations/outlook/email/sync`.

- [ ] **Step 4 (optional): Browser smoke test**

Start the dev server (via the preview tooling), sign in (login gate — set cookie `clarity_session=ok.<HMAC-SHA256('ok', SESSION_SECRET)>`, `SESSION_SECRET` from `.env`), then on `/activity` click "↻ Sync email".
- With a lead whose email is `dana@acme.com` present (create one if needed), first sync returns `{created:2, …}` (the two dana messages, inbound + outbound), a re-sync returns `{updated:2, …}` (idempotent), and both emails appear in the feed with the ✉️ icon, an "Outlook" chip, and `←`/`→` direction glyphs — ordered by their `sentAt`.
- Without a matching lead, all messages are skipped (`{created:0, updated:0, skipped:3}`).

- [ ] **Step 5: Final commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "chore: verification fixes for Outlook email sync"
```

(If nothing changed, skip this step.)

---

## Self-Review

**Spec coverage:**
- §1 schema (`Conversation.externalId`) → Task 1. ✓
- §2 seam (`EmailMessage`, `fetchMessages`, Mock active, Graph stub) → Task 2. ✓
- §3 handler (backward window, counterpart-by-direction, `TEAM_EMAILS` exclusion, skip unmatched, `createdAt = sentAt`, upsert by externalId) → Task 3. ✓
- §4 route (`/outlook/email/sync`, `{ok,created,updated,skipped}`, 500 on throw) → Task 4. ✓
- §5 UI (`SOURCE_LABELS.outlook`, direction glyph in body [Task 3], `SyncEmailButton`, activity header) → Tasks 3 & 5. ✓
- §6 tests (provider, sync, route) → Tasks 2, 3, 4; full run in Task 6. ✓
- Out-of-scope items (Graph impl, OAuth, cron, attachments, auth) → intentionally not built. ✓

**Placeholder scan:** No TBD/TODO except the intentional `// TODO: protect when live` code comment (matches the calendar route). Every code step shows complete code. ✓

**Type consistency:** `EmailMessage`/`InboxProvider.fetchMessages` defined in Task 2 are consumed unchanged in Task 3's handler and test; `syncEmailActivity` signature `{created,updated,skipped}` is identical in Tasks 3, 4, and 5's button expectations; `TEAM_EMAILS` defined in Task 3 Step 1 before its use in Step 4; `Conversation.externalId` (Task 1) is what `conversation.findUnique({ where: { externalId } })` (Task 3) relies on. ✓
