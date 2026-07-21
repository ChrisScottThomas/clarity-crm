### The business

> Clarity is an advisory and consulting practice working on constraint diagnosis, strategy, and growth. Two owners deliver across two tracks: **Alex** (Strategic / Commercial — constraint diagnosis, pricing, business model, validation) and **Jordan** (Operations / Teams — culture, operations). Clients engage via a free initial call, then a monthly retainer or an annual plan. (These details are illustrative placeholders — replace them with your own when you fork this CRM.)

### The pipeline stages (migrated exactly from the Notion Pipeline Tracker)

Use these seven, in order — do **not** let Claude invent its own:

1. **New Lead**
2. **Contacted**
3. **Replied**
4. **Call Booked**
5. **Call Done**
6. **Closed Won**
7. **Closed Lost**

### The fields each lead/contact carries (from the Notion schema)

- **Name** (full name), **Company Name**, **Email**, **LinkedIn URL**, **Website**
- **Owner** — `Alex` or `Jordan`
- **Track** — `Strategic / Commercial` (Alex) or `Operations / Teams` (Jordan)
- **Source** — one of: Warm DM, Referral, Content Inbound, FounderON, Cold Outreach, LinkedIn, Inbound, Event, Networking
- **Stage** — the seven above
- **Next Action** — one of: Research contact, Send message, Follow up, Book call, Prepare call, Send recap, Send proposal, Awaiting reply, Nurture, No action
- **Relationship** — `contact` | `prospect` | `client` | `peer` | `advisory` | `inactive`. **Default `contact`.** This field does not exist in Notion today; it comes from the Brain's data contract and must be added. "client" is reserved — never auto-set.
- **Monthly Value** (£, retainer value if Closed Won)
- **Dates:** Contact added, Date Contacted, Call Date, Follow Up Date, Closed Date
- **Intake Form Received** (checkbox — was the intake form completed before the call?)
- **Notes** (the specific thing referenced in the message, plus key context from the call)

### The diagnostic fields that make this Clarity's CRM (new — not in Notion)

These come from how Clarity actually works and from the Brain client-page data contract. Add them so a lead record carries the diagnosis, not just the sales stage:

- **Scaling Roadmap stage** — 0–9 (Hormozi 10-stage roadmap). Store the number and the stage name: e.g. `3 (Stabilize)`. Stages: 0 Improvise, 1 Monetize, 2 Advertise, 3 Stabilize, 4 Prioritize, 5 Productize, 6 Optimize, 7 (and up) scale stages.
- **Primary constraint (6 Ms)** — one of: **Money, Market, Model, Manpower, Metrics, More.** Colour-code each (see brand colours below).
- **Business debt** — `Ignorance debt` | `Avoidance debt` | `Experience debt`.
- **Graduation criterion** — free text; the binary test to leave the current stage.

### Brand (apply to any design prompt)

Clarity's visual identity — use these exact values:

| Token | Hex | Use |
|---|---|---|
| Clarity blue | `#429edb` | Accent: buttons, active stage, links, the one emphasis element |
| Clarity midnight | `#020f31` | Primary background |
| Clarity text | `#ffffff` | Default text on midnight |

Constraint colours (use to colour the Primary-constraint field and any 6 Ms chart — **only** when the UI references the 6 Ms, never decoratively):

| Constraint | Hex | | Constraint | Hex |
|---|---|---|---|---|
| More | `#56d4e8` | | Money | `#ffde59` |
| Metrics | `#a78bfa` | | Manpower | `#ff3131` |
| Market | `#dc8c32` | | Ignorance debt | `#5271ff` |
| Model | `#e850a0` | | Avoidance debt | `#34d399` |

Font: **Helvetica** (or Helvetica Neue); fallback **Inter** (Google Font). No other typefaces. Background defaults to Clarity midnight; one Clarity-blue accent element per view, not blue everywhere.

Canonical links: website `https://example.com`, contact `hello@example.com`.

