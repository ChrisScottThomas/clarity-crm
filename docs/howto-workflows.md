# How to build and run workflow automations

Clarity CRM's Workflows feature lets you attach automations to pipeline events: "when a lead reaches Call Booked, email me" or "when a lead is created, log a note." This guide covers creating rules, the vocabulary the engine understands, and how live vs. time-based rules run.

The engine is split into a pure planner ([`lib/workflow-engine.ts`](../lib/workflow-engine.ts)) and an effectful executor ([`lib/workflow-executor.ts`](../lib/workflow-executor.ts)) — see [Explanation: Architecture](explanation-architecture.md#pure-core-effectful-shell) for why.

## Prerequisites

- The app running locally (`npm run dev`).
- Familiarity with the seven pipeline stages (see [Reference: Data Model](reference-data-model.md#pipeline-stages-stages)).

## The vocabulary

A rule is a **trigger** paired with an **action**. Both are constrained to strings the engine can execute — the API rejects anything else with `400`, so you can never create a rule that silently does nothing.

### Triggers (`TRIGGERS`)

| Trigger | Fires when |
| --- | --- |
| `Lead created` | A new lead is created (`POST /api/leads`, or a cal.com booking creating a lead) |
| `Lead moved to <Stage>` | A lead's stage changes _to_ that stage. One per stage: `Lead moved to New Lead` … `Lead moved to Closed Lost` |
| `Lead score updated` | A lead is AI-scored (`/api/leads/[id]/score`) |

### Actions (`ACTIONS`)

| Action | Effect | Notes |
| --- | --- | --- |
| `Send email notification` | Emails the lead's address | No-op (skipped) if the lead has no email |
| `Create follow-up reminder` | Creates an `OpenLoop` due in 7 days | |
| `Log activity note` | Writes a `workflow`-sourced note to the lead's Activity | Tagged **Auto** in the feed |
| `Notify team on Slack` | Logs the intent to the server console | No Slack provider yet — logged, auditable |
| `Move to next stage after 7 days` | Advances a stalled lead one stage | **Time-based** — runs on the scheduled sweep, not on live events |

## How to create a rule

### From the UI

1. Open **Workflows** (`/workflows`).
2. Fill in a name, pick a trigger and an action, and save. The form (`components/WorkflowForm.tsx`) only offers valid vocabulary.

### From the command line

```bash
curl -X POST http://localhost:3000/api/workflows \
  -H 'Content-Type: application/json' \
  -H 'Cookie: clarity_session=<your session cookie>' \
  -d '{
    "name": "Email me on Call Booked",
    "trigger": "Lead moved to Call Booked",
    "action": "Send email notification"
  }'
```

Returns the created rule with `201`. An unknown trigger or action returns `400 { "error": "unknown trigger: ..." }`.

### Verification

Trigger the event and check the Activity feed / your mock email log:

```bash
# Move a lead to Call Booked to fire the rule above
curl -X PATCH http://localhost:3000/api/leads/<leadId> \
  -H 'Content-Type: application/json' \
  -H 'Cookie: clarity_session=<cookie>' \
  -d '{ "stage": "Call Booked" }'
```

The mock email provider prints `[mock email] <to> <subject>` to the dev-server console. Every run is also recorded in the `WorkflowRun` table (`status`: `success` / `skipped` / `error`).

## How live rules run

Live rules fire synchronously as part of the mutation that caused the event. The route handler calls `runWorkflows(event)` (`lib/workflow-executor.ts`), which:

1. Loads all `enabled` rules.
2. Keeps those whose trigger matches the event (`triggerMatches`).
3. Plans each rule's effects (`planEffects`) and performs them, recording a `WorkflowRun` per effect.

`runWorkflows` is **fire-and-forget safe**: a failing rule is caught and logged as an `error` run, never thrown back to the caller. An automation can never break a core lead mutation — creating a lead succeeds even if a rule attached to it blows up.

Events that fire live:

- `lead.created` — from `POST /api/leads` and cal.com `BOOKING_CREATED`.
- `lead.stage_changed` — from `PATCH /api/leads/[id]` (when the stage actually moves) and cal.com advancing to Call Booked.
- `lead.score_updated` — from `/api/leads/[id]/score`.

## How the time-based rule runs

`Move to next stage after 7 days` is different: it is not about a single event, it is about leads that have _sat still_. It runs on a sweep across the whole pipeline, triggered by:

```bash
curl -X POST http://localhost:3000/api/workflows/run \
  -H 'Cookie: clarity_session=<cookie>'
# → { "ok": true, "fired": 2 }
```

`runScheduledWorkflows()` loads every lead and, for each, asks `planScheduledEffect` whether it should advance:

- The lead's `stageChangedAt` must be **more than 7 days** ago.
- The lead advances exactly one stage (`nextStage`).
- It **never auto-advances into a terminal stage** (`Closed Won` / `Closed Lost`) — those are human decisions. A lead in `Call Done` will not be auto-closed.

There is no cron in the app today; `POST /api/workflows/run` is the manual trigger. A future scheduler can hit the same endpoint on a timer (the app is designed to run 24/7 on Railway).

### Verification

To see an advance without waiting 7 real days, set a lead's `stageChangedAt` into the past (via a Prisma script or direct DB edit), create/enable a `Move to next stage after 7 days` rule, then POST to `/api/workflows/run`. The lead advances one stage and a `success` `WorkflowRun` is recorded with detail like `advanced Contacted → Replied`.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Rule never fires | Rule is disabled, or trigger doesn't match the event | Confirm `enabled: true`; check the trigger stage matches the _destination_ stage |
| `Send email notification` skipped | Lead has no email | Expected — the effect no-ops with reason "lead has no email address" |
| `POST /api/workflows/run` returns `fired: 0` | No enabled time-based rules, or no lead is >7 days stale | Add a `Move to next stage after 7 days` rule; check `stageChangedAt` |
| Lead won't auto-advance past `Call Done` | Next stage would be terminal | By design — closing is never automated |
| Rule created but does nothing | It was accepted, but the action is a no-op for this event | Check the `WorkflowRun` `detail` column for the skip reason |

## Related

- [Reference: API](reference-api.md#workflows) — the workflow endpoints
- [Reference: Data Model](reference-data-model.md#workflowrule) — `WorkflowRule` / `WorkflowRun` schema
- [Explanation: Architecture](explanation-architecture.md#pure-core-effectful-shell) — why planning and execution are split
