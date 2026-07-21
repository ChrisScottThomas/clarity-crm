# Clarity CRM Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Clarity CRM core (leads, kanban pipeline, profiles, company pages, analytics, settings, auth) as a Next.js app running locally with mocked endpoints and SQLite, on-brand, with the relationship-default and `client`-never-auto-set guardrails enforced and tested.

**Architecture:** Single Next.js (App Router, TypeScript) app. UI in React components; "endpoints" are Next.js route handlers under `app/api/*` backed by SQLite via Prisma. All external integrations live behind interfaces in `lib/integrations/` with mock implementations only. Auth is a shared-password middleware gate. All option lists live once in `lib/constants.ts`.

**Tech Stack:** Next.js 14+ (App Router), TypeScript, Prisma + SQLite, Vitest (unit tests), `@dnd-kit` for kanban drag, CSS modules / global CSS for brand tokens.

**Source spec:** `docs/superpowers/specs/2026-06-25-clarity-crm-core-design.md`. Read it before starting.

**Working rule:** Work on branch `feat/core-crm` (not `main`). Commit after every task. The pipeline ships **empty** — never seed leads. Only the settings (booking links) are seeded.

---

## File Structure

```
app/
  layout.tsx                  # root layout, brand fonts/tokens, nav
  page.tsx                    # redirect to /pipeline
  login/page.tsx              # shared-password login form
  login/actions.ts            # server action: verify password, set cookie
  pipeline/page.tsx           # kanban board
  leads/[id]/page.tsx         # lead profile
  leads/new/page.tsx          # create lead form
  companies/[id]/page.tsx     # company profile
  analytics/page.tsx          # analytics dashboard
  settings/page.tsx           # booking-link settings
  api/leads/route.ts          # GET list, POST create
  api/leads/[id]/route.ts     # GET, PATCH, DELETE
  api/companies/route.ts      # GET list, POST create
  api/companies/[id]/route.ts # GET, PATCH
  api/settings/route.ts       # GET all, PATCH
lib/
  constants.ts                # all enums/option lists + types
  db.ts                       # Prisma client singleton
  auth.ts                     # session cookie helpers
  leads.ts                    # createLead, updateLead, stage logic (pure-ish)
  analytics.ts                # computeAnalytics, computeMRR (pure)
  settings.ts                 # getBookingLink with fallback
  integrations/
    booking.ts                # BookingProvider + MockBookingProvider
    inbox.ts                  # InboxProvider + MockInboxProvider
    email.ts                  # EmailProvider + MockEmailProvider
    sessionNotes.ts           # SessionNotesProvider + MockSessionNotesProvider
prisma/
  schema.prisma
  seed.ts                     # settings only — NO leads
components/
  KanbanBoard.tsx, LeadCard.tsx, ConstraintChip.tsx,
  LeadForm.tsx, RelationshipBadge.tsx, AnalyticsCharts.tsx, Nav.tsx
styles/
  tokens.css                  # Clarity brand variables
tests/
  constants.test.ts, leads.test.ts, analytics.test.ts, settings.test.ts
middleware.ts                 # auth gate
README.md
```

---

## Task 1: Project scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `vitest.config.ts`, `.gitignore` (exists), `.env.local`

- [ ] **Step 1: Create the branch**

```bash
git checkout -b feat/core-crm
```

- [ ] **Step 2: Scaffold Next.js + TypeScript app in place**

```bash
npx create-next-app@latest . --typescript --app --no-tailwind --no-src-dir --eslint --use-npm --no-import-alias
```
Accept overwrite prompts only for generated config; keep `CONTEXT.md`, `docs/`, `.gitignore`.

- [ ] **Step 3: Install dependencies**

```bash
npm install prisma @prisma/client @dnd-kit/core @dnd-kit/sortable
npm install -D vitest @vitejs/plugin-react
npx prisma init --datasource-provider sqlite
```

- [ ] **Step 4: Configure Vitest**

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
})
```
Add to `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`, `"db:push": "prisma db push", "db:seed": "tsx prisma/seed.ts"`. Install `tsx`: `npm install -D tsx`.

- [ ] **Step 5: Set env**

Create `.env.local`:
```
DATABASE_URL="file:./data/clarity.db"
CRM_PASSWORD="clarity-dev"
SESSION_SECRET="dev-only-change-before-online"
```
Update `prisma/schema.prisma` datasource `url = env("DATABASE_URL")`. Ensure `data/` and `.env.local` are git-ignored (they are).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "chore: scaffold Next.js + Prisma + Vitest"
```

---

## Task 2: Constants — single source of truth

**Files:**
- Create: `lib/constants.ts`
- Test: `tests/constants.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/constants.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { STAGES, RELATIONSHIPS, CONSTRAINTS, CONSTRAINT_COLORS, DEFAULT_RELATIONSHIP } from '../lib/constants'

describe('constants', () => {
  it('has the seven stages in order', () => {
    expect(STAGES).toEqual([
      'New Lead', 'Contacted', 'Replied', 'Call Booked', 'Call Done', 'Closed Won', 'Closed Lost',
    ])
  })
  it('defaults relationship to contact', () => {
    expect(DEFAULT_RELATIONSHIP).toBe('contact')
    expect(RELATIONSHIPS).toContain('client')
  })
  it('has the 6 Ms with brand colours', () => {
    expect(CONSTRAINTS).toEqual(['Money', 'Market', 'Model', 'Manpower', 'Metrics', 'More'])
    expect(CONSTRAINT_COLORS.Money).toBe('#ffde59')
    expect(CONSTRAINT_COLORS.More).toBe('#56d4e8')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- constants`
Expected: FAIL — cannot find module `../lib/constants`.

- [ ] **Step 3: Write the implementation**