**Discovery booking links — configurable, not hard-coded.** The current shared link is `https://cal.com/alex-jordan/discovery`. Clarity is moving to a cal.com Team plan with **separate links for Alex and Jordan**. Because these are about to change, the CRM must hold booking links in **settings, keyed by owner** — never hard-coded in the codebase. Make them editable from a Settings screen so swapping a link later takes seconds and no code change:

| Owner | Booking link (current → update on Settings screen) |
|---|---|
| Shared (current) | `https://cal.com/alex-jordan/discovery` |
| Alex (new — set today) | `https://cal.com/alex/discovery` *(placeholder — set the real one in Settings)* |
| Jordan (new — set today) | `https://cal.com/jordan/discovery` *(placeholder — set the real one in Settings)* |

Tell Claude explicitly: store each owner's discovery link as an editable setting; default to the shared link until the per-owner links are entered; surface them on a Settings page so Alex or Jordan can change them without touching code.

---

## Step 1 — Build the core CRM

Start basic. Get the fundamentals working and visible before adding anything clever. Open Claude Code in the CRM project folder and give it this brief (adapt freely):

> Build me a CRM as a web application for **Clarity** — an advisory practice with two owners (Alex, Jordan). Read `CONTEXT.md` in this repo first; it has our stages, fields, diagnostic model, and brand colours — use them exactly, don't invent your own.
>
> Requirements:
> - Store contacts/leads with these fields: Name, Company, Email, LinkedIn URL, Website, Owner (Alex/Jordan), Track (Strategic-Commercial / Operations-Teams), Source, Stage, Next Action, Relationship (default `contact`), Monthly Value (£), the date fields, Intake Form Received (checkbox), and Notes.
> - Add the diagnostic fields: Scaling Roadmap stage (0–9 + name), Primary constraint (one of the 6 Ms — Money/Market/Model/Manpower/Metrics/More), Business debt (Ignorance/Avoidance/Experience), and Graduation criterion.
> - A lead pipeline with exactly these seven stages in order: New Lead, Contacted, Replied, Call Booked, Call Done, Closed Won, Closed Lost. Kanban board, drag between stages.
> - Click into any lead to see a full profile, and dedicated **company profiles** I can view.
> - An **analytics tab** showing: leads by stage, DM→call rate, call→client rate, leads by owner (Alex vs Jordan), leads by source, current MRR from Closed Won (sum of Monthly Value), and a breakdown of leads by Primary constraint (the 6 Ms) using our constraint colours.
> - Style it in our brand: Clarity midnight background `#020f31`, white text, Clarity blue `#429edb` as the single accent (active stage / buttons / links), Helvetica with Inter fallback. Colour the Primary-constraint chips with our 6 Ms colours.
> - **Relationship must default to `contact`** on every new record. Never set `client` automatically — it can only be changed by hand. Add a clear visual difference so a `client` looks distinct from a `prospect`.
> - **Require login** — this holds confidential client data; no open access.
> - Don't populate it with any leads; we'll import ours later.
>
> Work on a new branch, not main. Add a README explaining how to run and deploy it, and basic tests for the pipeline-stage logic and the relationship-default rule.

**What to expect:** roughly 10 minutes; it builds the lot, often without questions because the field list and stages are explicit. Let it run.

The branch/README/tests instruction matters: the generic video skips it. For the CRM (unlike the Brain repo) we want a real branch + PR workflow.

---

## Step 2 — Deploy it so both founders can use it

Fold into Step 1 or run after:

> Once built, create a project in Railway, host the app there, and give me back the live link. It must keep login/auth on in production — this is confidential client data.

**First-time auth:** if Railway has never been connected, Claude Code prompts you (a login URL or API key). One-time step; after that Claude Code handles Railway. You get a live link back and rarely touch the Railway dashboard.

**Test it:** open the link. Add a test lead, drag it New Lead → Contacted → Call Booked, set Owner to Jordan, set a Primary constraint and check the colour, open the profile, create a company, confirm the analytics tab updates and that the new lead defaulted to `contact`. Confirm the basics before building further.

