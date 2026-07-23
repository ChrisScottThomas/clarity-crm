# Tutorial: Getting Started with Clarity CRM

In this tutorial you'll go from a fresh clone to a running CRM, add your first lead, drag it through the pipeline, and watch a synced Outlook email appear on the Activity feed. By the end you'll understand the core loop the whole app is built around: **leads move through stages, and activity accumulates against them.**

Everything runs locally against mocks — no accounts, no API keys, no network required.

## What you'll need

- **Node 18+** (built and tested on Node 22).
- A terminal and a browser.
- The repository cloned locally.

## Step 1: Install and set up the database

From the project root:

```bash
npm install
```

Create a `.env.local` file (it's git-ignored — you must create it) with these values:

```
DATABASE_URL="file:./data/clarity.db"
CRM_PASSWORD="clarity-dev"
SESSION_SECRET="dev-only-change-before-online"
```

Now create the database, generate the Prisma client, and seed the settings:

```bash
npm run db:push      # creates data/clarity.db and applies the schema
npm run db:generate  # generates the Prisma client into app/generated/prisma/
npm run db:seed      # seeds booking-link settings only — NO leads
```

> **Why `npm run db:generate` matters:** the generated client is git-ignored and not in the repo. Skip this and any page that queries the database throws `Cannot read properties of undefined (reading 'findMany')`. Re-run it after every schema change or fresh clone.

The seed deliberately adds **no leads** — you'll add your own next.

## Step 2: Run it and log in

```bash
npm run dev
```

Open **http://localhost:3000**. You'll be redirected to `/login` (every route is gated). Enter the password from your `.env.local` — `clarity-dev` — and you land on the **Pipeline**.

You now have a running CRM. The pipeline is empty by design.

## Step 3: Add your first lead

1. Go to **Contacts** (or the new-lead form at `/leads/new`).
2. Create a lead. Give it a name and — this matters for Step 5 — set the **email to `dana@acme.com`** (that's the address the mock Outlook fixtures use).
3. Save.

Open the lead's profile at `/leads/[id]`. Notice its **Relationship is `contact`**, not `client`. That's a deliberate guardrail: new leads are never clients. Even if you'd tried to create it as a `client`, the CRM would have quietly set it back to `contact`. Only an explicit manual edit can promote someone to `client`.

You've now got a visible lead. From here on, everything is about moving it and logging activity against it.

## Step 4: Move it through the pipeline

1. Open the **Pipeline** (`/pipeline`) — a kanban board with the seven stages:

   `New Lead → Contacted → Replied → Call Booked → Call Done → Closed Won → Closed Lost`

2. **Drag your lead** from _New Lead_ to _Contacted_.

Behind the scenes the drag PATCHes `/api/leads/[id]` with the new stage. The move is routed through a guarded helper that stamps `stageChangedAt` (used later by time-based automations) and, for the closed stages, sets `closedDate` — but it never touches the relationship. Reaching `Closed Won` would _not_ make this lead a `client`.

Drag it a couple more stages to get a feel for it, then check **Analytics** (`/analytics`) — the stage breakdown updates live.

## Step 5: Sync an email onto the Activity feed

This is where the integration seam shows itself. The CRM ships with a mock Outlook inbox containing a few plausible messages — two of them to/from `dana@acme.com`, which is why you set that email in Step 3.

1. Open **Activity** (`/activity`). Right now it's empty (or shows only your manual entries).
2. Click **↻ Sync email** (top right).

Within a moment, **two `✉️` entries tagged Outlook** appear, attached to your Dana lead — the mock has one inbound and one outbound message with her. The inbound one looks like:

```
← Re: Pricing — "thanks, let's get a call booked next week"
```

(The `←` marks an inbound message; outbound entries show `→`.)

What just happened: the sync pulled the mock messages, worked out that `dana@acme.com` is the _counterpart_ on those emails (not one of the team mailboxes), found your matching lead, and logged the emails as Activity entries. A third fixture message is addressed to someone with no lead, so it's skipped.

Now click **↻ Sync email again.** Nothing duplicates. Each message carries a unique `externalId`, so the second run _updates_ the existing entries instead of creating new ones. That idempotency is what makes the button safe to mash.

## What you built

You now have a working Clarity CRM with:

- A lead you created, correctly defaulted to `contact`.
- That lead moved through the kanban pipeline, with analytics reflecting it.
- Real (mock) Outlook emails synced onto its Activity timeline, idempotently.

That's the core loop: **leads move through stages; activity — manual notes, cal.com calls, synced emails, workflow automations — accumulates against them.**

### Where to go next

- **Automate it** — [How-to: Workflows](howto-workflows.md): fire an email or note when a lead reaches a stage.
- **Connect the other integrations** — [How-to: Integrations](howto-integrations.md): calendar sync and the cal.com booking webhook, plus how to swap a mock for the real provider.
- **Understand the design** — [Explanation: Architecture](explanation-architecture.md): why everything is mocked, and the `client`-never-auto-set rule you saw in Step 3.
- **Look things up** — [Reference: Data Model](reference-data-model.md) and [Reference: API](reference-api.md).

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Cannot read properties of undefined (reading 'findMany')` | Run `npm run db:generate` — the client wasn't generated |
| Redirected to `/login` in a loop | Check `CRM_PASSWORD` in `.env.local` matches what you type |
| Sync email does nothing | Your lead's `email` must be exactly `dana@acme.com` to match the mock fixture |
| Port 3000 in use | Stop the other process, or run `npm run dev -- -p 3001` |
