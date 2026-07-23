# Clarity CRM Documentation

Reader-facing documentation for Clarity CRM, organised by the [Diataxis](https://diataxis.fr/) framework — four kinds of docs for four kinds of need.

New here? Start with the tutorial. Looking something up? Jump to reference. Trying to get a specific thing done? See the how-tos. Want to understand a decision? Read the explanation.

## Tutorials — learning-oriented

| Doc | What you'll do |
| --- | --- |
| [Getting Started](tutorial-getting-started.md) | Go from a fresh clone to a running CRM: add a lead, move it through the pipeline, sync a mock Outlook email onto the Activity feed. |

## How-to guides — task-oriented

| Doc | Task |
| --- | --- |
| [Deploying](deploying.md) | Run the app under Docker Compose on SQLite or Postgres, set the environment, back up your data, deploy to Railway, and understand why TLS is your job. |
| [Integrations](howto-integrations.md) | Run Outlook email & calendar sync, wire the cal.com webhook, and swap a mock provider for the real one when going live. |
| [Workflows](howto-workflows.md) | Build automation rules, understand the trigger/action vocabulary, and run live vs. time-based rules. |

## Reference — information-oriented

| Doc | Contents |
| --- | --- |
| [Data Model](reference-data-model.md) | Every Prisma model, field, and the shared vocabulary (stages, owners, sources, constraints) in `lib/constants.ts`. |
| [HTTP API](reference-api.md) | All 18 route handlers with request/response shapes and auth rules. |

## Explanation — understanding-oriented

| Doc | Topic |
| --- | --- |
| [Architecture](explanation-architecture.md) | The mock-first integration seam, the pure-core/effectful-shell split, the `client`-never-auto-set guardrail, `externalId` idempotency, and the auth model — with the trade-offs behind each. |

## Also in this repo

- [`../README.md`](../README.md) — project overview, setup, screens, and deployment.
- [`../CONTEXT.md`](../CONTEXT.md) — the business brief: Clarity's domain, pipeline stages, brand, and the full build roadmap (Steps 1–7).
- [`integrations-and-conversations-plan.md`](integrations-and-conversations-plan.md) — the integrations planning note.
- [`superpowers/`](superpowers) — design specs and implementation plans, by date.
