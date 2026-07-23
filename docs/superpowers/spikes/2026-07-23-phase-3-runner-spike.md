# Phase 3 runner spike — R6 & R7 findings

Date: 2026-07-23
Task: Phase 3 plan, Task 2b (`docs/superpowers/plans/2026-07-23-phase-3-deploy.md`)
Host: darwin/arm64, Docker 29.2.1, base image `node:22-slim` (247 MB).
Follows: [`2026-07-23-phase-3-docker-spike.md`](2026-07-23-phase-3-docker-spike.md) (R1–R5).
Artifacts: throwaway `Dockerfile.spike2{,b,c,d}` built as `clarity-runner-spike{,-b,-c,-d}`,
a `postgres:16` container and a `spike2-net` network. All torn down; nothing is committed
except this document and the spec update.

`next.config.ts` already carried `output: 'standalone'`, `serverExternalPackages` and the
`.dockerignore` from Task 3, so — unlike the previous spike — no temporary config edits were needed.

## Headline

| Risk | Verdict |
|------|---------|
| R6 — `next build` succeeds with an **unreachable** dummy Postgres URL | **Confirmed** |
| R7 — a slimmed runner can still run `db push`, at an acceptable size | **Confirmed, but only for the third mechanism tried** — the spec's preferred candidate measured **worse than the thing it replaced** |

R6 is a clean pass: no real credentials need to enter image history.

R7 took four measured images to settle. The spec's first-choice mechanism (`npm ci --omit=dev`)
is **refuted on size** — 833 MB of production-only dependencies against 999 MB for the full tree.
A self-contained tooling install won at **549 MB**, but only after two module-resolution failures
that would have shipped as runtime bugs.

---

## R6 — Does `next build` succeed with an unreachable dummy Postgres URL?

**Theory.** `next build` instantiates PrismaClient during page-data collection (proven in the
previous spike), but only *constructs* it — it never opens a connection. So a syntactically valid
Postgres URL pointing at nothing should be enough, and the Dockerfile can use a dummy URL instead
of baking a reachable database's credentials into image history.

**Verdict: CONFIRMED.**

Run from the repo root against `127.0.0.1:1` — a port that is closed by definition:

```
$ DATABASE_URL="postgres://build:build@127.0.0.1:1/build" npm run db:generate
prisma-provider: DATABASE_URL is postgresql — running `prisma generate`
✔ Generated Prisma Client (7.8.0) to ./app/generated/prisma in 43ms

$ DATABASE_URL="postgres://build:build@127.0.0.1:1/build" npx next build
▲ Next.js 16.2.9 (Turbopack)
  Creating an optimized production build ...
✓ Compiled successfully in 1500ms
  Running TypeScript ...
  Finished TypeScript in 1981ms ...
  Collecting page data using 11 workers ...
✓ Generating static pages using 11 workers (19/19) in 78ms
  Finalizing page optimization ...
exit: 0
```

All 36 routes were emitted. `Collecting page data` — the exact stage that failed with a hard error
when `DATABASE_URL` was absent — passed without a connection attempt. The only diagnostic in the
whole log is the nested-worktree lockfile warning (a local artifact; see "Local artifacts" below):

```
$ grep -iE "error|econnrefused|failed|warn" r6-build2.log
⚠ Warning: Next.js inferred your workspace root, but it may not be correct.
 To silence this warning, set `turbopack.root` in your Next.js config, or consider removing one of the lockfiles if it's not needed.
```

No `ECONNREFUSED`, no timeout, no retry. The build is genuinely a Postgres build — the dummy URL
selected the Postgres provider and Next inlined it into the server chunk:

```
$ grep -oiE "provider ?= ?.(postgresql|sqlite)" .next/server/chunks/*.js | sort -u
.next/server/chunks/_claude_worktrees_session-c77cb5_0_fhabn._.js:provider = "postgresql
```

This was then reproduced **inside Docker**, where nothing is listening on any port in the build
container. Every `builder` stage below used
`ENV DATABASE_URL="postgres://build:build@127.0.0.1:1/build"`, and every one of the four images
built successfully:

```
#13 [builder 5/6] RUN npm run db:generate
#13 0.335 prisma-provider: DATABASE_URL is postgresql — running `prisma generate`
#13 DONE 1.0s
#14 [builder 6/6] RUN npx next build
#14 2.091 ✓ Compiled successfully in 1481ms
#14 4.058   Collecting page data using 11 workers ...
#14 DONE 4.8s
```

**Consequence:** the fallback the plan feared — standing up a throwaway Postgres inside the builder
stage — is not needed. `ARG DB_PROVIDER` → a hardcoded dummy `DATABASE_URL` is sufficient, and no
real credentials enter image history.

---

## R7 — Can a slimmed runner still run `db push`, at an acceptable size?

**Theory.** The previous spike showed the traced standalone tree already carries
`better_sqlite3.node`, `pg` and `@prisma/client`, so the runner needs extra `node_modules` only for
the `prisma` CLI and `tsx`. Shipping less than the full 927 MB tree should therefore be possible.

**Verdict: CONFIRMED** — `db push` succeeds and the app serves real DB-backed traffic from a
**549 MB** image, down from the previous spike's **1.25 GB**. But the spec's *preferred* mechanism
was refuted and two of the three candidate mechanisms failed outright, so the mechanism matters far
more than the theory suggested.

### Measured results — four images

| Variant | Mechanism | `db push` | Image size |
|---|---|---|---|
| Spike A (previous) | full `npm ci` tree layered over standalone | worked | **1.25 GB** |
| **A2** | `npm ci --omit=dev` tree layered over standalone, `RUN chown -R node:node /app` | **worked** | **1.95 GB** |
| **B** | same, but `COPY --chown=node:node` instead of `RUN chown -R` | not re-tested (same tree as A2) | **1.13 GB** |
| **C** | self-contained `/opt/tooling` (prisma + tsx), alongside `/app` | **failed** | 549 MB |
| **D** | same tooling tree merged **into** `/app/node_modules`, standalone copied last | **worked** | **549 MB** |

```
$ docker images --format '{{.Repository}}\t{{.Size}}' | grep clarity-runner-spike
clarity-runner-spike-c	549MB
clarity-runner-spike-b	1.13GB
clarity-runner-spike	1.95GB
$ docker images clarity-runner-spike-d --format '{{.Size}}'
549MB
```

### Finding 1 — `npm ci --omit=dev` is not a slimming mechanism (spec candidate 1, refuted)

Measured in a clean Linux container, straight from the repo's lockfile:

```
$ docker run --rm -v "$PWD":/src -w /tmp node:22-slim sh -c \
    "cp /src/package.json /src/package-lock.json . && npm ci --omit=dev >/dev/null 2>&1 && du -sh node_modules && ls node_modules/.bin | grep -E '^(prisma|tsx)$'"
833M	node_modules
prisma
tsx
```

Both binaries are present, so the mechanism *works* — it just does not slim. **833 MB against the
full tree's 999 MB: a 17 % saving.** The breakdown says why:

```
239M	node_modules/@next
172M	node_modules/next
167M	node_modules/@prisma
41M	node_modules/prisma
34M	node_modules/effect
34M	node_modules/@img
26M	node_modules/@electric-sql
23M	node_modules/typescript
12M	node_modules/better-sqlite3
```

`next` + `@next` (411 MB) and `@prisma` (167 MB) are **production** dependencies. Dropping
`devDependencies` removes vitest and eslint but not the two things that dominate — and it does not
even remove `typescript` (23 MB), which arrives transitively. The spec's instinct that "the 927 MB
figure came from a full install including the vitest and TypeScript trees" is **wrong**: those trees
are a small minority of the bytes.

Worse, the runner already has `next` — the 60.7 MB traced standalone tree contains a pruned 16 MB
copy. Layering the production tree over it replaces a 16 MB `next` with a 175 MB one.

### Finding 2 — `RUN chown -R` doubled the image (1.13 GB → 1.95 GB)

Variant A2 followed the task's stated shape literally, including `RUN mkdir -p /app/data && chown -R node:node /app`. `docker history`:

```
819MB	RUN /bin/sh -c mkdir -p /app/data && chown -R node:node /app # buildkit
1.05kB	COPY /app/package.json ./package.json # buildkit
47.4kB	COPY /app/lib ./lib # buildkit
13.1kB	COPY /app/scripts ./scripts # buildkit
374B	COPY /app/prisma.config.ts ./prisma.config.ts # buildkit
5.45kB	COPY /app/prisma ./prisma # buildkit
805MB	COPY /app/node_modules ./node_modules # buildkit
3.31kB	COPY /app/public ./public # buildkit
729kB	COPY /app/.next/static ./.next/static # buildkit
60.7MB	COPY /app/.next/standalone ./ # buildkit
13.6MB	RUN ... openssl curl ...
```

A recursive `chown` rewrites the metadata of every file, so the overlay layer contains **a second
complete copy** of everything beneath it — 819 MB. Variant B is byte-identical except that it uses
`COPY --chown=node:node` on each copy and chowns only `/app/data`, and it measures 1.13 GB. **The
`RUN chown -R` alone cost 819 MB** — more than the entire winning image.

This is the single largest correctable waste found in either spike, and it is invisible in the
Dockerfile: the offending line looks like housekeeping.

### Finding 3 — `npx prisma` ignores `PATH` and will network-install a *different* Prisma (variant C)

Variant C put the tooling in `/opt/tooling` and added `/opt/tooling/node_modules/.bin` to `PATH`.
`db push` failed:

```
$ docker run --rm --network spike2-net -e DATABASE_URL="postgres://postgres:spike@spike2-pg:5432/clarity_c" \
    clarity-runner-spike-c sh -c "npm run db:push"
> clarity-crm@0.1.0 db:push
> tsx scripts/prisma-provider.ts db push

prisma-provider: DATABASE_URL is postgresql — running `prisma db push`
npm warn exec The following package was not found and will be installed: prisma@7.9.0
Failed to load config file "/app/prisma.config.ts" as a TypeScript/JavaScript module. Error: Error: Cannot find module 'dotenv/config'
Require stack:
- /app/prisma.config.ts
exit: 1
```

Two independent defects in one run:

1. **`npx` does not consult `PATH`.** The binary was unambiguously on `PATH` and resolvable:
   ```
   $ docker run --rm clarity-runner-spike-c sh -c 'echo "PATH=$PATH"; which prisma tsx'
   PATH=/opt/tooling/node_modules/.bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
   /opt/tooling/node_modules/.bin/prisma
   /opt/tooling/node_modules/.bin/tsx
   ```
   `scripts/prisma-provider.ts` spawns `npx prisma`, and `npx` resolves only from the local
   `node_modules` tree. Not finding one, it silently **downloaded prisma@7.9.0** — a *different
   minor version* from the 7.8.0 client baked into the image. A container that reaches for the
   npm registry at boot, and gets a version that does not match its own generated client, is a far
   worse failure mode than a large image. On a network-isolated host it would simply hang or fail.

2. **`prisma.config.ts` resolves its imports from `/app`.** It begins `import "dotenv/config"`;
   `dotenv` arrives transitively via `prisma → @prisma/config → c12`, so it exists only in the
   tooling tree. The traced standalone tree has no `dotenv`:
   ```
   $ docker run --rm clarity-runner-spike-c sh -c 'ls -d /app/node_modules/dotenv; ls -d /opt/tooling/node_modules/dotenv'
   ls: cannot access '/app/node_modules/dotenv': No such file or directory
   /opt/tooling/node_modules/dotenv
   ```

Both say the same thing: **the tooling tree must live at `/app/node_modules`, not beside it.**

### Finding 4 — variant D works: merge the tooling tree in, and copy standalone *last*

Variant D installs only `prisma@7.8.0` and `tsx@4.22.4` into a self-contained tooling stage, then
copies that tree to `/app/node_modules` **first**, so the traced standalone tree lands on top and
wins every filename conflict:

```dockerfile
COPY --from=tooling --chown=node:node /opt/tooling/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/.next/standalone ./
```

The tooling install alone measures 241 MB:

```
$ docker run --rm node:22-slim sh -c 'mkdir -p /opt/t && cd /opt/t && npm init -y >/dev/null && npm install --omit=dev prisma@7.8.0 tsx@4 >/dev/null 2>&1 && du -sh node_modules'
241M	node_modules
```

**`db push` against the real Postgres, from inside the slimmed image:**

```
$ docker run --rm --network spike2-net -e DATABASE_URL="postgres://postgres:spike@spike2-pg:5432/clarity_d" \
    clarity-runner-spike-d sh -c "npm run db:push"
> clarity-crm@0.1.0 db:push
> tsx scripts/prisma-provider.ts db push

prisma-provider: DATABASE_URL is postgresql — running `prisma db push`
Loaded Prisma config from prisma.config.ts.

Prisma schema loaded from prisma/schema.prisma.
Datasource "db": PostgreSQL database "clarity_d", schema "public" at "spike2-pg:5432"

🚀  Your database is now in sync with your Prisma schema. Done in 60ms
push exit: 0
```

No `npm warn exec`, no registry fetch, no `dotenv` error — and, notably, **no libssl warning**,
which the previous spike saw on every Prisma invocation. Installing `openssl` in the runner does
clear it, as §2 of the spec assumed.

The conflict ordering resolved as intended — the app's own versions survived, and the CLI matches
the baked client:

```
$ docker run --rm clarity-runner-spike-d sh -c 'node -p "require(\"/app/node_modules/react-dom/package.json\").version"; node -p "require(\"/app/node_modules/prisma/package.json\").version"; node -p "require(\"/app/node_modules/@prisma/client/package.json\").version"; ls /app/node_modules/better-sqlite3/build/Release/'
19.2.4
7.8.0
7.8.0
better_sqlite3.node
```

Layer breakdown, 549 MB total:

```
227MB	COPY --chown=node:node /opt/tooling/node_modules ./node_modules
60.7MB	COPY --chown=node:node /app/.next/standalone ./
13.6MB	RUN ... openssl curl ...
729kB	COPY --chown=node:node /app/.next/static ./.next/static
47.4kB	COPY --chown=node:node /app/lib ./lib
13.1kB	COPY --chown=node:node /app/scripts ./scripts
5.45kB	COPY --chown=node:node /app/prisma ./prisma
3.31kB	COPY --chown=node:node /app/public ./public
1.05kB	COPY --chown=node:node /app/package.json ./package.json
374B	COPY --chown=node:node /app/prisma.config.ts ./prisma.config.ts
0B	RUN /bin/sh -c mkdir -p /app/data && chown node:node /app/data
```

247 MB of that is the `node:22-slim` base. The remaining bulk is the Prisma CLI itself:

```
$ docker run --rm clarity-runner-spike-d sh -c 'du -sh /app/node_modules /app/.next; du -sh /app/node_modules/* | sort -rh | head -8'
298M	/app/node_modules
5.7M	/app/.next
94M	/app/node_modules/@prisma
41M	/app/node_modules/prisma
34M	/app/node_modules/effect
34M	/app/node_modules/@img
26M	/app/node_modules/@electric-sql
16M	/app/node_modules/next
9.9M	/app/node_modules/@esbuild
7.2M	/app/node_modules/react-dom
```

### Finding 5 — precompiling the entrypoint to drop `tsx` (spec candidate 3) is not worth it

Measured directly:

```
$ docker run --rm node:22-slim sh -c 'mkdir -p /opt/p && cd /opt/p && npm init -y >/dev/null && npm install --omit=dev prisma@7.8.0 >/dev/null 2>&1 && du -sh node_modules'
230M	node_modules
```

`prisma` alone is 230 MB; `prisma` + `tsx` is 241 MB. **Dropping `tsx` saves 11 MB (4.5 %)** and
costs a build step plus a divergence between the script the repo runs and the script the container
runs. Not worth it. `effect` (34 MB), `@electric-sql` (26 MB) and `@prisma/studio-core` come from
the Prisma CLI's Studio surface and are the real remaining weight — reducing those was not
attempted and remains unexplored.

## Step 4 — does the layering break the runtime?

No. Variant D booted against the same Postgres and served real DB-backed traffic. Session cookie
minted from `SESSION_SECRET` with the repo's own HMAC scheme:

| Request | Status | Body |
|---|---|---|
| `GET /login` | **200** | — |
| `GET /api/leads` (no cookie) | **307** | redirect to login — proxy gate intact |
| `GET /api/leads` | **200** | `[]` |
| `POST /api/leads` | **201** | `{"id":"cmrxct3lt000001rx6s0lg6fo","name":"Variant D Lead",...}` |
| `GET /pipeline` | **200** | — |
| `GET /analytics` | **200** | — |

Container log, clean — no module-resolution warnings from the merged tree:

```
▲ Next.js 16.2.9
- Local:         http://localhost:3000
- Network:       http://0.0.0.0:3000
✓ Ready in 0ms
```

Variant A2 (the `--omit=dev` layering) was exercised the same way and also served `200`/`201`, with
the write verified in the database itself:

```
$ docker exec spike2-pg psql -U postgres -d clarity -c 'select count(*) from "Lead";'
 count
-------
     1
```

So the layering direction is not a *correctness* issue for the full production tree — it is a
correctness issue only for the minimal tree, where the standalone copy must land last.

## Local artifacts (not defects)

Building on the host, Next warned about multiple lockfiles and placed the standalone output at a
nested path, because this worktree sits beneath a parent checkout with its own lockfile:

```
$ find .next/standalone -name server.js
.next/standalone/.claude/worktrees/session-c77cb5/server.js
```

Inside Docker only this tree is copied, and `server.js` lands at `/app/server.js` as expected — all
four images ran `CMD ["node", "server.js"]` with `WORKDIR /app` successfully. No action needed.

Build context is now healthy thanks to Task 3's `.dockerignore` — **1.32 MB**, against the previous
spike's 751.70 MB:

```
#6 transferring context: 1.32MB 0.6s done
```

## Consequences for the plan

1. **R6 passes — no throwaway Postgres in the builder.** Task 6's Dockerfile can hardcode a dummy
   `DATABASE_URL` per provider (`postgres://build:build@127.0.0.1:1/build`, `file:./data/build.db`)
   and pass it to both `db:generate` and `next build`. No credentials in image history, no
   service container in the build.

2. **Task 6 must use the variant-D runner shape, not `npm ci --omit=dev`.** Spec §2's candidate
   list is superseded. The order is load-bearing:
   ```dockerfile
   COPY --from=tooling --chown=node:node /opt/tooling/node_modules ./node_modules
   COPY --from=builder --chown=node:node /app/.next/standalone ./
   ```
   Tooling first, standalone last. Reversing it lets the CLI's transitive `react-dom` and `next`
   overwrite the app's own.

3. **Never `RUN chown -R` in the runner.** Use `COPY --chown=node:node` on every copy and chown
   only the small `/app/data` directory. Measured cost of getting this wrong: **819 MB**. This
   deserves a comment in the Dockerfile, because the line looks harmless.

4. **Pin the tooling stage to the same Prisma version as the app.** Variant C proved the failure
   mode is not theoretical: an unresolvable `npx prisma` silently fetched **7.9.0** against a
   **7.8.0** baked client. The tooling stage should install the exact version from
   `package-lock.json` rather than a floating range, and CI should assert
   `node_modules/prisma/package.json` and `node_modules/@prisma/client/package.json` agree.

5. **`openssl` in the runner is confirmed, not just assumed.** The libssl warning that appeared on
   every Prisma invocation in the previous spike is absent from every variant-D log.

6. **The remaining 298 MB is Prisma's CLI, not the app.** `@prisma` 94 MB + `prisma` 41 MB +
   `effect` 34 MB + `@electric-sql` 26 MB ≈ 195 MB, most of it Studio machinery `db push` never
   touches. If 549 MB is later judged too large, that is where to look — not at the 60.7 MB
   standalone bundle. Running migrations as a separate short-lived container (so the long-lived
   runner ships no CLI at all) is the obvious next lever. Neither was measured here.

7. **Task 2's gate now reads:** R6 Confirmed, R7 Confirmed. R1 and R5 remain refuted and the spec
   has already been revised around them, so Phase B can proceed.
