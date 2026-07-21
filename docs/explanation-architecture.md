# Explanation: Architecture

This document explains _why_ Clarity CRM is built the way it is. It is not a how-to and not a reference — it is the reasoning behind the decisions, so that the next person to touch the code changes it with the grain instead of against it.

## The overarching bet: build the whole thing locally, with everything mocked

Clarity CRM holds confidential client data and is meant to replace a live Notion pipeline. That raises the cost of "move fast and connect real APIs to see if it works." So the project makes a deliberate bet: **every external integration is mocked behind an interface, and the entire system runs and is tested locally before anything goes online.** cal.com, the shared inbox, calendar, transactional email, session notes — all of them have a mock implementation that is the _active_ one in local dev.

The payoff: you can exercise the complete flow — book a call, sync an email, watch it land on the Activity feed, fire a workflow — on a laptop with no credentials and no network. The cost: someone eventually has to write the real providers. That trade is made consciously; the seams are designed so that "someone" changes one line per integration.

## The integration seam

Every integration follows the same three-part shape:

```
interface   → the contract the CRM depends on   (e.g. InboxProvider)
MockXProvider  → the active local-dev implementation
GraphXProvider → the real implementation (throws "not implemented" until built)
export const xProvider = new MockXProvider()   ← the single swap point
```

Concretely, for the inbox ([`lib/integrations/inbox.ts`](../lib/integrations/inbox.ts)):

```ts
export interface InboxProvider {
  fetchMessages(owner: string, from: Date, to: Date): Promise<EmailMessage[]>
}
export class MockInboxProvider implements InboxProvider { /* returns fixed messages */ }
export class GraphInboxProvider implements InboxProvider {
  async fetchMessages() { throw new Error('GraphInboxProvider not implemented — using mock in local dev') }
}
export const inboxProvider: InboxProvider = new MockInboxProvider()  // ← the one line
```

### The problem this solves

Without the seam, "go live" is a scary, all-at-once rewrite: business logic and API plumbing are tangled, and you cannot test the logic without the live API. The matching rule (which lead does this email belong to?) would be untestable without a real inbox.

### The approach

The sync _logic_ (`lib/integrations/email-sync.ts`, `calendar-sync.ts`) depends only on the interface. It calls `inboxProvider.fetchMessages(...)` and does not know or care whether the bytes came from a hard-coded array or Microsoft Graph. To go live you implement `GraphInboxProvider` and change the last line of the file to `new GraphInboxProvider()`. Nothing else moves.

### The trade-off

The mock providers carry fixture data (a few plausible Outlook messages, one of which — `dana@acme.com` — is designed to match a documented lead so both email and calendar sync "light up" the same lead). That fixture has to be kept plausible, and it is easy to forget the mock is active and wonder why real data never appears. The `GraphXProvider` throwing a loud, specific error is the guardrail against that: if you accidentally wire the real provider before implementing it, you get a clear message, not silence.

## Pure core, effectful shell

The second recurring pattern: **decision logic is separated from I/O.** Pure, side-effect-free functions decide _what_ should happen; a thin effectful layer performs it and records the outcome.

You see this in two places:

- **Leads.** [`lib/leads.ts`](../lib/leads.ts) has `buildNewLead`, `applyStageChange`, `setRelationshipManually` — all pure transformations of a lead object. The route handlers do the actual `prisma.create/update`.
- **Workflows.** [`lib/workflow-engine.ts`](../lib/workflow-engine.ts) is "the pure planning core": `triggerMatches`, `planEffects`, `planScheduledEffect`, `nextStage` return _plans_ (`WorkflowEffect[]`) and never touch the database. [`lib/workflow-executor.ts`](../lib/workflow-executor.ts) loads the rules, asks the engine what to do, performs each effect, and writes a `WorkflowRun` audit row.

### Why

The planning logic is where the interesting rules live — "does this trigger fire for this event?", "which stage comes next?", "should this time-based rule advance the lead yet?". Keeping it pure makes it **trivially unit-testable**: pass an object in, assert on the object out, no database, no mocks of mocks. That is why the suite can have 128 tests without a heavy fixture harness.

### The trade-off

There is more indirection: a stage change touches `applyStageChange` (pure) _and_ the route (effectful) _and_ possibly the workflow executor. You have to read two files to see the whole story. The project accepts that verbosity because the alternative — business rules inlined in route handlers — is exactly what makes CRMs untestable and drift-prone over time.

## The Clarity guardrail: `client` is never auto-set

