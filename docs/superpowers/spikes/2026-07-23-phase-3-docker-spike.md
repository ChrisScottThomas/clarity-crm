# Phase 3 Docker spike — R1–R5 findings

Date: 2026-07-23
Task: Phase 3 plan, Task 1 (`docs/superpowers/plans/2026-07-23-phase-3-deploy.md`)
Host: darwin/arm64, Docker 29.2.1 (server arch `arm64/linux`), base image `node:22-slim`.
Artifacts: throwaway `Dockerfile.spike` / `entrypoint.spike.sh` built as `clarity-spike`;
`next.config.ts` temporarily carried `output: "standalone"`. All of it has been torn down —
nothing from the spike is committed except this document.

## Headline

**R1 is REFUTED.** The one-universal-image design does not work. Next's build inlines the
generated Prisma client — schema text and all — into `.next/server/chunks/*.js`, so the
client the running server uses is the one baked at *build* time. Regenerating at container
boot writes a correct client to `app/generated/prisma` that the server never reads.

Everything the plan builds on top of boot-time regeneration (spec P3-1/P3-2, Tasks 6, 7, 8)
needs revision. The recorded fallback — bake the provider at build time — was additionally
probed here and **works**, so there is a proven path forward.

| Risk | Verdict |
|------|---------|
| R1 — standalone resolves a Prisma client regenerated after build | **Refuted** |
| R2 — native modules survive the standalone trace | **Confirmed** |
| R3 — `node:22-slim` uses `better-sqlite3` prebuilt binaries | **Confirmed** |
| R4 — boot regeneration is fast enough for a healthcheck | **Confirmed** (but moot for regeneration; see below) |
| R5 — layered `node_modules` image size is acceptable | **Refuted as specified** — 1.25 GB, and the layering is unnecessary |

---

## R1 — Does Next standalone resolve a Prisma client regenerated *after* build?

**Theory.** The image is built with a client generated for an arbitrary provider; the
entrypoint regenerates it from the real `DATABASE_URL`; the standalone `server.js` picks up
the regenerated client from disk. Provider mismatch becomes structurally impossible.

**Verdict: REFUTED.**

The image was built with no `DATABASE_URL`, so `db:generate` defaulted to SQLite:

```
#11 0.381 prisma-provider: DATABASE_URL is sqlite — running `prisma generate`
#11 1.063 ✔ Generated Prisma Client (7.8.0) to ./app/generated/prisma in 59ms
```

That **same image** was then run against Postgres. The entrypoint regenerated correctly:

```
spike: DATABASE_URL=postgres://postgres:spike@spike-pg:5432/clarity
prisma-provider: DATABASE_URL is postgresql — running `prisma generate`
✔ Generated Prisma Client (7.8.0) to ./app/generated/prisma in 57ms
prisma-provider: DATABASE_URL is postgresql — running `prisma db push`
Datasource "db": PostgreSQL database "clarity", schema "public" at "spike-pg:5432"
🚀  Your database is now in sync with your Prisma schema. Done in 48ms
spike: R4 regeneration+push took 2s
▲ Next.js 16.2.9
✓ Ready in 0ms
```

`GET /login` returned `200` — but `/login` performs no query. The first request that actually
touches Prisma returned `500`, with this in the container log:

```
⨯ Error [PrismaClientInitializationError]: The Driver Adapter `@prisma/adapter-pg`, based on `postgres`, is not compatible with the provider `sqlite` specified in the Prisma schema.
    at <unknown> (.next/server/chunks/_065gtmt._.js:1:89438) {
  clientVersion: '7.8.0',
```

Observed HTTP results against that container:

| Request | Status |
|---|---|
| `GET /login` | `200` |
| `GET /api/leads` | `500` (`Internal Server Error`) |
| `POST /api/leads` | `500` (`Internal Server Error`) |
| `GET /pipeline` | `500` |

Three pieces of evidence pin the cause, all taken from inside the running container:

1. The regenerated on-disk client **was** correct — `grep` found `postgresql` in
   `/app/app/generated/prisma/internal/class.ts`.