`lib/constants.ts`:
```ts
export const STAGES = [
  'New Lead', 'Contacted', 'Replied', 'Call Booked', 'Call Done', 'Closed Won', 'Closed Lost',
] as const
export type Stage = typeof STAGES[number]

export const OWNERS = ['Alex', 'Jordan'] as const
export type Owner = typeof OWNERS[number]

export const TRACKS = ['Strategic / Commercial', 'Operations / Teams'] as const

export const SOURCES = [
  'Warm DM', 'Referral', 'Content Inbound', 'FounderON', 'Cold Outreach',
  'LinkedIn', 'Inbound', 'Event', 'Networking',
] as const

export const NEXT_ACTIONS = [
  'Research contact', 'Send message', 'Follow up', 'Book call', 'Prepare call',
  'Send recap', 'Send proposal', 'Awaiting reply', 'Nurture', 'No action',
] as const

export const RELATIONSHIPS = ['contact', 'prospect', 'client', 'peer', 'advisory', 'inactive'] as const
export type Relationship = typeof RELATIONSHIPS[number]
export const DEFAULT_RELATIONSHIP: Relationship = 'contact'

export const CONSTRAINTS = ['Money', 'Market', 'Model', 'Manpower', 'Metrics', 'More'] as const
export type Constraint = typeof CONSTRAINTS[number]

export const CONSTRAINT_COLORS: Record<Constraint, string> = {
  More: '#56d4e8', Money: '#ffde59', Metrics: '#a78bfa',
  Manpower: '#ff3131', Market: '#dc8c32', Model: '#e850a0',
}

export const BUSINESS_DEBTS = ['Ignorance debt', 'Avoidance debt', 'Experience debt'] as const
export const DEBT_COLORS = { 'Ignorance debt': '#5271ff', 'Avoidance debt': '#34d399' } as const

export const ROADMAP_STAGES = [
  '0 (Improvise)', '1 (Monetize)', '2 (Advertise)', '3 (Stabilize)', '4 (Prioritize)',
  '5 (Productize)', '6 (Optimize)', '7 (Scale)', '8 (Scale)', '9 (Scale)',
] as const

export const BRAND = { midnight: '#020f31', text: '#ffffff', blue: '#429edb' } as const
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- constants`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/constants.ts tests/constants.test.ts && git commit -m "feat: add CRM constants with stages, options, brand colours"
```

---

## Task 3: Prisma schema + client + seed

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `lib/db.ts`, `prisma/seed.ts`

- [ ] **Step 1: Write the schema**

`prisma/schema.prisma` (models — keep the generator/datasource blocks from `prisma init`):
```prisma
model Company {
  id        String   @id @default(cuid())
  name      String
  website   String?
  notes     String?
  createdAt DateTime @default(now())
  leads     Lead[]
}

model Lead {
  id                  String    @id @default(cuid())
  name                String
  companyName         String?
  email               String?
  linkedinUrl         String?
  website             String?
  owner               String?
  track               String?
  source              String?
  stage               String    @default("New Lead")
  nextAction          String?
  relationship        String    @default("contact")
  monthlyValue        Float?
  contactAdded        DateTime  @default(now())
  dateContacted       DateTime?
  callDate            DateTime?
  followUpDate        DateTime?
  closedDate          DateTime?
  intakeFormReceived  Boolean   @default(false)
  notes               String?
  scalingRoadmapStage String?
  primaryConstraint   String?
  businessDebt        String?
  graduationCriterion String?
  companyId           String?
  company             Company?  @relation(fields: [companyId], references: [id])
  openLoops           OpenLoop[]
}

model OpenLoop {
  id          String   @id @default(cuid())
  leadId      String
  lead        Lead     @relation(fields: [leadId], references: [id])
  description String
  direction   String   @default("owed-from")
  done        Boolean  @default(false)
  dueDate     DateTime?
}

model Setting {
  key   String @id
  value String
}
```

- [ ] **Step 2: Create the Prisma client singleton**

`lib/db.ts`:
```ts
import { PrismaClient } from '@prisma/client'
const g = globalThis as unknown as { prisma?: PrismaClient }
export const prisma = g.prisma ?? new PrismaClient()
if (process.env.NODE_ENV !== 'production') g.prisma = prisma
```

- [ ] **Step 3: Create the seed (settings only — NO leads)**

`prisma/seed.ts`:
```ts
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const shared = 'https://cal.com/alex-jordan/discovery'
  const settings = [
    { key: 'booking_link_shared', value: shared },
    { key: 'booking_link_alex', value: '' },
    { key: 'booking_link_jordan', value: '' },
  ]
  for (const s of settings) {
    await prisma.setting.upsert({ where: { key: s.key }, update: {}, create: s })
  }
  console.log('Seeded settings. No leads seeded (by design).')
}
main().finally(() => prisma.$disconnect())
```

- [ ] **Step 4: Push schema and seed**

```bash
npm run db:push && npm run db:seed
```
Expected: tables created; "Seeded settings. No leads seeded (by design)."

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/seed.ts lib/db.ts && git commit -m "feat: add Prisma schema, client, settings-only seed"
```

---

## Task 4: Lead creation — relationship defaults to `contact` (GUARDRAIL)

**Files:**
- Create: `lib/leads.ts`
- Test: `tests/leads.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/leads.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildNewLead } from '../lib/leads'

describe('buildNewLead', () => {
  it('defaults relationship to contact when unspecified', () => {
    const lead = buildNewLead({ name: 'Acme Founder' })
    expect(lead.relationship).toBe('contact')
  })
  it('never accepts client as a default and only via explicit manual flag', () => {
    const lead = buildNewLead({ name: 'X', relationship: 'client' as any })
    // client is NOT honoured through the create path
    expect(lead.relationship).toBe('contact')
  })
  it('honours an explicit non-client relationship', () => {
    const lead = buildNewLead({ name: 'Y', relationship: 'prospect' })
    expect(lead.relationship).toBe('prospect')
  })
  it('defaults stage to New Lead', () => {
    expect(buildNewLead({ name: 'Z' }).stage).toBe('New Lead')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- leads`
Expected: FAIL — `buildNewLead` not exported.

- [ ] **Step 3: Write the implementation**