This is the single most Clarity-specific rule, and it is enforced structurally, not by convention.

Off-the-shelf CRMs call every closed deal a "customer." Clarity does not: a lead at `Closed Won` may still only be a `prospect` until a human confirms otherwise. So:

- `buildNewLead()` coerces any requested `relationship: 'client'` back to `contact`. The create path _cannot_ produce a client.
- `applyStageChange()` deliberately does not touch `relationship`. Moving to `Closed Won` never implies `client`.
- The only path that can set `client` is `setRelationshipManually()` / `PATCH /api/leads/[id]/relationship` — an explicit human action.

The rule is covered by tests (`buildNewLead`, `setRelationshipManually`, `applyStageChange`) and is called out in the Definition of Done: re-confirm it after any change that touches stage or relationship logic.

## Idempotency: `externalId` everywhere external

Anything that comes from an outside system can arrive more than once — a webhook retried, a sync re-run. Three tables carry a **unique `externalId`** so re-processing is a no-op update instead of a duplicate:

- `Meeting.externalId` — the cal.com booking `uid`.
- `Conversation.externalId` — the provider message id for a synced email (null for manual/workflow/cal.com entries).
- `ExternalEvent.externalId` — the provider calendar event id.

The sync handlers all follow the same shape: `findUnique({ where: { externalId } })` → update if present, create if not. That is why you can hit "Sync email" ten times and the Activity feed does not grow ten copies — the second run reports `updated`, not `created`.

A related detail: synced-email `Conversation` rows set `createdAt` to the email's `sentAt`, not "now," so a back-dated email sorts into the timeline at the right place rather than jumping to the top.

## Meetings vs. ExternalEvents

Two tables look similar; the split is intentional:

- **`Meeting`** is CRM-owned. It is created by a human ("Log meeting") or by a cal.com booking, and the CRM is the source of truth for it (status, cancellation, notes).
- **`ExternalEvent`** is a read-only mirror of an external calendar (Outlook). The CRM does not own it; it re-syncs and overwrites on each run.

Keeping them separate stops a calendar re-sync from clobbering a meeting the team manages directly.

## Auth: one shared password, HMAC cookie

Auth is deliberately minimal ([`lib/auth.ts`](../lib/auth.ts), [`middleware.ts`](../middleware.ts)): a single shared `CRM_PASSWORD`, and a successful login sets an HMAC-signed `clarity_session` cookie keyed by `SESSION_SECRET`. Middleware gates every route except `/login`, Next internals, and the cal.com webhook.

The webhook is exempt from the _session_ gate because it has its own, stronger auth: a constant-time HMAC check of the `x-cal-signature-256` header against the signing secret ([`lib/integrations/calcom.ts`](../lib/integrations/calcom.ts)). A cookie would be meaningless there — cal.com's servers do not have one.

### The trade-off

One shared password is right for two founders and confidential-but-not-hostile data. It does not do per-user identity, roles, or audit-by-actor. If Clarity ever needs "who changed this lead," this is the layer that gets replaced — the seam is small and self-contained, which is the point.

## Source-of-truth boundary

A design rule that is more product than code, but shapes the schema: **the CRM database owns the commercial pipeline; the Business Brain `.md` pages own the coaching narrative.** Commercial fields (stage, constraint, monthly value, relationship) are authoritative in the CRM. Diagnosis prose is read-only from the `.md` pages. Keeping that boundary clear is why the diagnostic fields on `Lead` are structured columns, not a free-text blob — the CRM stores the _diagnosis data_, not the _diagnosis writing_.

## Going online (deferred, but designed for)

The mock-first bet only pays off if the swap is genuinely cheap. It is:

1. **Database:** SQLite → Postgres by changing `DATABASE_URL`. The Prisma `better-sqlite3` adapter swaps behind the same client interface ([`lib/db.ts`](../lib/db.ts)).
2. **Integrations:** implement each `GraphXProvider` and flip its `export const xProvider = ...` line. Add auth to the two currently-open sync routes (they carry a `// TODO: protect when live`).
3. **Secrets:** real `CRM_PASSWORD`, `SESSION_SECRET`, provider credentials as environment variables — never committed.

## Related

- [Reference: Data Model](reference-data-model.md) — the concrete schema these decisions produced
- [Reference: API](reference-api.md) — the HTTP surface and its auth rules
- [How-to: Integrations](howto-integrations.md) — the step-by-step go-live procedure
- [How-to: Workflows](howto-workflows.md) — the pure-core/effectful-shell split in practice