2. The build output has the old schema inlined. Grepping the chunk named in the stack trace:
   ```
   # grep -o 'provider.\{0,30\}sqlite' /app/.next/server/chunks/_065gtmt._.js | head -3
   provider = "sqlite
   provider="sqlite
   provider="sqlite
   ```
3. `.next/standalone` contains **no** copy of the generated client at all — the only
   `*.prisma` file outside `node_modules` is the schema:
   ```
   # find /app -path /app/node_modules -prune -o -name "*.prisma" -print
   /app/prisma/schema.prisma
   ```
   and `ls -la /app/app/generated/prisma` in a *fresh* container (before the entrypoint runs)
   gives `No such file or directory`.

**Second, independent blocker.** Even if the client were not bundled, it could not be loaded
from disk as-is. The Prisma 7 `prisma-client` generator emits **TypeScript**, not JavaScript —
all 18 generated files in `/app/app/generated/prisma` have the `.ts` extension. `node server.js`
cannot require them. Boot-time regeneration would need a TypeScript compile step on top of
being unbundled.

**Related finding — `next build` needs a matching `DATABASE_URL` too.** While probing the
fallback, a build that generated a Postgres client but left `DATABASE_URL` unset for
`next build` failed outright:

```
#12 4.500   Collecting page data using 11 workers ...
#12 4.739 Error [PrismaClientInitializationError]: The Driver Adapter `@prisma/adapter-better-sqlite3`, based on `sqlite`, is not compatible with the provider `postgres` specified in the Prisma schema.
#12 4.920 > Build error occurred
#12 4.923 Error: Failed to collect page data for /api/leads/[id]/relationship
```

Next instantiates `PrismaClient` during page-data collection, so `DATABASE_URL` must be set
during `next build` and must agree with the generated provider.

### Fallback probe — provider baked at build time: WORKS

A second throwaway image (`clarity-spike-pg`) took a `BUILD_DATABASE_URL` build-arg and applied
it to *both* `db:generate` and `next build`; the entrypoint dropped the regeneration step and
ran only `db push`. Run against the same Postgres container:

| Request | Status |
|---|---|
| `GET /login` | `200` |
| `GET /api/leads` | `200`, body `[]` |
| `POST /api/leads` | `201`, body `{"id":"cmrx9o3rd000001le9mx8vknn","name":"Spike Lead PG Baked",...}` |
| `GET /pipeline` | `200` |

Container log, clean:

```
spike2: DATABASE_URL=postgres://postgres:spike@spike-pg:5432/clarity
Datasource "db": PostgreSQL database "clarity", schema "public" at "spike-pg:5432"
The database is already in sync with the Prisma schema.
spike2: db push took 1s
▲ Next.js 16.2.9
✓ Ready in 0ms
```

The cost is that provider is an image-build input: one image per provider (or a single
multi-target build producing two tags), not one image for both.

---

## R2 — Do native modules survive the standalone trace?

**Theory.** A SQLite query and a Postgres query both succeed from the standalone server.

**Verdict: CONFIRMED.** Both succeeded — SQLite on the boot-regeneration image (whose baked
provider happened to be SQLite, so it worked by accident of matching), Postgres on the
build-time-baked image.

SQLite (`DATABASE_URL=file:./data/clarity.db`):

```
spike: DATABASE_URL=file:./data/clarity.db
prisma-provider: DATABASE_URL is sqlite — running `prisma db push`
SQLite database clarity.db created at file:./data/clarity.db
🚀  Your database is now in sync with your Prisma schema. Done in 24ms
```

| Request | Status |
|---|---|
| `GET /login` | `200` |
| `GET /api/leads` | `200`, body `[]` |
| `POST /api/leads` | `201`, body `{"id":"cmrx9k68b000001pi4gcivn29","name":"Spike Lead",...}` |
| `GET /pipeline` | `200` |

The `201` is a real write through `better-sqlite3`'s native addon, and the Postgres `201` above
is a real write through `pg`. Both native paths work.

**Important sub-finding: the layered full `node_modules` is not what made this work.** The
standalone trace already pulls the native artefacts in. Inspecting the builder stage's
`.next/standalone/node_modules`:

```
# ls /app/.next/standalone/node_modules/better-sqlite3/build/Release/
better_sqlite3.node
# ls -d /app/.next/standalone/node_modules/pg /app/.next/standalone/node_modules/@prisma/*
/app/.next/standalone/node_modules/@prisma/client
/app/.next/standalone/node_modules/@prisma/client-runtime-utils
/app/.next/standalone/node_modules/pg
```

The runner's `better_sqlite3.node` is a Linux ELF binary (`od -c` on the first four bytes gives
`177 E L F`), as expected for a binary that came from the `deps` stage's `npm ci`.

Caveat: the standalone trace does **not** include the `prisma` CLI or `tsx`, both of which the
entrypoint needs for `db push`. That is the real reason to ship something beyond the traced
tree — not native modules.

---

## R3 — Does `node:22-slim` use `better-sqlite3` prebuilt binaries?

**Theory.** No compile-from-source in the build log.

**Verdict: CONFIRMED.**

```
$ grep -iE "node-gyp|prebuild-install|gyp info|make: Entering" spike-build.log
#8 1.002 npm warn deprecated prebuild-install@7.1.3: No longer maintained. Please contact the author of the relevant native addon; alternatives are available.
```

The single match is a deprecation *warning* naming the package, not a compile. There is no
`node-gyp` invocation, no `gyp info`, and no `make: Entering` anywhere in the log. The install
itself:

```
#8 [deps 4/4] RUN npm ci
#8 11.60 added 543 packages, and audited 544 packages in 11s
#8 DONE 12.0s
```

543 packages including `better-sqlite3` in 12 s — consistent with a prebuilt download, not a
source build. Debian slim (glibc) is the right base; Alpine/musl would force the compile.

**Unrelated warning worth carrying forward.** Every Prisma CLI invocation, at build and at
boot, emits:

```
prisma:warn Prisma failed to detect the libssl/openssl version to use, and may not work as expected. Defaulting to "openssl-1.1.x".
Please manually install OpenSSL via `apt-get update -y && apt-get install -y openssl` ...
```

It did not break anything (all queries succeeded), but the production Dockerfile should install
`openssl` to silence it and avoid depending on the fallback.

---

## R4 — Is boot regeneration fast enough for a healthcheck?

**Theory.** Measured seconds from container start to first `200`.

**Verdict: CONFIRMED** — the timings are comfortable. Note the R1 refutation makes the
*regeneration* leg pointless; the `db push` leg remains.

Measured from the moment `docker run` was issued, polling every 200 ms. `/api/leads` is a real
Prisma query behind the auth gate (a session cookie was minted from `SESSION_SECRET`).

| Configuration | Entrypoint self-report | First `200` on `/login` | First `200` on `/api/leads` |
|---|---|---|---|
| SQLite, boot regenerate + `db push` | `spike: R4 regeneration+push took 2s` | 2.3 s | 2.4 s |
| Postgres, boot regenerate + `db push` | `spike: R4 regeneration+push took 1s` | 2.4 s | **never — HTTP 500** (R1) |
| Postgres, provider baked at build, `db push` only | `spike2: db push took 1s` | 1.4 s | 1.5 s |

Next itself reported `✓ Ready in 0ms` in every run; essentially all of the boot time is the
Prisma CLI. A healthcheck `start_period` of 15–30 s is generous against measured worst case
of 2.4 s, and leaves room for a cold Postgres and slower CI hardware.

---

## R5 — Is the layered `node_modules` image size acceptable?

**Theory.** Measured MB from `docker images`.

**Verdict: REFUTED as specified.** The image is **1.25 GB**, and the layer responsible is one
the spike also showed to be unnecessary.

```
$ docker images clarity-spike --format '{{.Size}}'
1.25GB
```

Layer breakdown (`docker history`):

```
927MB   COPY /app/node_modules ./node_modules # buildkit
76.8MB  COPY /app/.next/standalone ./ # buildkit
729kB   COPY /app/.next/static ./.next/static # buildkit
47.4kB  COPY /app/lib ./lib # buildkit
13.1kB  COPY /app/scripts ./scripts # buildkit
5.45kB  COPY /app/prisma ./prisma # buildkit
3.31kB  COPY /app/public ./public # buildkit
1.05kB  COPY /app/package.json ./package.json # buildkit
```