`lib/leads.ts`:
```ts
import { DEFAULT_RELATIONSHIP, Relationship, Stage } from './constants'

export interface NewLeadInput {
  name: string
  relationship?: Relationship
  stage?: Stage
  [key: string]: unknown
}

export interface NewLead {
  relationship: Relationship
  stage: Stage
  [key: string]: unknown
}

// client can NEVER be set through the create path — only a later explicit manual edit.
export function buildNewLead(input: NewLeadInput): NewLead {
  const requested = input.relationship
  const relationship: Relationship =
    requested && requested !== 'client' ? requested : DEFAULT_RELATIONSHIP
  return { ...input, relationship, stage: input.stage ?? 'New Lead' }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- leads`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/leads.ts tests/leads.test.ts && git commit -m "feat: lead creation defaults relationship to contact, blocks client"
```

---

## Task 5: Stage changes never auto-set `client` (GUARDRAIL)

**Files:**
- Modify: `lib/leads.ts`
- Test: `tests/leads.test.ts` (append)

- [ ] **Step 1: Write the failing test (append to `tests/leads.test.ts`)**

```ts
import { applyStageChange, setRelationshipManually } from '../lib/leads'

describe('applyStageChange', () => {
  it('moving to Closed Won does NOT change relationship to client', () => {
    const lead = { relationship: 'prospect', stage: 'Call Done' } as any
    const updated = applyStageChange(lead, 'Closed Won')
    expect(updated.stage).toBe('Closed Won')
    expect(updated.relationship).toBe('prospect') // unchanged
  })
  it('rejects an unknown stage', () => {
    expect(() => applyStageChange({ stage: 'New Lead' } as any, 'Pending' as any)).toThrow()
  })
})