---

## Step 3 — Migrate from Notion

This is the step the generic guide doesn't have, and it's the point of the exercise for Clarity. The Notion **Pipeline Tracker** (and the supporting databases — Open Loops, Weekly Metrics, Focus Tasks, Framework Progress) currently hold the live pipeline. Move it across, then retire Notion as the pipeline system of record.

### What's in Notion today (the migration inventory)

| Notion artefact | What it is | Where it goes in the CRM |
|---|---|---|
| **Pipeline Tracker** database | The live CRM: contacts, stage, owner, track, source, next action, dates, monthly value, notes | The CRM's core leads table — fields already match (Step 1) |
| **Clarity Open Loops** database | Commitments/follow-ups owed to or from contacts | An "Open Loops" / tasks panel on each lead profile, plus a global open-loops view |
| **Weekly Metrics** database | Monday snapshot: DMs sent, reply rate, posts, MRR, etc. | The analytics tab (live) — replaces the manual Monday update |
| **Focus Tasks** database | Weekly focus tasks | Optional: a tasks view, or leave in Notion if not pipeline-critical |
| **Framework Progress** database | Phase-progress tracker (Phases 1–5) | Optional dashboard widget; lower priority |
| **Metrics & Tracking dashboard** page | The roll-up the above feed | Superseded by the CRM analytics tab |