On-disk sizes inside the container and in the builder stage:

```
999M    /app/node_modules            (layered full tree, includes devDependencies)
 80M    /app/.next/standalone        (75M node_modules + 5.0M .next)
247MB   node:22-slim base image
```

Largest contributors in the layered tree: `@next` 239M, `next` 172M, `@prisma` 167M, `@img`
49M, `prisma` 41M, `@rolldown` 35M, `effect` 34M, `@electric-sql` 26M, `typescript` 23M,
`better-sqlite3` 12M.

So the full tree costs ~927 MB of layer to deliver something the 75 MB traced tree already
provides for the runtime, plus the `prisma` CLI and `tsx` the entrypoint needs. Note `npm ci`
in the `deps` stage installs devDependencies (that is *required* — `tsx` is a devDependency),
which is why `typescript`, `@rolldown` and the vitest tree are all shipped.

**Also observed: there is no `.dockerignore`.** The build context was

```
#6 transferring context: 751.70MB 6.9s done
```

against a host `node_modules` of 811 M. The host tree is macOS-native — `file
node_modules/better-sqlite3/build/Release/better_sqlite3.node` reports `Mach-O 64-bit bundle
arm64` — and `COPY . .` layers it over the Linux tree in the builder stage. The build survived
(nothing in the build path loads that addon) and the runner is unaffected because it copies
`node_modules` from `deps`, not `builder`. This particular breakage was **not** directly
observed, but the context transfer and the Mach-O binary were, and the ordering is a latent
trap. Task 6's `.dockerignore` should land before or with Task 3.

---

## Consequences for the plan

1. **Spec P3-1/P3-2 must be rewritten.** "One universal image, provider decided at boot" is
   dead. Replace with: provider is a build input. Suggested shape — a `DATABASE_URL` (or
   `DB_PROVIDER`) build-arg applied to *both* `db:generate` and `next build`, producing e.g.
   `clarity-crm:<version>-sqlite` and `clarity-crm:<version>-postgres`. Proven working above.

2. **Task 7 (entrypoint) shrinks.** Drop `prisma-provider.ts generate` from the boot sequence —
   it costs ~1 s and has no effect. Keep `db push`. The entrypoint must also **fail loudly** if
   the runtime `DATABASE_URL`'s provider disagrees with the image's baked provider, instead of
   letting the first query 500 at request time. Task 5's boot-time `DATABASE_URL` validation
   should be extended to compare against the baked provider and refuse to start.

3. **Task 6 (Dockerfile) changes on three points.**
   - Add the provider build-arg and pass `DATABASE_URL` to `npx next build` as well as
     `db:generate` — omitting it is a hard build failure (verbatim error in R1 above).
   - Reconsider the layered full `node_modules`. Its stated justification (R2 — native modules)
     is disproven: the traced tree already contains `better_sqlite3.node`, `pg` and
     `@prisma/client`. The remaining justification is the `prisma` CLI and `tsx` for boot
     migrations, which is a much smaller problem than 927 MB — options include copying only
     `prisma` + `tsx` + their deps, running migrations as a separate job/container, or
     compiling the entrypoint script to plain JS so `tsx` is not needed at runtime. The plan's
     Task 3 note about moving `tsx` to dependencies is still relevant either way.
   - Install `openssl` in the runner to clear the persistent Prisma libssl warning.

4. **`.dockerignore` (Task 6) should move earlier.** 751.70 MB of context, most of it a
   macOS-native `node_modules` that `COPY . .` layers over the Linux one. It did not break this
   build; it is a trap waiting for the first build step that touches a native addon.

5. **Task 8 (compose healthcheck).** Use `start_period: 30s` — measured worst case was 2.4 s
   to a real DB-backed `200`, so 30 s is comfortably generous. Point the healthcheck at a
   DB-backed endpoint (Task 4's `/api/health`), **not** at `/login`: `/login` returned `200`
   throughout the failing Postgres run and would have reported a completely broken container
   as healthy.

6. **Task 2's gate cannot pass as written** ("do not start Task 3 until every risk row reads
   Confirmed"). R1 is refuted and R5 is refuted as specified. Task 2 must revise the spec
   around the build-time-bake design before Phase B begins.