describe('setRelationshipManually', () => {
  it('is the only path that can set client', () => {
    const lead = { relationship: 'prospect' } as any
    expect(setRelationshipManually(lead, 'client').relationship).toBe('client')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- leads`
Expected: FAIL — `applyStageChange`/`setRelationshipManually` not exported.

- [ ] **Step 3: Add the implementation to `lib/leads.ts`**

```ts
import { STAGES, RELATIONSHIPS, Stage, Relationship } from './constants'

export function applyStageChange<T extends { stage: Stage; relationship?: Relationship }>(
  lead: T, next: Stage,
): T {
  if (!STAGES.includes(next)) throw new Error(`Unknown stage: ${next}`)
  // Deliberately does NOT touch relationship. client is never inferred from stage.
  const closedDate = next === 'Closed Won' || next === 'Closed Lost' ? new Date() : (lead as any).closedDate
  return { ...lead, stage: next, closedDate }
}

export function setRelationshipManually<T extends { relationship?: Relationship }>(
  lead: T, value: Relationship,
): T {
  if (!RELATIONSHIPS.includes(value)) throw new Error(`Unknown relationship: ${value}`)
  return { ...lead, relationship: value }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- leads`
Expected: PASS (all leads tests).

- [ ] **Step 5: Commit**

```bash
git add lib/leads.ts tests/leads.test.ts && git commit -m "feat: stage changes never auto-set client; manual-only relationship setter"
```

---

## Task 6: MRR + analytics computation (GUARDRAIL: MRR from Closed Won only)

**Files:**
- Create: `lib/analytics.ts`
- Test: `tests/analytics.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/analytics.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { computeMRR, leadsByStage, leadsByOwner, leadsByConstraint, callToClientRate } from '../lib/analytics'

const leads = [
  { stage: 'Closed Won', monthlyValue: 500, owner: 'Alex', primaryConstraint: 'Money', relationship: 'client' },
  { stage: 'Closed Won', monthlyValue: 500, owner: 'Jordan', primaryConstraint: 'Market', relationship: 'prospect' },
  { stage: 'Call Done', monthlyValue: 999, owner: 'Alex', primaryConstraint: 'Money', relationship: 'prospect' },
] as any[]

describe('analytics', () => {
  it('MRR sums monthlyValue for Closed Won only', () => {
    expect(computeMRR(leads)).toBe(1000)
  })
  it('counts leads by stage', () => {
    expect(leadsByStage(leads)['Closed Won']).toBe(2)
    expect(leadsByStage(leads)['New Lead']).toBe(0)
  })
  it('counts leads by owner', () => {
    expect(leadsByOwner(leads)).toEqual({ Alex: 2, Jordan: 1 })
  })
  it('counts leads by constraint', () => {
    expect(leadsByConstraint(leads).Money).toBe(2)
  })
  it('call-to-client rate = clients / (Call Done or later)', () => {
    expect(callToClientRate(leads)).toBeCloseTo(1 / 3)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- analytics`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`lib/analytics.ts`:
```ts
import { STAGES, OWNERS, CONSTRAINTS, Stage } from './constants'

type L = {
  stage: Stage; monthlyValue?: number | null; owner?: string | null;
  primaryConstraint?: string | null; relationship?: string | null;
}

export function computeMRR(leads: L[]): number {
  return leads.filter(l => l.stage === 'Closed Won').reduce((s, l) => s + (l.monthlyValue ?? 0), 0)
}

export function leadsByStage(leads: L[]): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(STAGES.map(s => [s, 0]))
  for (const l of leads) out[l.stage] = (out[l.stage] ?? 0) + 1
  return out
}

export function leadsByOwner(leads: L[]): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(OWNERS.map(o => [o, 0]))
  for (const l of leads) if (l.owner) out[l.owner] = (out[l.owner] ?? 0) + 1
  return out
}

export function leadsByConstraint(leads: L[]): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(CONSTRAINTS.map(c => [c, 0]))
  for (const l of leads) if (l.primaryConstraint) out[l.primaryConstraint] = (out[l.primaryConstraint] ?? 0) + 1
  return out
}

const CALL_OR_LATER: Stage[] = ['Call Done', 'Closed Won', 'Closed Lost']
export function callToClientRate(leads: L[]): number {
  const reached = leads.filter(l => CALL_OR_LATER.includes(l.stage)).length
  const clients = leads.filter(l => l.relationship === 'client').length
  return reached === 0 ? 0 : clients / reached
}

const CONTACTED_OR_LATER: Stage[] = ['Contacted', 'Replied', 'Call Booked', 'Call Done', 'Closed Won', 'Closed Lost']
export function dmToCallRate(leads: L[]): number {
  const contacted = leads.filter(l => CONTACTED_OR_LATER.includes(l.stage)).length
  const booked = leads.filter(l => (['Call Booked', 'Call Done', 'Closed Won', 'Closed Lost'] as Stage[]).includes(l.stage)).length
  return contacted === 0 ? 0 : booked / contacted
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- analytics`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/analytics.ts tests/analytics.test.ts && git commit -m "feat: analytics + MRR-from-Closed-Won computation"
```

---

## Task 7: Booking-link settings with per-owner fallback (GUARDRAIL)

**Files:**
- Create: `lib/settings.ts`
- Test: `tests/settings.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/settings.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { resolveBookingLink } from '../lib/settings'

const settings = {
  booking_link_shared: 'https://cal.com/alex-jordan/discovery',
  booking_link_alex: '',
  booking_link_jordan: 'https://cal.com/jordan/discovery',
}

describe('resolveBookingLink', () => {
  it('falls back to shared link when owner link is unset', () => {
    expect(resolveBookingLink(settings, 'Alex')).toBe('https://cal.com/alex-jordan/discovery')
  })
  it('uses the owner link when set', () => {
    expect(resolveBookingLink(settings, 'Jordan')).toBe('https://cal.com/jordan/discovery')
  })
  it('returns the shared link when no owner given', () => {
    expect(resolveBookingLink(settings)).toBe('https://cal.com/alex-jordan/discovery')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- settings`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`lib/settings.ts`:
```ts
import { Owner } from './constants'

export type SettingsMap = Record<string, string>

export function resolveBookingLink(settings: SettingsMap, owner?: Owner): string {
  const shared = settings.booking_link_shared ?? ''
  if (!owner) return shared
  const key = owner === 'Alex' ? 'booking_link_alex' : 'booking_link_jordan'
  const ownerLink = settings[key]
  return ownerLink && ownerLink.length > 0 ? ownerLink : shared
}

export async function loadSettings(prisma: { setting: { findMany: () => Promise<{ key: string; value: string }[]> } }): Promise<SettingsMap> {
  const rows = await prisma.setting.findMany()
  return Object.fromEntries(rows.map(r => [r.key, r.value]))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- settings`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/settings.ts tests/settings.test.ts && git commit -m "feat: booking-link resolution with per-owner fallback to shared"
```

---

## Task 8: Auth gate (shared-password middleware)

**Files:**
- Create: `lib/auth.ts`, `middleware.ts`, `app/login/page.tsx`, `app/login/actions.ts`

- [ ] **Step 1: Write the session helpers**

`lib/auth.ts`:
```ts
import { cookies } from 'next/headers'
import { createHmac } from 'crypto'

const COOKIE = 'clarity_session'
function sign(value: string): string {
  const secret = process.env.SESSION_SECRET ?? 'dev'
  return createHmac('sha256', secret).update(value).digest('hex')
}
export function makeToken(): string {
  const v = 'ok'
  return `${v}.${sign(v)}`
}
export function verifyToken(token?: string): boolean {
  if (!token) return false
  const [v, sig] = token.split('.')
  return v === 'ok' && sig === sign(v)
}
export function setSession() { cookies().set(COOKIE, makeToken(), { httpOnly: true, sameSite: 'lax', path: '/' }) }
export function clearSession() { cookies().delete(COOKIE) }
export const SESSION_COOKIE = COOKIE
```

- [ ] **Step 2: Write the middleware gate**

`middleware.ts`:
```ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createHmac } from 'crypto'

function valid(token?: string): boolean {
  if (!token) return false
  const [v, sig] = token.split('.')
  const expected = createHmac('sha256', process.env.SESSION_SECRET ?? 'dev').update('ok').digest('hex')
  return v === 'ok' && sig === expected
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (pathname.startsWith('/login') || pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return NextResponse.next()
  }
  if (!valid(req.cookies.get('clarity_session')?.value)) {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  return NextResponse.next()
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] }
```

- [ ] **Step 3: Write the login page + action**

`app/login/actions.ts`:
```ts
'use server'
import { redirect } from 'next/navigation'
import { setSession } from '../../lib/auth'

export async function login(formData: FormData) {
  const password = String(formData.get('password') ?? '')
  if (password === process.env.CRM_PASSWORD) { setSession(); redirect('/pipeline') }
  redirect('/login?error=1')
}
```
`app/login/page.tsx`:
```tsx
import { login } from './actions'
export default function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <form action={login} style={{ display: 'grid', gap: 12, minWidth: 280 }}>
        <h1>Clarity CRM</h1>
        <input name="password" type="password" placeholder="Password" autoFocus />
        {searchParams.error && <p style={{ color: '#ff3131' }}>Incorrect password.</p>}
        <button type="submit">Sign in</button>
      </form>
    </main>
  )
}
```

- [ ] **Step 4: Manually verify the gate**

Run: `npm run dev`. Visit `http://localhost:3000/pipeline` → should redirect to `/login`. Enter `clarity-dev` → reaches pipeline. Wrong password → error shown.

- [ ] **Step 5: Commit**

```bash
git add lib/auth.ts middleware.ts app/login && git commit -m "feat: shared-password auth gate with signed session cookie"
```

---

## Task 9: API route handlers (leads, companies, settings)

**Files:**
- Create: `app/api/leads/route.ts`, `app/api/leads/[id]/route.ts`, `app/api/companies/route.ts`, `app/api/companies/[id]/route.ts`, `app/api/settings/route.ts`

- [ ] **Step 1: Leads collection route**

`app/api/leads/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/db'
import { buildNewLead } from '../../../lib/leads'

export async function GET() {
  const leads = await prisma.lead.findMany({ include: { company: true }, orderBy: { contactAdded: 'desc' } })
  return NextResponse.json(leads)
}
export async function POST(req: Request) {
  const body = await req.json()
  if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  const data = buildNewLead(body) // enforces relationship default + client block
  const lead = await prisma.lead.create({ data: data as any })
  return NextResponse.json(lead, { status: 201 })
}
```

- [ ] **Step 2: Single-lead route (GET/PATCH/DELETE)**

`app/api/leads/[id]/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/db'
import { applyStageChange, setRelationshipManually } from '../../../../lib/leads'
import { Stage, Relationship } from '../../../../lib/constants'

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const lead = await prisma.lead.findUnique({ where: { id: params.id }, include: { company: true, openLoops: true } })
  return lead ? NextResponse.json(lead) : NextResponse.json({ error: 'not found' }, { status: 404 })
}
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json()
  const current = await prisma.lead.findUnique({ where: { id: params.id } })
  if (!current) return NextResponse.json({ error: 'not found' }, { status: 404 })
  let next: any = { ...body }
  // Route stage + relationship through the guarded helpers, never raw.
  if (body.stage) next = { ...next, ...applyStageChange(current as any, body.stage as Stage) }
  if (body.relationship) next = { ...next, ...setRelationshipManually(current as any, body.relationship as Relationship) }
  const updated = await prisma.lead.update({ where: { id: params.id }, data: next })
  return NextResponse.json(updated)
}
export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  await prisma.openLoop.deleteMany({ where: { leadId: params.id } })
  await prisma.lead.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Companies routes**

`app/api/companies/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/db'
export async function GET() { return NextResponse.json(await prisma.company.findMany({ include: { leads: true } })) }
export async function POST(req: Request) {
  const body = await req.json()
  if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  return NextResponse.json(await prisma.company.create({ data: { name: body.name, website: body.website, notes: body.notes } }), { status: 201 })
}
```
`app/api/companies/[id]/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/db'
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const c = await prisma.company.findUnique({ where: { id: params.id }, include: { leads: true } })
  return c ? NextResponse.json(c) : NextResponse.json({ error: 'not found' }, { status: 404 })
}
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json()
  return NextResponse.json(await prisma.company.update({ where: { id: params.id }, data: body }))
}
```

- [ ] **Step 4: Settings route**

`app/api/settings/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/db'
export async function GET() {
  const rows = await prisma.setting.findMany()
  return NextResponse.json(Object.fromEntries(rows.map(r => [r.key, r.value])))
}
export async function PATCH(req: Request) {
  const body = await req.json() as Record<string, string>
  for (const [key, value] of Object.entries(body)) {
    await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } })
  }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Manually verify**

