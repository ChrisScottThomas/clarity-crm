<!--
  Keep PRs small and reviewable. CI gates on: typecheck + tests + build, secret
  scan (gitleaks), and white-label integrity. Lint and the docs check are
  report-only (they annotate, they don't block).
-->

## What & why

<!-- One or two sentences: what changes, and why. Link the plan/issue if there is one. -->

## Docs

Standing rule: **documentation is updated with every PR.** Tick one:

- [ ] Docs updated to match this change (README / `docs/**` / relevant `.md`).
- [ ] No docs change needed — reason: <!-- e.g. internal refactor with no behaviour change; test-only; tooling -->

<!--
  CI runs a report-only "Docs updated" check: if product code changed and no
  docs/markdown file did, it posts a ::warning:: annotation. It won't block the
  merge, but treat the warning as a prompt to update docs or explain why not.
-->

## Verification

<!-- How you know it works: the commands you ran and their result. -->

- [ ] `npx tsc --noEmit`
- [ ] `npx vitest run`
- [ ] `npx next build` (or explain why a build check doesn't apply)