**Stage mapping is 1:1** — the seven Notion stages are already the seven CRM stages, so no re-mapping is needed. The **Source**, **Owner**, **Track**, and **Next Action** option lists also carry across unchanged (they're in `CONTEXT.md`).

### The migration prompt

> I want to migrate our existing pipeline out of Notion into this CRM. Here is an export of our Notion **Pipeline Tracker** (CSV/JSON attached). Import every row, mapping the columns straight across — Name, Company Name, Email, LinkedIn URL, Website, Owner, Track, Source, Stage, Next Action, Monthly Value, Notes, and all the date fields (Contact added, Date Contacted, Call Date, Follow Up Date, Closed Date), plus Intake Form Received.
>
> Rules for the import:
> - Set **Relationship** for every imported row to `prospect` by default, **except** anyone explicitly confirmed as a client — and only set `client` where I've marked it, never inferred from stage. If a row is at Closed Won but I haven't confirmed them as a client, import as `prospect` and flag it for me to review.
> - Leave the diagnostic fields (Scaling Roadmap stage, Primary constraint, Business debt, Graduation criterion) blank unless present in the export — we'll fill them in.
> - Don't create duplicates if I re-run the import; match on Email then Name.
>
> Also import our **Open Loops** export into the per-lead open-loops panel, matching each loop to its contact by name.

**Get the export from Notion:** in each Notion database, use the `•••` menu → Export → Markdown & CSV (or CSV). Hand the CSV to Claude Code in the CRM repo.

**Verify the migration (do not skip):** spot-check 5–10 records against Notion — right stage, right owner, dates intact, Monthly Value correct. Confirm nobody was silently promoted to `client`. Confirm the count of imported rows matches the Notion row count. Only once this checks out should you stop updating Notion and switch to the CRM as the live pipeline.

> **Don't delete the Notion databases yet.** Keep them read-only as a backup for a few weeks until the CRM is trusted in daily use.

---

## Step 4 — Replace the existing Brain dashboard view

Clarity already runs an Express + Notion "Clarity Dashboard" that renders a per-client analytical view (the four-line playback, knobs, track, watch) live from the Business Brain `.md` client pages. The plan is for the CRM to **absorb this** over time so there's one place, not two.

The nuance: the **CRM database is the source of truth for the commercial pipeline**, but the **coaching narrative** (session notes, the four-line playback, diagnosis prose) stays canonical in the Brain `.md` pages per the data contract. So the CRM should *show* the diagnostic view, sourced from the right place.

> On each lead's profile, add a "Diagnosis" panel modelled on our Brain client-page dashboard: a four-line playback (locate / stage job / constraint / move), a Knobs table (lever, timing, priority, detail), a Track table (metric, value, note), and a Watch list (behavioural/close-risk flags). Populate the structured commercial fields (stage, constraint, monthly value, relationship) from the CRM database. For the narrative fields (playback, knobs, watch), let me either type them directly in the CRM or pull them from the matching Business Brain `.md` client page if one exists — read-only from the `.md`, since that page stays the canonical coaching record.

Decide deliberately when to switch off the old Express dashboard: only once the CRM's diagnosis panel covers what Alex and Jordan actually use it for in sessions. Until then, run both.

---

## Step 5 — Connect external tools (the priority integrations)

For Clarity, three integrations matter, in this order. Add one at a time and test each.

### 5a — cal.com (discovery bookings)

> Integrate the CRM with our cal.com discovery bookings. We're on a cal.com **Team plan with separate links for Alex and Jordan** — read the booking links from the Settings store (keyed by owner), don't hard-code any URL. When someone books a discovery call, automatically create a lead (or update the matching one by email) and move it to the **Call Booked** stage, with the Call Date set from the booking and Source set to Inbound unless it already has a source. Set the Owner from which cal.com link/host the booking came through (Alex's link → Owner Alex, Jordan's link → Owner Jordan). Keep working if only the shared link is configured.

This replaces the current path where cal.com bookings flow into HubSpot. Once verified, the CRM becomes the destination — stop relying on HubSpot for this.

### 5b — hello@example.com shared inbox

> Connect the CRM to our shared inbox, hello@example.com. When an email arrives from an address that matches a contact, log it against that contact's record (timestamp, subject, snippet). If there's no match, surface it as an unmatched inbound for me to assign. Don't send anything from this step — read/log only.

### 5c — Krisp / Fathom session notes

> After a discovery or mentoring call, pull the meeting notes from [Krisp / Fathom] into the matching contact's profile as a dated note, matched by attendee email or name. Keep them in a "Session notes" section on the profile, separate from my manual Notes.

Claude decides per integration whether to use an MCP server or a direct API; it doesn't matter as long as it works. Each will need an API key or an auth step.

> **HubSpot:** the goal is to retire it, not extend it. If anything still depends on HubSpot during the transition, the safe move is a one-time export of HubSpot contacts into the CRM (same import discipline as Step 3 — default `prospect`, no auto-`client`), then switch the cal.com destination to the CRM and wind HubSpot down. Don't build new automations that write to HubSpot.

---

## Step 6 — Email notifications

Example: notify the owner when a deal is won.

> When a lead moves to **Closed Won**, email the lead's Owner (Alex or Jordan) and hello@example.com to flag it. Use **Resend** from our example.com domain — not a personal Gmail account.

Resend sends from Clarity's own domain and is built for transactional email. Once the Resend account and domain are connected, Claude reuses them. Test by dragging a test lead to Closed Won — the email should arrive within seconds.

Other notifications worth considering (add only the ones that genuinely matter): a daily digest of leads whose **Follow Up Date** is today; an alert when a lead sits in **Call Booked** with **Intake Form Received** still unchecked the day before the call.

---

## Step 7 — Background automations

Because the app runs 24/7 on Railway, it can run scheduled jobs. Design these around real Clarity rules, not toy timers (the video's "move after 60 seconds" is just a demo that background jobs run — don't ship anything like it).

Genuinely useful automations for Clarity:

> - Flag a lead as **stale** if it hasn't changed stage in 14 days, so it surfaces for a nudge.
> - If a lead has been in **Contacted** for 7 days with no reply, set Next Action to **Follow up** and surface it.
> - After a call moves to **Call Done**, if Next Action isn't set within 24 hours, prompt me to set one (Send recap / Send proposal / Nurture).
> - Recompute the weekly metrics every Monday morning (DMs sent, reply rate, call rates, MRR) so the analytics tab replaces the manual Monday Notion update.

Test automations carefully — a bad automation silently mangling the pipeline is worse than no automation. Build them one at a time and watch each for a week.

---

## Suggested build order

1. **Core CRM + deploy + brand** (Steps 1–2) — get something live and on-brand.
2. **Migrate from Notion** (Step 3) — import the real pipeline; verify; keep Notion read-only as backup.
3. **Use it for real for a week.** Real use surfaces what's actually needed, which is rarely what you'd guess up front.
4. **cal.com integration** (Step 5a) — the highest-value automation; kills the most manual copying and starts the HubSpot wind-down.
5. **Diagnosis panel** (Step 4) — so sessions can run off the CRM, paving the way to retire the old dashboard.
6. **Notifications + remaining integrations** (Steps 5b/5c, 6) for the events that genuinely matter.
7. **Automations** (Step 7) only once a manual process has proven repetitive and rule-based enough to trust to a machine.

---

## Definition of done (each change)

Per Clarity's working standard, every feature is finished only when:

- [ ] Built on a **branch, not pushed straight to main**; a PR is raised and reviewed before merging. (This is the CRM repo — the Brain's "write directly" rule does not apply here.)
- [ ] **Tested on the live app**, not just "Claude says it works."
- [ ] **README / docs updated** to reflect the new feature or integration. (Definition-of-done explicitly includes curating and updating documentation.)
- [ ] **Tests** added or existing ones still passing — especially the relationship-default and stage-transition logic.
- [ ] Any **API keys / credentials stored securely** (environment variables, not hard-coded in the repo).
- [ ] **Confidentiality preserved:** login still required; no client data exposed in logs, error messages, or any shared/exported view; financial specifics not surfaced anywhere public.
- [ ] **`client` is still never auto-set** — re-confirm after any change that touches stage or relationship logic.

---

## Known risks to keep in mind

- **Data security.** The CRM holds confidential client data. Login/auth must stay on, secrets must never be committed, and outputs that could be seen externally must use first names only and omit financial specifics — same rules the Business Brain runs under.
- **Relationship integrity.** The single most Clarity-specific risk: a record drifting to `client` when the person is only a prospect. Off-the-shelf tools call every closed deal a "customer"; Clarity does not. Guard this rule in code and re-check it after every change.
- **Source-of-truth split.** The CRM owns the pipeline; the Brain `.md` pages own the coaching narrative. Keep the boundary clear so the two don't silently diverge. When in doubt, the CRM is authoritative for commercial fields, the `.md` page for diagnosis prose.
- **Backups.** Off-the-shelf tools back up for you. Confirm with Claude Code that the CRM database is backed up and that you know how to restore it. Keep the Notion export as a cold backup until the CRM has run cleanly for a few weeks.
- **The bus factor.** If only one person understands the system, that's a risk. The README and docs (per Definition of Done) are what mitigate it — keep them current.
- **Cost creep.** Hosting, Resend, and any paid integrations add up. Cheaper than HubSpot at Clarity's scale, but not free.

---

## Quick reference — what maps to what

| Notion / HubSpot today | CRM equivalent |
|---|---|
| Pipeline Tracker (7 stages, Owner, Track, Source, Next Action) | Core leads table + Kanban (identical fields/stages) |
| Manual Monday metrics snapshot | Live analytics tab |
| Clarity Open Loops database | Per-lead open-loops panel + global view |
| Brain Express + Notion dashboard (per-client view) | CRM "Diagnosis" panel (commercial fields from CRM DB; narrative read from `.md`) |
| cal.com → HubSpot | cal.com → CRM (Call Booked + Call Date) |
| HubSpot contacts | One-time import to CRM, then retire HubSpot |
| Notion as pipeline source of truth | CRM database as source of truth |
| Brain `.md` client pages | Stay canonical for coaching narrative / diagnosis only |