With `npm run dev` running and logged in, in a browser console or via `curl` with the session cookie: `POST /api/leads {"name":"Test"}` returns 201 with `relationship: "contact"`. `PATCH /api/leads/<id> {"stage":"Closed Won"}` leaves `relationship` unchanged.

- [ ] **Step 6: Commit**

```bash
git add app/api && git commit -m "feat: leads/companies/settings API routes via guarded helpers"
```

---

## Task 10: Integration interfaces + mock implementations

**Files:**
- Create: `lib/integrations/booking.ts`, `inbox.ts`, `email.ts`, `sessionNotes.ts`

- [ ] **Step 1: Define each interface with a mock**

`lib/integrations/booking.ts`:
```ts
import { Owner } from '../constants'
export interface Booking { email: string; name: string; owner?: Owner; callDate: Date }
export interface BookingProvider { fetchNewBookings(): Promise<Booking[]> }
export class MockBookingProvider implements BookingProvider {
  async fetchNewBookings(): Promise<Booking[]> { return [] } // wired to real cal.com later
}
export const bookingProvider: BookingProvider = new MockBookingProvider()
```
`lib/integrations/inbox.ts`:
```ts
export interface InboundEmail { from: string; subject: string; snippet: string; receivedAt: Date }
export interface InboxProvider { fetchInbound(): Promise<InboundEmail[]> }
export class MockInboxProvider implements InboxProvider {
  async fetchInbound(): Promise<InboundEmail[]> { return [] }
}
export const inboxProvider: InboxProvider = new MockInboxProvider()
```
`lib/integrations/email.ts`:
```ts
export interface EmailMessage { to: string; subject: string; body: string }
export interface EmailProvider { send(msg: EmailMessage): Promise<{ ok: boolean }> }
export class MockEmailProvider implements EmailProvider {
  sent: EmailMessage[] = []
  async send(msg: EmailMessage) { this.sent.push(msg); console.log('[mock email]', msg.to, msg.subject); return { ok: true } }
}
export const emailProvider: EmailProvider = new MockEmailProvider()
```
`lib/integrations/sessionNotes.ts`:
```ts
export interface SessionNote { attendeeEmail: string; date: Date; text: string }
export interface SessionNotesProvider { fetchFor(email: string): Promise<SessionNote[]> }
export class MockSessionNotesProvider implements SessionNotesProvider {
  async fetchFor(): Promise<SessionNote[]> { return [] }
}
export const sessionNotesProvider: SessionNotesProvider = new MockSessionNotesProvider()
```

- [ ] **Step 2: Commit**

```bash
git add lib/integrations && git commit -m "feat: integration interfaces with mock implementations (cal.com/inbox/email/notes)"
```

---

## Task 11: Brand tokens + root layout + nav

**Files:**
- Create: `styles/tokens.css`, `components/Nav.tsx`
- Modify: `app/layout.tsx`, `app/page.tsx`

- [ ] **Step 1: Brand tokens**

`styles/tokens.css`:
```css
:root {
  --midnight: #020f31; --text: #ffffff; --blue: #429edb;
  --c-more:#56d4e8; --c-money:#ffde59; --c-metrics:#a78bfa;
  --c-manpower:#ff3131; --c-market:#dc8c32; --c-model:#e850a0;
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--midnight); color: var(--text);
  font-family: Helvetica, 'Helvetica Neue', Inter, sans-serif;
}
a { color: var(--blue); }
button { background: var(--blue); color: #fff; border: 0; padding: 8px 14px; border-radius: 6px; cursor: pointer; }
input, select, textarea { background: #0b1a3d; color: var(--text); border: 1px solid #1d2c52; border-radius: 6px; padding: 8px; }
```

- [ ] **Step 2: Root layout + nav**

`app/layout.tsx`:
```tsx
import '../styles/tokens.css'
import Nav from '../components/Nav'
export const metadata = { title: 'Clarity CRM' }
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body><Nav /><div style={{ padding: 24 }}>{children}</div></body></html>)
}
```
`components/Nav.tsx`:
```tsx
import Link from 'next/link'
export default function Nav() {
  const items = [['Pipeline','/pipeline'],['Analytics','/analytics'],['Settings','/settings']] as const
  return (
    <nav style={{ display: 'flex', gap: 16, padding: '12px 24px', borderBottom: '1px solid #1d2c52' }}>
      <strong>Clarity.</strong>
      {items.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
    </nav>
  )
}
```
`app/page.tsx`:
```tsx
import { redirect } from 'next/navigation'
export default function Home() { redirect('/pipeline') }
```

- [ ] **Step 3: Manually verify** — `npm run dev`, confirm midnight background, white text, blue links, nav bar.

- [ ] **Step 4: Commit**

```bash
git add styles app/layout.tsx app/page.tsx components/Nav.tsx && git commit -m "feat: brand tokens, root layout, nav"
```

---

## Task 12: Constraint chip + relationship badge components

**Files:**
- Create: `components/ConstraintChip.tsx`, `components/RelationshipBadge.tsx`

- [ ] **Step 1: ConstraintChip (6 Ms colours only)**

`components/ConstraintChip.tsx`:
```tsx
import { CONSTRAINT_COLORS, Constraint } from '../lib/constants'
export default function ConstraintChip({ value }: { value?: string | null }) {
  if (!value) return null
  const color = CONSTRAINT_COLORS[value as Constraint] ?? '#888'
  return <span style={{ background: color, color: '#020f31', padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>{value}</span>
}
```

- [ ] **Step 2: RelationshipBadge (client visually distinct)**

`components/RelationshipBadge.tsx`:
```tsx
export default function RelationshipBadge({ value }: { value: string }) {
  const isClient = value === 'client'
  return (
    <span style={{
      padding: '2px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700,
      border: isClient ? '2px solid #34d399' : '1px solid #1d2c52',
      background: isClient ? '#0c2a1f' : 'transparent',
      color: isClient ? '#34d399' : '#cbd5e1',
    }}>{value}{isClient ? ' ✓' : ''}</span>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add components/ConstraintChip.tsx components/RelationshipBadge.tsx && git commit -m "feat: constraint chip and client-distinct relationship badge"
```

---

## Task 13: Kanban pipeline with drag between stages

**Files:**
- Create: `app/pipeline/page.tsx`, `components/KanbanBoard.tsx`, `components/LeadCard.tsx`

- [ ] **Step 1: Pipeline page (server) loads leads**

`app/pipeline/page.tsx`:
```tsx
import { prisma } from '../../lib/db'
import KanbanBoard from '../../components/KanbanBoard'
export const dynamic = 'force-dynamic'
export default async function PipelinePage() {
  const leads = await prisma.lead.findMany({ orderBy: { contactAdded: 'desc' } })
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Pipeline</h1><a href="/leads/new"><button>+ New lead</button></a>
      </div>
      <KanbanBoard initialLeads={JSON.parse(JSON.stringify(leads))} />
    </div>
  )
}
```

- [ ] **Step 2: KanbanBoard (client) with dnd-kit**

`components/KanbanBoard.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { DndContext, DragEndEvent } from '@dnd-kit/core'
import { STAGES, BRAND } from '../lib/constants'
import LeadCard from './LeadCard'

export default function KanbanBoard({ initialLeads }: { initialLeads: any[] }) {
  const [leads, setLeads] = useState(initialLeads)
  async function onDragEnd(e: DragEndEvent) {
    const id = String(e.active.id); const stage = e.over?.id ? String(e.over.id) : null
    if (!stage) return
    setLeads(prev => prev.map(l => l.id === id ? { ...l, stage } : l))
    await fetch(`/api/leads/${id}`, { method: 'PATCH', body: JSON.stringify({ stage }) })
  }
  return (
    <DndContext onDragEnd={onDragEnd}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${STAGES.length}, minmax(180px,1fr))`, gap: 12, overflowX: 'auto' }}>
        {STAGES.map(stage => (
          <Column key={stage} stage={stage} leads={leads.filter(l => l.stage === stage)} />
        ))}
      </div>
    </DndContext>
  )
}
function Column({ stage, leads }: { stage: string; leads: any[] }) {
  const { setNodeRef, isOver } = require('@dnd-kit/core').useDroppable({ id: stage })
  return (
    <div ref={setNodeRef} style={{ background: isOver ? '#0b1a3d' : 'transparent', border: '1px solid #1d2c52', borderRadius: 8, padding: 8, minHeight: 200 }}>
      <div style={{ color: BRAND.blue, fontWeight: 700, marginBottom: 8 }}>{stage} ({leads.length})</div>
      {leads.map(l => <LeadCard key={l.id} lead={l} />)}
    </div>
  )
}
```
> Note: prefer importing `useDroppable` at top with the other dnd-kit imports; the inline `require` is shown only to keep this snippet self-contained — refactor to a top import during implementation.

- [ ] **Step 3: LeadCard (draggable)**

`components/LeadCard.tsx`:
```tsx
'use client'
import { useDraggable } from '@dnd-kit/core'
import ConstraintChip from './ConstraintChip'
export default function LeadCard({ lead }: { lead: any }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: lead.id })
  const style = { transform: transform ? `translate(${transform.x}px,${transform.y}px)` : undefined,
    border: '1px solid #1d2c52', borderRadius: 6, padding: 8, marginBottom: 8, background: '#071536', cursor: 'grab' }
  return (
    <div ref={setNodeRef} style={style as any} {...listeners} {...attributes}>
      <a href={`/leads/${lead.id}`} style={{ fontWeight: 700 }}>{lead.name}</a>
      <div style={{ fontSize: 12, opacity: 0.8 }}>{lead.companyName ?? ''} · {lead.owner ?? ''}</div>
      <div style={{ marginTop: 6 }}><ConstraintChip value={lead.primaryConstraint} /></div>
    </div>
  )
}
```

- [ ] **Step 4: Manually verify** — pipeline shows 7 empty columns; create a lead (Task 14), drag it between columns, refresh, stage persisted.

- [ ] **Step 5: Commit**

```bash
git add app/pipeline components/KanbanBoard.tsx components/LeadCard.tsx && git commit -m "feat: kanban pipeline with drag-between-stages persistence"
```

---

## Task 14: Lead form (create) + lead profile (view/edit)

**Files:**
- Create: `app/leads/new/page.tsx`, `app/leads/[id]/page.tsx`, `components/LeadForm.tsx`

- [ ] **Step 1: LeadForm (client) — all fields**

`components/LeadForm.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { OWNERS, TRACKS, SOURCES, NEXT_ACTIONS, RELATIONSHIPS, CONSTRAINTS, BUSINESS_DEBTS, ROADMAP_STAGES } from '../lib/constants'

const text = ['name','companyName','email','linkedinUrl','website','graduationCriterion']
const selects: [string, readonly string[]][] = [
  ['owner', OWNERS], ['track', TRACKS], ['source', SOURCES], ['nextAction', NEXT_ACTIONS],
  ['relationship', RELATIONSHIPS], ['primaryConstraint', CONSTRAINTS],
  ['businessDebt', BUSINESS_DEBTS], ['scalingRoadmapStage', ROADMAP_STAGES],
]
export default function LeadForm({ lead, mode }: { lead?: any; mode: 'create' | 'edit' }) {
  const [form, setForm] = useState<any>(lead ?? { relationship: 'contact' })
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))
  async function save() {
    const url = mode === 'create' ? '/api/leads' : `/api/leads/${lead.id}`
    const method = mode === 'create' ? 'POST' : 'PATCH'
    const res = await fetch(url, { method, body: JSON.stringify(form) })
    const saved = await res.json()
    window.location.href = `/leads/${saved.id ?? lead.id}`
  }
  return (
    <div style={{ display: 'grid', gap: 10, maxWidth: 520 }}>
      {text.map(k => <label key={k}>{k}<input value={form[k] ?? ''} onChange={e => set(k, e.target.value)} /></label>)}
      {selects.map(([k, opts]) => (
        <label key={k}>{k}
          <select value={form[k] ?? ''} onChange={e => set(k, e.target.value)}>
            <option value=""></option>{opts.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
      ))}
      <label>monthlyValue<input type="number" value={form.monthlyValue ?? ''} onChange={e => set('monthlyValue', Number(e.target.value))} /></label>
      <label><input type="checkbox" checked={!!form.intakeFormReceived} onChange={e => set('intakeFormReceived', e.target.checked)} /> Intake form received</label>
      <label>notes<textarea value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} /></label>
      <button onClick={save}>Save</button>
    </div>
  )
}
```
> The `relationship` select is the **only** way to set `client` — and only by an explicit human choice. The API still routes it through `setRelationshipManually`.

- [ ] **Step 2: New lead page**

`app/leads/new/page.tsx`:
```tsx
import LeadForm from '../../../components/LeadForm'
export default function NewLead() { return <div><h1>New lead</h1><LeadForm mode="create" /></div> }
```

- [ ] **Step 3: Lead profile page**

`app/leads/[id]/page.tsx`:
```tsx
import { prisma } from '../../../lib/db'
import LeadForm from '../../../components/LeadForm'
import RelationshipBadge from '../../../components/RelationshipBadge'
export const dynamic = 'force-dynamic'
export default async function LeadProfile({ params }: { params: { id: string } }) {
  const lead = await prisma.lead.findUnique({ where: { id: params.id }, include: { openLoops: true } })
  if (!lead) return <p>Not found.</p>
  return (
    <div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <h1>{lead.name}</h1><RelationshipBadge value={lead.relationship} />
      </div>
      <p>Stage: {lead.stage}</p>
      <LeadForm mode="edit" lead={JSON.parse(JSON.stringify(lead))} />
    </div>
  )
}
```

- [ ] **Step 4: Manually verify** — create a lead (no owner) → profile shows `relationship: contact`. Change relationship to `client` by hand → badge becomes distinct green. Drag to Closed Won on pipeline → relationship stays whatever it was.

- [ ] **Step 5: Commit**

```bash
git add app/leads components/LeadForm.tsx && git commit -m "feat: lead create form and view/edit profile with relationship badge"
```

---

## Task 15: Company profile

**Files:**
- Create: `app/companies/[id]/page.tsx`

- [ ] **Step 1: Company profile page**

`app/companies/[id]/page.tsx`:
```tsx
import { prisma } from '../../../lib/db'
export const dynamic = 'force-dynamic'
export default async function CompanyProfile({ params }: { params: { id: string } }) {
  const company = await prisma.company.findUnique({ where: { id: params.id }, include: { leads: true } })
  if (!company) return <p>Not found.</p>
  return (
    <div>
      <h1>{company.name}</h1>
      {company.website && <p><a href={company.website}>{company.website}</a></p>}
      <p>{company.notes}</p>
      <h2>Leads</h2>
      <ul>{company.leads.map(l => <li key={l.id}><a href={`/leads/${l.id}`}>{l.name}</a> — {l.stage}</li>)}</ul>
    </div>
  )
}
```

- [ ] **Step 2: Manually verify** — create a company via `POST /api/companies`, link a lead by setting its `companyId`, view the company page and see the lead.

- [ ] **Step 3: Commit**

```bash
git add app/companies && git commit -m "feat: company profile page with linked leads"
```

---

## Task 16: Analytics dashboard

**Files:**
- Create: `app/analytics/page.tsx`, `components/AnalyticsCharts.tsx`

- [ ] **Step 1: Analytics page (server) computes metrics**

`app/analytics/page.tsx`:
```tsx
import { prisma } from '../../lib/db'
import { computeMRR, leadsByStage, leadsByOwner, leadsByConstraint, callToClientRate, dmToCallRate } from '../../lib/analytics'
import AnalyticsCharts from '../../components/AnalyticsCharts'
export const dynamic = 'force-dynamic'
export default async function Analytics() {
  const leads = await prisma.lead.findMany() as any[]
  const data = {
    mrr: computeMRR(leads), byStage: leadsByStage(leads), byOwner: leadsByOwner(leads),
    byConstraint: leadsByConstraint(leads), callToClient: callToClientRate(leads), dmToCall: dmToCallRate(leads),
  }
  return (<div><h1>Analytics</h1><AnalyticsCharts data={data} /></div>)
}
```

- [ ] **Step 2: AnalyticsCharts (constraint bars use 6 Ms colours)**

`components/AnalyticsCharts.tsx`:
```tsx
import { CONSTRAINT_COLORS, Constraint } from '../lib/constants'
export default function AnalyticsCharts({ data }: { data: any }) {
  const pct = (n: number) => `${Math.round(n * 100)}%`
  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <section><h2>MRR (Closed Won)</h2><div style={{ fontSize: 36, color: '#429edb' }}>£{data.mrr.toLocaleString()}</div></section>
      <section><h2>Conversion</h2><p>DM → Call: {pct(data.dmToCall)} · Call → Client: {pct(data.callToClient)}</p></section>
      <section><h2>By stage</h2>{Object.entries(data.byStage).map(([s, n]: any) => <div key={s}>{s}: {n}</div>)}</section>
      <section><h2>By owner</h2>{Object.entries(data.byOwner).map(([o, n]: any) => <div key={o}>{o}: {n}</div>)}</section>
      <section><h2>By primary constraint (6 Ms)</h2>
        {Object.entries(data.byConstraint).map(([c, n]: any) => (
          <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 12, height: 12, background: CONSTRAINT_COLORS[c as Constraint], display: 'inline-block', borderRadius: 2 }} />
            {c}: {n}
          </div>
        ))}
      </section>
    </div>
  )
}
```

- [ ] **Step 3: Manually verify** — with a couple of leads incl. one Closed Won with monthlyValue, MRR and counts render; constraint swatches match brand colours.

- [ ] **Step 4: Commit**

```bash
git add app/analytics components/AnalyticsCharts.tsx && git commit -m "feat: analytics dashboard (MRR, rates, by stage/owner/constraint)"
```

---

## Task 17: Settings screen (booking links)

**Files:**
- Create: `app/settings/page.tsx`, `components/SettingsForm.tsx`

- [ ] **Step 1: Settings page (server) loads settings**

`app/settings/page.tsx`:
```tsx
import { prisma } from '../../lib/db'
import SettingsForm from '../../components/SettingsForm'
export const dynamic = 'force-dynamic'
export default async function Settings() {
  const rows = await prisma.setting.findMany()
  const settings = Object.fromEntries(rows.map(r => [r.key, r.value]))
  return (<div><h1>Settings</h1><SettingsForm initial={settings} /></div>)
}
```

- [ ] **Step 2: SettingsForm (client)**

`components/SettingsForm.tsx`:
```tsx
'use client'
import { useState } from 'react'
const fields = [
  ['booking_link_shared', 'Shared discovery link'],
  ['booking_link_alex', "Alex's discovery link"],
  ['booking_link_jordan', "Jordan's discovery link"],
] as const
export default function SettingsForm({ initial }: { initial: Record<string, string> }) {
  const [form, setForm] = useState(initial)
  async function save() {
    await fetch('/api/settings', { method: 'PATCH', body: JSON.stringify(form) })
    alert('Saved')
  }
  return (
    <div style={{ display: 'grid', gap: 10, maxWidth: 520 }}>
      {fields.map(([k, label]) => (
        <label key={k}>{label}
          <input value={form[k] ?? ''} placeholder="https://cal.com/..." onChange={e => setForm({ ...form, [k]: e.target.value })} />
        </label>
      ))}
      <p style={{ opacity: 0.7, fontSize: 13 }}>Per-owner links fall back to the shared link until set.</p>
      <button onClick={save}>Save</button>
    </div>
  )
}
```

- [ ] **Step 3: Manually verify** — edit Alex's link, save, reload, value persists. Clear it → resolution falls back to shared (verified by the Task 7 unit test).

- [ ] **Step 4: Commit**

```bash
git add app/settings components/SettingsForm.tsx && git commit -m "feat: settings screen for editable per-owner booking links"
```

---

## Task 18: README + final verification

**Files:**
- Create/Modify: `README.md`

- [ ] **Step 1: Write the README**

`README.md` covering: what it is; prerequisites (Node 18+); setup (`npm install`, `npm run db:push`, `npm run db:seed`); run (`npm run dev`, login with `CRM_PASSWORD`); test (`npm test`); env vars; the relationship/`client` guardrail explained; a "Deploying to Railway (later)" placeholder section noting SQLite→Postgres swap and keeping auth on; note that the pipeline ships empty by design.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS — all of constants, leads, analytics, settings tests green.

- [ ] **Step 3: Full manual smoke test (the CONTEXT.md Step-2 checklist)**

Add a test lead → drag New Lead → Contacted → Call Booked → set Owner Jordan → set a Primary constraint and confirm chip colour → open profile → create a company → confirm analytics updates → confirm the new lead defaulted to `contact` and was never auto-promoted to `client`.

- [ ] **Step 4: Commit + push branch + open PR**

```bash
git add README.md && git commit -m "docs: README with run/test/guardrail/deploy notes"
git push -u origin feat/core-crm   # if a remote is configured
```
Then raise a PR `feat/core-crm` → `main` for review (per CONTEXT.md Definition of Done). If no remote yet, leave the branch ready and note it for the user.

---

## Definition of Done (verify all before calling complete)

- [ ] App runs locally with mocked endpoints; pipeline empty.
- [ ] All six screens work and are on-brand (midnight bg, white text, single blue accent, Helvetica/Inter).
- [ ] `relationship` defaults to `contact`; `client` never auto-set (re-verified via drag-to-Closed-Won).
- [ ] Tests pass: relationship-default, client-never-auto-set, stage-transition, MRR, booking-link fallback.
- [ ] Built on `feat/core-crm`; README written; PR raised (or branch ready if no remote).
- [ ] No client data in logs/errors; auth gate active; no secrets committed.
