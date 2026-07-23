# Phase 3 — Deploy & Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A clean fork of this repo yields a running, persistent Clarity CRM instance from a single `docker compose up`, on either SQLite or Postgres, proven by CI.

**Architecture:** One container image *per provider*, selected by a `DB_PROVIDER` build arg. `next build` produces a standalone server with the Prisma client baked in (the spike proved this is unavoidable). The entrypoint verifies the runtime `DATABASE_URL` matches the baked provider — refusing to boot on a mismatch — then applies the schema with `db push` and execs the server. Two self-contained compose files (SQLite default, Postgres variant), each declaring its own build arg, and a new `/api/health` route that CI polls to prove the container really booted.

> **Revised 2026-07-23.** The original plan assumed one universal image regenerating the client at boot. [The spike refuted it](../spikes/2026-07-23-phase-3-docker-spike.md): Next inlines the generated client into `.next/server/chunks` at build time, and Prisma 7 emits TypeScript. Tasks 1, 2, 6, 7, 8, 9 and 11 were rewritten against the [revised spec](../specs/2026-07-23-phase-3-deploy-design.md).

**Tech Stack:** Docker (multi-stage, `node:22-slim`), Docker Compose, Next.js 16 standalone output, Prisma 7 (`better-sqlite3` / `pg` driver adapters), Vitest, GitHub Actions.

**Spec:** [`../specs/2026-07-23-phase-3-deploy-design.md`](../specs/2026-07-23-phase-3-deploy-design.md)

---

## Ground rules for this plan

**Phase A is a spike gate, and it has already fired once.** Tasks 1–2 are
complete: R1 and R5 were refuted, the spec was revised, and this plan rewritten.
**Task 2b is a second gate** covering the two risks the revision introduced
(R6, R7). Nothing in Phase B past Task 5 may be written until R6 and R7 read
Confirmed. If a spike refutes a theory, stop and revise the spec — do not patch
around it.

**Spike code is throwaway.** It lives in the scratchpad, never in the repo. Only
the *findings* are committed.

**Measured numbers are real numbers.** R4 settled the healthcheck `start_period`
at **30s** (measured worst case 2.4 s to a DB-backed 200). R7 will settle the
image size that goes into the deploy docs. Never substitute a plausible-looking
figure for one you can measure.

**Task 3 also lands `.dockerignore`.** Spike A measured a 751.70 MB build context
carrying a macOS-native `node_modules` that `COPY . .` layers over the Linux one.
It did not break that build, but it is a trap for the first build step that
touches a native addon — so it lands before the Dockerfile, not with it.

## File structure

| File | Responsibility | Task |
|------|---------------|------|
| `docs/superpowers/spikes/2026-07-23-phase-3-docker-spike.md` | Spike A findings (R1–R5) — **done** | 1 |
| `docs/superpowers/spikes/2026-07-23-phase-3-runner-spike.md` | Spike B findings (R6, R7) | 2b |
| `docs/superpowers/specs/2026-07-23-phase-3-deploy-design.md` | Spec — risk table updated with outcomes | 2, 2b, 13 |
| `package.json` | `tsx` moves to `dependencies` (runtime dep of the container) | 3 |
| `next.config.ts` | `output: 'standalone'` + `serverExternalPackages` | 3 |
| `.dockerignore` | Build context hygiene — lands early, per spike finding 4 | 3 |
| `app/api/health/route.ts` | Liveness + DB round-trip; returns `{"status":"ok"}` only | 4 |
| `proxy.ts` | Allowlist `/api/health` past the auth gate | 4 |
| `lib/env.ts` | `assertDatabaseUrl()` — boot-time `DATABASE_URL` scheme check | 5 |
| `instrumentation.ts` | Wire the new check into boot | 5 |
| `Dockerfile` | Three-stage build; `DB_PROVIDER` build arg; slimmed runner + `openssl` | 6 |
| `docker-entrypoint.sh` | Verify provider match → push → exec server | 7 |
| `docker-compose.yml` | SQLite deployment (named volume) | 8 |
| `docker-compose.postgres.yml` | Postgres deployment (app + `postgres:16`) | 8 |
| `.github/workflows/ci.yml` | New `Docker · boot smoke` job | 9 |
| `docs/deploying.md` | Diataxis how-to: quickstart, env table, provider switch, backup, Railway, TLS caveat | 11 |
| `README.md` | Replace "Deploying (future — not done yet)" with a real summary + link | 11 |

Tests live in `tests/*.test.ts` (flat, matching the existing suite).

---

# Phase A — Spike gate

### Task 1: Prove R1–R5 with a throwaway container — ✅ COMPLETE

Executed 2026-07-23. Findings: [`../spikes/2026-07-23-phase-3-docker-spike.md`](../spikes/2026-07-23-phase-3-docker-spike.md) (commit `a6a0f4f`).

- [x] R1 **Refuted** — Next inlines the generated client (schema text included) into `.next/server/chunks/*.js`; Prisma 7's generator emits TypeScript. A SQLite-built image against Postgres served `/login` 200 and 500'd every query.
- [x] R2 **Confirmed** — writes succeeded through both drivers; the traced standalone tree already carries `better_sqlite3.node`, `pg`, `@prisma/client`.
- [x] R3 **Confirmed** — no `node-gyp`/`gyp info`/`make: Entering` in the build log.
- [x] R4 **Confirmed** — 1.5–2.4 s to a DB-backed 200.
- [x] R5 **Refuted as specified** — 1.25 GB image, 927 MB of it the unnecessary layered `node_modules`.

### Task 2: Update the spec with spike findings — ✅ COMPLETE

Executed 2026-07-23 (commit `8c24390`). P3-1 inverted to a build arg, P3-6 added
(fail loudly on mismatch), runner slimmed, R6/R7 opened. This plan was rewritten
against the revised spec.

---

### Task 2b: Prove R6 and R7 — GATE

**Files:**
- Create: `docs/superpowers/spikes/2026-07-23-phase-3-runner-spike.md`
- Scratch (never committed): `$SCRATCH/Dockerfile.spike2`

The revision introduced two unproven theories. Both must be settled before the
Dockerfile is written.

| # | Theory | Evidence that settles it |
|---|--------|--------------------------|
| R6 | `next build` succeeds with an **unreachable** dummy Postgres URL | A completed build using a URL pointing at nothing |
| R7 | A slimmed runner can still run `db push`, at an acceptable size | `db push` succeeding in the slimmed image, plus a measured size |

R6 matters because a *reachable* URL means baking real credentials into image
history. Spike A used a reachable one, so this is genuinely open.

- [ ] **Step 1: Settle R6 — build with a dummy unreachable Postgres URL**

Temporarily add `output: 'standalone'` to `next.config.ts` (uncommitted; revert after).

```bash
cd /Users/chris.scott-thomas/github/clarity-crm/.claude/worktrees/session-c77cb5
DATABASE_URL="postgres://build:build@127.0.0.1:1/build" npm run db:generate
DATABASE_URL="postgres://build:build@127.0.0.1:1/build" npx next build 2>&1 | tee "$SCRATCH/r6-build.log"
echo "exit: $?"
```

Port 1 is guaranteed closed. Expected if R6 holds: build completes. If it fails,
capture the verbatim error — the fallback is standing up a throwaway Postgres in
the builder stage, which is a real complication and must be recorded as such.

- [ ] **Step 2: Measure the prod-only dependency tree (R7, candidate 1)**

```bash
docker run --rm -v "$PWD":/src -w /tmp node:22-slim sh -c \
  "cp /src/package.json /src/package-lock.json . && npm ci --omit=dev >/dev/null 2>&1 && du -sh node_modules && ls node_modules/.bin | grep -E '^(prisma|tsx)$'"
```

Records the prod-only tree size and confirms whether `prisma` and `tsx` binaries
are present. Note: this only works once Task 3 has moved `tsx` into
`dependencies` — if `tsx` is missing here, that is expected and confirms the
dependency move is load-bearing rather than cosmetic.

- [ ] **Step 3: Settle R7 — build a slimmed runner and run `db push` in it**

Write `$SCRATCH/Dockerfile.spike2` using the winning candidate from Step 2:
standalone bundle + the prod-only tooling, `openssl` installed, non-root user.
Build it, start a `postgres:16` alongside, and run `db push` inside the container
against the real database.

```bash
docker images clarity-runner-spike --format '{{.Size}}'
```

Expected: `db push` succeeds and the size is far below Spike A's 1.25 GB. Record
the actual number — it goes into the deploy docs.

- [ ] **Step 4: Tear down and revert**

```bash
docker rm -f $(docker ps -aq --filter "name=spike2") 2>/dev/null || true
docker rmi clarity-runner-spike 2>/dev/null || true
git checkout next.config.ts
```

- [ ] **Step 5: Write the findings and update the spec**

Create `docs/superpowers/spikes/2026-07-23-phase-3-runner-spike.md` with a
section per risk: theory, **verbatim observed output**, verdict. Then set R6 and
R7's Status in the spec's risk table, and fix §2's "Runner contents" to name the
mechanism that actually won rather than listing three candidates.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/spikes/2026-07-23-phase-3-runner-spike.md docs/superpowers/specs/2026-07-23-phase-3-deploy-design.md
git commit -m "docs: Phase 3 runner spike findings (R6, R7)"
git status --porcelain
```

Expected: clean tree, no scratch files, `next.config.ts` unmodified.

**GATE: Task 6 may not start until R6 and R7 read Confirmed.** Tasks 3–5 are
independent of both and may proceed regardless.

# Phase B — Production artifacts

### Task 3: Standalone output and the `tsx` dependency move

**Files:**
- Modify: `next.config.ts`
- Modify: `package.json`
- Test: `tests/deploy-config.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/deploy-config.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import nextConfig from '../next.config'

describe('next.config — deployability', () => {
  it('emits a standalone server bundle', () => {
    expect(nextConfig.output).toBe('standalone')
  })

  it('keeps native DB modules out of the bundler', () => {
    expect(nextConfig.serverExternalPackages).toContain('better-sqlite3')
    expect(nextConfig.serverExternalPackages).toContain('@prisma/adapter-pg')
  })
})

describe('package.json — container runtime deps', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))

  // The container entrypoint runs db:push, which routes through
  // scripts/prisma-provider.ts — so tsx is a runtime dependency, not a dev one.
  // See docs/superpowers/specs/2026-07-23-phase-3-deploy-design.md §2.
  it('ships tsx as a production dependency', () => {
    expect(pkg.dependencies).toHaveProperty('tsx')
    expect(pkg.devDependencies ?? {}).not.toHaveProperty('tsx')
  })
})

describe('.dockerignore', () => {
  const ignore = readFileSync('.dockerignore', 'utf8')

  // Spike A measured a 751.70 MB context carrying a macOS-native node_modules
  // that `COPY . .` layers over the Linux one built in the deps stage.
  it('excludes the host node_modules and build output', () => {
    for (const entry of ['node_modules', '.next', 'data']) {
      expect(ignore).toContain(entry)
    }
  })

  it('keeps secrets out of the build context', () => {
    expect(ignore).toContain('.env')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/deploy-config.test.ts`
Expected: FAIL — `output` is `undefined` and `tsx` is still in `devDependencies`.

- [ ] **Step 3: Update `next.config.ts`**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle for the container image.
  // See docs/superpowers/specs/2026-07-23-phase-3-deploy-design.md §1.
  output: 'standalone',
  // Native/driver modules must be required at runtime, not bundled.
  serverExternalPackages: [
    'better-sqlite3',
    '@prisma/adapter-better-sqlite3',
    '@prisma/adapter-pg',
  ],
};

export default nextConfig;
```

- [ ] **Step 4: Move `tsx` to dependencies**

Edit `package.json` by hand: delete the `"tsx": "^4.22.4"` line from
`devDependencies`, and add it to `dependencies` in alphabetical position (between
`react-dom` and any later key). Then refresh the lockfile:

```bash
npm install
```

- [ ] **Step 5: Write `.dockerignore`**

```
node_modules
.next
data
.git
.env
.env.local
.claude
docs
tests
*.md
!README.md
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/deploy-config.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 7: Verify the build still works**

```bash
npm run db:generate && npx next build
```

Expected: build succeeds and reports standalone output. Confirm the server file exists:

```bash
test -f .next/standalone/server.js && echo "standalone server present"
```

- [ ] **Step 8: Commit**

```bash
git add next.config.ts package.json package-lock.json .dockerignore tests/deploy-config.test.ts
git commit -m "feat(deploy): standalone output, .dockerignore, tsx as a runtime dependency"
```

---

### Task 4: `/api/health` route and auth-gate allowlist

**Files:**
- Create: `app/api/health/route.ts`
- Modify: `proxy.ts`
- Test: `tests/health-api.test.ts`, `tests/proxy.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/health-api.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const queryRaw = vi.fn()

vi.mock('../lib/db', () => ({
  prisma: {
    get $queryRaw() {
      return queryRaw
    },
  },
}))

beforeEach(() => {
  queryRaw.mockReset()
})

describe('health API', () => {
  it('exports a GET handler', async () => {
    const mod = await import('../app/api/health/route')
    expect(typeof mod.GET).toBe('function')
  })

  it('returns 200 and status ok when the database answers', async () => {
    queryRaw.mockResolvedValue([{ 1: 1 }])
    const { GET } = await import('../app/api/health/route')
    const res = await GET()
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ status: 'ok' })
  })

  it('returns 503 when the database is unreachable', async () => {
    queryRaw.mockRejectedValue(new Error('connection refused'))
    const { GET } = await import('../app/api/health/route')
    const res = await GET()
    expect(res.status).toBe(503)
  })

  // The route sits outside the auth gate, so it must not leak deployment
  // detail — no provider name, no connection string, no error text.
  it('leaks nothing about the deployment on failure', async () => {
    queryRaw.mockRejectedValue(new Error('postgres://user:hunter2@db:5432/clarity refused'))
    const { GET } = await import('../app/api/health/route')
    const res = await GET()
    const body = JSON.stringify(await res.json())
    expect(body).not.toContain('hunter2')
    expect(body).not.toContain('postgres')
  })
})
```

Append to `tests/proxy.test.ts`, inside the existing `describe('proxy — auth gate', ...)` block:

```ts
  it('lets the health endpoint through without a session cookie', () => {
    const res = get('/api/health')
    expect(res.headers.get('location')).toBeNull()
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/health-api.test.ts tests/proxy.test.ts`
Expected: FAIL — health route module not found; proxy redirects `/api/health` to `/login`.

- [ ] **Step 3: Create the health route**

Create `app/api/health/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/db'

// Liveness for compose healthchecks, Railway, and the CI boot smoke. A 200 here
// means app *and* database are up — hence the round-trip rather than a bare OK.
// This route sits outside the auth gate (see proxy.ts), so the body is
// deliberately opaque: no provider, no connection detail, no error text.
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ status: 'ok' })
  } catch {
    return NextResponse.json({ status: 'error' }, { status: 503 })
  }
}
```

- [ ] **Step 4: Allowlist it in `proxy.ts`**

In the public-path condition, add the health check alongside the webhook:

```ts
    pathname.startsWith('/favicon') ||
    // Healthchecks (compose, Railway, CI) must not be redirected to /login —
    // an auth redirect would make every probe report a false positive.
    pathname === '/api/health' ||
    // Public webhooks self-authenticate via provider signature, not the session cookie.
    pathname.startsWith('/api/integrations/calcom/webhook')
```

Use `===`, not `startsWith` — an exact match keeps the unauthenticated surface to
precisely one path.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/health-api.test.ts tests/proxy.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/api/health/route.ts proxy.ts tests/health-api.test.ts tests/proxy.test.ts
git commit -m "feat(deploy): add /api/health with a DB round-trip, outside the auth gate"
```

---

### Task 5: Boot-time `DATABASE_URL` validation

**Files:**
- Modify: `lib/env.ts`
- Modify: `instrumentation.ts`
- Test: `tests/env.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/env.test.ts`:

```ts
import { assertDatabaseUrl } from '../lib/env'

describe('env — DATABASE_URL validation', () => {
  it('accepts a sqlite file URL', () => {
    vi.stubEnv('DATABASE_URL', 'file:./data/clarity.db')
    expect(() => assertDatabaseUrl()).not.toThrow()
  })

  it('accepts a postgres URL', () => {
    vi.stubEnv('DATABASE_URL', 'postgres://u:p@host:5432/clarity')
    expect(() => assertDatabaseUrl()).not.toThrow()
  })

  it('accepts an unset DATABASE_URL (the sqlite dev default applies)', () => {
    vi.stubEnv('DATABASE_URL', '')
    expect(() => assertDatabaseUrl()).not.toThrow()
  })

  it('throws on an unsupported scheme, naming what is accepted', () => {
    vi.stubEnv('DATABASE_URL', 'mysql://u:p@host:3306/clarity')
    expect(() => assertDatabaseUrl()).toThrow(/file:/)
    expect(() => assertDatabaseUrl()).toThrow(/postgres/)
  })
})
```

Note: the existing `import` line at the top of the file already pulls from
`../lib/env` — merge `assertDatabaseUrl` into it rather than adding a second import.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/env.test.ts`
Expected: FAIL — `assertDatabaseUrl` is not exported.

- [ ] **Step 3: Implement it in `lib/env.ts`**

Add the import at the top of the file:

```ts
import { providerForUrl, DEFAULT_DATABASE_URL } from './db-adapter'
```

and the function at the end:

```ts
/**
 * Boot-time guard: a malformed DATABASE_URL should die here, naming the
 * accepted schemes, rather than surfacing later as an opaque Prisma error.
 * Unset is valid — lib/db-adapter applies the sqlite dev default.
 */
export function assertDatabaseUrl(): void {
  const url = process.env.DATABASE_URL
  providerForUrl(url && url.length > 0 ? url : DEFAULT_DATABASE_URL)
}
```

`providerForUrl` already throws with a message naming `file:` and
`postgres://`/`postgresql://`, so there is no second error string to keep in sync.

- [ ] **Step 4: Wire it into boot**

Update `instrumentation.ts`:

```ts
import { assertProductionSecrets, assertDatabaseUrl } from './lib/env'
import { validateConfig } from './lib/config-validation'
import { clarityConfig } from './clarity.config'

// Runs once when a server instance starts, before it accepts requests.
// Fail closed: refuse to boot in production without the required auth secrets,
// refuse to boot in any environment with a malformed clarity.config.ts, and
// refuse to boot anywhere with a DATABASE_URL we cannot map to a provider.
export function register() {
  assertProductionSecrets()
  assertDatabaseUrl()
  validateConfig(clarityConfig)
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/env.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/env.ts instrumentation.ts tests/env.test.ts
git commit -m "feat(deploy): fail boot on an unmappable DATABASE_URL"
```

---

### Task 6: Dockerfile

**Files:**
- Create: `Dockerfile`
- Test: `tests/dockerfile.test.ts`

**Depends on Task 2b.** The runner's tooling layer below uses candidate 1 (a
production-only install). **If Task 2b's findings selected a different mechanism,
the findings doc is authoritative — use what actually worked.**

- [ ] **Step 1: Write the failing test**

Create `tests/dockerfile.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const dockerfile = readFileSync('Dockerfile', 'utf8')

describe('Dockerfile', () => {
  it('builds on node:22-slim, not Alpine (better-sqlite3 prebuilds need glibc)', () => {
    expect(dockerfile).toContain('node:22-slim')
    expect(dockerfile).not.toContain('alpine')
  })

  it('takes the provider as a build arg, defaulting to sqlite', () => {
    expect(dockerfile).toMatch(/ARG DB_PROVIDER=sqlite/)
  })

  // The entrypoint compares this against the runtime DATABASE_URL, so a
  // mismatch fails at boot rather than as a 500 on the first query (P3-6).
  it('records the baked provider in the image environment', () => {
    expect(dockerfile).toMatch(/ENV CLARITY_DB_PROVIDER/)
  })

  // next build instantiates PrismaClient during page-data collection, so
  // DATABASE_URL must be present for BOTH commands — spike R1/R6.
  it('supplies DATABASE_URL to both db:generate and next build', () => {
    const generate = dockerfile.match(/^.*db:generate.*$/m)?.[0] ?? ''
    const build = dockerfile.match(/^.*next build.*$/m)?.[0] ?? ''
    expect(generate).toContain('DATABASE_URL')
    expect(build).toContain('DATABASE_URL')
  })

  // A real URL at build time would bake credentials into image history.
  it('uses an unreachable dummy URL at build time, never a real one', () => {
    expect(dockerfile).toContain('127.0.0.1:1')
  })

  it('installs openssl so Prisma can detect libssl', () => {
    expect(dockerfile).toContain('openssl')
  })

  it('runs as a non-root user', () => {
    expect(dockerfile).toMatch(/^USER\s+(?!root)/m)
  })

  it('delegates startup to the entrypoint rather than running the server directly', () => {
    expect(dockerfile).toContain('docker-entrypoint.sh')
    expect(dockerfile).toMatch(/ENTRYPOINT/)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/dockerfile.test.ts`
Expected: FAIL — `ENOENT` on `Dockerfile`.

- [ ] **Step 3: Write the `Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1

# The provider is a BUILD INPUT, not a runtime choice. Next inlines the
# generated Prisma client — schema text included — into .next/server/chunks at
# build time, so one image serves exactly one provider. Regenerating at boot was
# tried and proven useless:
# docs/superpowers/spikes/2026-07-23-phase-3-docker-spike.md (R1)
ARG DB_PROVIDER=sqlite

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Production-only tree: supplies the prisma CLI and tsx that the entrypoint's
# `db push` needs. The traced standalone bundle already carries the driver
# adapters and native modules (spike R2), so this layer exists only for the CLI.
FROM node:22-slim AS tooling
WORKDIR /tools
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-slim AS builder
ARG DB_PROVIDER
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# A dummy URL of the correct scheme. next build instantiates PrismaClient during
# page-data collection, so DATABASE_URL must be set — but a real one would bake
# credentials into image history. Port 1 is closed by definition.
RUN case "$DB_PROVIDER" in \
      sqlite)   echo 'file:./data/build.db' > /tmp/build-url ;; \
      postgres) echo 'postgres://build:build@127.0.0.1:1/build' > /tmp/build-url ;; \
      *) echo "FATAL: DB_PROVIDER must be sqlite or postgres, got '$DB_PROVIDER'" >&2; exit 1 ;; \
    esac
RUN DATABASE_URL="$(cat /tmp/build-url)" npm run db:generate
RUN DATABASE_URL="$(cat /tmp/build-url)" npx next build

FROM node:22-slim AS runner
ARG DB_PROVIDER
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Read by docker-entrypoint.sh to reject a mismatched DATABASE_URL at boot.
ENV CLARITY_DB_PROVIDER=${DB_PROVIDER}

# Without this every Prisma invocation warns that it cannot detect libssl.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Layered second so the CLI-bearing production tree wins over the traced subset.
COPY --from=tooling /tools/node_modules ./node_modules

COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/package.json ./package.json
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# db push writes a SQLite file into data/; the runtime user must own it.
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
 && mkdir -p /app/data \
 && chown -R node:node /app

USER node
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/dockerfile.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Verify both variants build**

```bash
docker build --build-arg DB_PROVIDER=sqlite -t clarity-crm:sqlite .
docker build --build-arg DB_PROVIDER=postgres -t clarity-crm:postgres .
docker images --format '{{.Repository}}:{{.Tag}} {{.Size}}' | grep clarity-crm
```

Expected: both build; sizes far below Spike A's 1.25 GB. Record the actual figures
— they go into the deploy docs in Task 11.

Also confirm the invalid case is rejected:

```bash
docker build --build-arg DB_PROVIDER=mysql -t clarity-crm:bad . 2>&1 | tail -3
```

Expected: build fails naming the accepted values.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile tests/dockerfile.test.ts
git commit -m "feat(deploy): provider-parameterised multi-stage Dockerfile"
```

---

### Task 7: Container entrypoint

**Files:**
- Create: `docker-entrypoint.sh`
- Test: `tests/docker-entrypoint.test.ts`

This is where P3-6 lives. Spike A observed the failure it prevents: a SQLite
image against Postgres served `/login` with a `200` and returned 500 on every
query. Silent wrongness is the thing to design out.

- [ ] **Step 1: Write the failing test**

Create `tests/docker-entrypoint.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync, statSync } from 'fs'

const script = readFileSync('docker-entrypoint.sh', 'utf8')

describe('docker-entrypoint.sh', () => {
  it('aborts on the first failing step', () => {
    expect(script).toMatch(/set -e/)
  })

  // P3-6: the client is compiled into the bundle, so a mismatch can only be
  // fixed by rebuilding. Catch it at boot, not at the first query.
  it('compares the runtime URL against the baked provider', () => {
    expect(script).toContain('CLARITY_DB_PROVIDER')
  })

  it('tells the operator to rebuild when they mismatch', () => {
    expect(script).toMatch(/DB_PROVIDER=/)
  })

  it('applies the schema before serving', () => {
    const push = script.indexOf('db:push')
    const serve = script.indexOf('server.js')
    expect(push).toBeGreaterThan(-1)
    expect(serve).toBeGreaterThan(push)
  })

  // Spike A proved boot regeneration is useless: Next inlines the client.
  it('does not waste a second regenerating a client that is already baked in', () => {
    expect(script).not.toContain('db:generate')
  })

  it('execs the server so it receives signals as PID 1', () => {
    expect(script).toMatch(/exec node server\.js/)
  })

  // Phase 2 stance: a data-loss prompt is a stop-and-think signal, never
  // something a container scripts its way past.
  it('never passes --accept-data-loss', () => {
    expect(script).not.toContain('accept-data-loss')
  })

  it('is executable', () => {
    expect(statSync('docker-entrypoint.sh').mode & 0o111).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/docker-entrypoint.test.ts`
Expected: FAIL — `ENOENT` on `docker-entrypoint.sh`.

- [ ] **Step 3: Write the entrypoint**

```sh
#!/bin/sh
# Boot sequence for the Clarity CRM container.
#
# The Prisma client is compiled into the server bundle at build time, so this
# image serves exactly one database provider. The check below turns a mismatch
# into an immediate, explicit failure — without it the app boots, serves /login
# with a 200, and returns 500 on every query. That was observed, not imagined:
# docs/superpowers/spikes/2026-07-23-phase-3-docker-spike.md (R1)
set -e

DB_URL="${DATABASE_URL:-file:./data/clarity.db}"

case "$DB_URL" in
  file:*)                        RUNTIME_PROVIDER=sqlite ;;
  postgres://*|postgresql://*)   RUNTIME_PROVIDER=postgres ;;
  *)
    echo "FATAL: unsupported DATABASE_URL \"$DB_URL\"." >&2
    echo "Use file: (SQLite) or postgres:// / postgresql:// (Postgres)." >&2
    exit 1
    ;;
esac

BAKED="${CLARITY_DB_PROVIDER:-sqlite}"

if [ "$RUNTIME_PROVIDER" != "$BAKED" ]; then
  echo "FATAL: this image was built for '$BAKED', but DATABASE_URL is '$RUNTIME_PROVIDER'." >&2
  echo "The Prisma client is compiled into the server bundle and cannot be swapped at runtime." >&2
  echo "Rebuild for the provider you want:" >&2
  echo "  docker build --build-arg DB_PROVIDER=$RUNTIME_PROVIDER -t clarity-crm ." >&2
  echo "or, with compose:" >&2
  echo "  docker compose -f docker-compose.postgres.yml up -d --build   # Postgres" >&2
  echo "  docker compose up -d --build                                  # SQLite" >&2
  exit 1
fi

export DATABASE_URL="$DB_URL"

# `db push` without --accept-data-loss: additive changes apply, destructive ones
# stop the boot rather than silently dropping data.
echo "clarity: applying schema (provider: $BAKED)..."
npm run db:push

echo "clarity: starting server on port ${PORT:-3000}..."
exec node server.js
```

- [ ] **Step 4: Make it executable and stage the mode bit**

```bash
chmod +x docker-entrypoint.sh
git update-index --chmod=+x docker-entrypoint.sh 2>/dev/null || true
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/docker-entrypoint.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: Prove the happy path on SQLite**

```bash
docker build --build-arg DB_PROVIDER=sqlite -t clarity-crm:sqlite .
docker run -d --name clarity-local -p 3010:3000 \
  -e SESSION_SECRET=local-not-a-real-secret \
  -e CRM_PASSWORD=local-not-a-real-password \
  clarity-crm:sqlite
sleep 25
curl -s -o /dev/null -w 'health: %{http_code}\n' http://localhost:3010/api/health
docker logs clarity-local | tail -20
docker rm -f clarity-local
```

Expected: `health: 200`.

- [ ] **Step 7: Prove the mismatch is caught — the regression test for R1**

```bash
docker run --rm --name clarity-mismatch \
  -e DATABASE_URL="postgres://u:p@nowhere:5432/clarity" \
  -e SESSION_SECRET=local-not-a-real-secret \
  -e CRM_PASSWORD=local-not-a-real-password \
  clarity-crm:sqlite; echo "exit: $?"
```

Expected: a non-zero exit and the "built for 'sqlite'" message. **A zero exit
here means P3-6 does not work and the task is not done** — do not proceed.

- [ ] **Step 8: Commit**

```bash
git add docker-entrypoint.sh tests/docker-entrypoint.test.ts
git commit -m "feat(deploy): entrypoint rejects a provider mismatch at boot"
```

---

### Task 8: Compose files

**Files:**
- Create: `docker-compose.yml`, `docker-compose.postgres.yml`
- Test: `tests/compose.test.ts`

`start_period: 30s` is spike-measured (R4: worst case 2.4 s to a DB-backed 200),
not a guess.

- [ ] **Step 1: Write the failing test**

Create `tests/compose.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const sqlite = readFileSync('docker-compose.yml', 'utf8')
const postgres = readFileSync('docker-compose.postgres.yml', 'utf8')

describe('docker-compose.yml (SQLite default)', () => {
  it('builds the sqlite image variant', () => {
    expect(sqlite).toMatch(/DB_PROVIDER:\s*sqlite/)
  })

  it('defaults to a SQLite file URL', () => {
    expect(sqlite).toContain('file:./data/clarity.db')
  })

  it('persists the database on a named volume', () => {
    expect(sqlite).toContain('/app/data')
    expect(sqlite).toMatch(/volumes:/)
  })

  // /login returned 200 throughout a completely broken run in spike A — only a
  // DB-backed endpoint tells the truth.
  it('healthchecks via /api/health, never /login', () => {
    expect(sqlite).toContain('/api/health')
    expect(sqlite).not.toContain('/login')
    expect(sqlite).toContain('start_period')
  })

  it('does not hardcode secrets', () => {
    expect(sqlite).not.toMatch(/SESSION_SECRET:\s*[a-z]/i)
  })
})

describe('docker-compose.postgres.yml', () => {
  it('builds the postgres image variant', () => {
    expect(postgres).toMatch(/DB_PROVIDER:\s*postgres/)
  })

  it('runs postgres:16 alongside the app', () => {
    expect(postgres).toContain('postgres:16')
  })

  it('points the app at the postgres service', () => {
    expect(postgres).toMatch(/postgres:\/\/.*@db:5432/)
  })

  it('waits for the database to be healthy before starting the app', () => {
    expect(postgres).toContain('service_healthy')
  })

  it('persists postgres data on a named volume', () => {
    expect(postgres).toContain('/var/lib/postgresql/data')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/compose.test.ts`
Expected: FAIL — `ENOENT` on both compose files.

- [ ] **Step 3: Write `docker-compose.yml`**

```yaml
# Clarity CRM — SQLite deployment (the zero-config default).
# Start:  docker compose up -d
#
# The image is built for SQLite. Switching to Postgres means a different image,
# not just a different URL — use docker-compose.postgres.yml.
services:
  app:
    build:
      context: .
      args:
        DB_PROVIDER: sqlite
    image: clarity-crm:sqlite
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: file:./data/clarity.db
      NODE_ENV: production
      SESSION_SECRET: ${SESSION_SECRET:?set SESSION_SECRET in .env}
      CRM_PASSWORD: ${CRM_PASSWORD:?set CRM_PASSWORD in .env}
      TEAM_EMAILS: ${TEAM_EMAILS:-}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}
    volumes:
      - clarity-data:/app/data
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 15s
      timeout: 5s
      retries: 5
      # Measured worst case was 2.4s to a DB-backed 200 (spike R4).
      start_period: 30s

volumes:
  clarity-data:
```

- [ ] **Step 4: Write `docker-compose.postgres.yml`**

```yaml
# Clarity CRM — Postgres deployment.
# Start:  docker compose -f docker-compose.postgres.yml up -d
# Self-contained: does not layer on docker-compose.yml.
services:
  db:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-clarity}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}
      POSTGRES_DB: ${POSTGRES_DB:-clarity}
    volumes:
      - clarity-pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-clarity}"]
      interval: 5s
      timeout: 5s
      retries: 10

  app:
    build:
      context: .
      args:
        DB_PROVIDER: postgres
    image: clarity-crm:postgres
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER:-clarity}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB:-clarity}
      NODE_ENV: production
      SESSION_SECRET: ${SESSION_SECRET:?set SESSION_SECRET in .env}
      CRM_PASSWORD: ${CRM_PASSWORD:?set CRM_PASSWORD in .env}
      TEAM_EMAILS: ${TEAM_EMAILS:-}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}
      # Keep replicas x pool under the database's connection limit.
      DATABASE_POOL_MAX: ${DATABASE_POOL_MAX:-10}
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 30s

volumes:
  clarity-pgdata:
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/compose.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 6: Verify both stacks really come up**

```bash
printf 'SESSION_SECRET=local-not-a-real-secret\nCRM_PASSWORD=local-not-a-real-password\nPOSTGRES_PASSWORD=local-not-a-real-password\n' > .env
docker compose up -d --build
sleep 45
curl -s -o /dev/null -w 'sqlite: %{http_code}\n' http://localhost:3000/api/health
docker compose down -v

docker compose -f docker-compose.postgres.yml up -d --build
sleep 60
curl -s -o /dev/null -w 'postgres: %{http_code}\n' http://localhost:3000/api/health
docker compose -f docker-compose.postgres.yml down -v
rm -f .env
```

Expected: `sqlite: 200` and `postgres: 200`. Confirm `.env` is gone.

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml docker-compose.postgres.yml tests/compose.test.ts
git commit -m "feat(deploy): SQLite and Postgres compose stacks"
```

---

### Task 9: CI boot-smoke job

**Files:**
- Create: `scripts/wait-for-health.sh`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the wait helper**

Create `scripts/wait-for-health.sh`:

```sh
#!/bin/sh
# Poll a health URL until it returns 200, or fail after a timeout.
# Usage: wait-for-health.sh <url> <timeout-seconds>
set -e
URL="$1"
TIMEOUT="${2:-90}"
ELAPSED=0
while [ "$ELAPSED" -lt "$TIMEOUT" ]; do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' "$URL")" = "200" ]; then
    echo "healthy after ${ELAPSED}s: $URL"
    exit 0
  fi
  sleep 3
  ELAPSED=$((ELAPSED + 3))
done
echo "FAILED: $URL never returned 200 within ${TIMEOUT}s" >&2
exit 1
```

```bash
chmod +x scripts/wait-for-health.sh
git update-index --chmod=+x scripts/wait-for-health.sh 2>/dev/null || true
```

- [ ] **Step 2: Add the job**

Append to `.github/workflows/ci.yml`, as a sibling of `verify`, `lint`, and `docs-check`:

```yaml
  docker:
    name: Docker · boot smoke
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5

      - uses: docker/setup-buildx-action@v3

      # One image per provider — the client is compiled into the bundle, so a
      # single image cannot serve both (spike R1).
      - name: Build sqlite image
        uses: docker/build-push-action@v6
        with:
          context: .
          load: true
          build-args: DB_PROVIDER=sqlite
          tags: clarity-crm:sqlite
          cache-from: type=gha,scope=sqlite
          cache-to: type=gha,mode=max,scope=sqlite

      - name: Build postgres image
        uses: docker/build-push-action@v6
        with:
          context: .
          load: true
          build-args: DB_PROVIDER=postgres
          tags: clarity-crm:postgres
          cache-from: type=gha,scope=postgres
          cache-to: type=gha,mode=max,scope=postgres

      - name: Write CI secrets file
        run: |
          {
            echo "SESSION_SECRET=ci-not-a-real-secret"
            echo "CRM_PASSWORD=ci-not-a-real-password"
            echo "POSTGRES_PASSWORD=ci-not-a-real-password"
          } > .env

      - name: Boot smoke — SQLite
        run: |
          docker compose up -d
          ./scripts/wait-for-health.sh http://localhost:3000/api/health 90 \
            || { docker compose logs; exit 1; }
          docker compose down -v

      - name: Boot smoke — Postgres
        run: |
          docker compose -f docker-compose.postgres.yml up -d
          ./scripts/wait-for-health.sh http://localhost:3000/api/health 120 \
            || { docker compose -f docker-compose.postgres.yml logs; exit 1; }
          docker compose -f docker-compose.postgres.yml down -v

      # Regression test for the exact failure the spike found: a sqlite-built
      # image handed a Postgres URL must refuse to boot. Without this, P3-6 is
      # an unverified promise — and the failure it guards against is invisible
      # (the app serves /login with a 200 and 500s every query).
      - name: Provider mismatch must fail closed
        run: |
          if docker run --rm \
              -e DATABASE_URL="postgres://u:p@nowhere:5432/clarity" \
              -e SESSION_SECRET=ci-not-a-real-secret \
              -e CRM_PASSWORD=ci-not-a-real-password \
              clarity-crm:sqlite; then
            echo "::error::sqlite image accepted a Postgres URL — P3-6 is broken"
            exit 1
          fi
          echo "provider mismatch correctly rejected"
```

Both compose stacks reuse the already-built images, so neither invocation rebuilds.

- [ ] **Step 3: Verify the helper works against a local stack**

```bash
printf 'SESSION_SECRET=local-not-a-real-secret\nCRM_PASSWORD=local-not-a-real-password\n' > .env
docker compose up -d --build
./scripts/wait-for-health.sh http://localhost:3000/api/health 90
docker compose down -v
rm -f .env
```

Expected: `healthy after Ns: http://localhost:3000/api/health`, exit 0.

- [ ] **Step 4: Validate the workflow file parses**

```bash
node -e "const {readFileSync}=require('fs');const s=readFileSync('.github/workflows/ci.yml','utf8');if(!s.includes('docker:'))throw new Error('docker job missing');if(!s.includes('mismatch'))throw new Error('mismatch regression step missing');console.log('ci.yml contains the docker job and the mismatch guard')"
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml scripts/wait-for-health.sh
git commit -m "ci: boot-smoke both provider images and assert mismatch fails closed"
```

---

### Task 10: Update the branch-protection ruleset — NEEDS APPROVAL

**Files:** none in-repo (GitHub repo settings)

Renaming or adding a CI job changes the set of status-check contexts, and the
`main` ruleset matches by exact name. Phase 2's PR #7 sat in "waiting for status"
for exactly this reason.

- [ ] **Step 1: Confirm the new check's exact name**

After the first CI run on the branch:

```bash
gh pr checks --watch
```

Record the literal name, expected to be `Docker · boot smoke`.

- [ ] **Step 2: Read the current ruleset**

```bash
gh api repos/ChrisScottThomas/clarity-crm/rulesets/19571458 > /tmp/ruleset-before.json
node -e "const r=require('/tmp/ruleset-before.json');console.log(JSON.stringify(r.rules.find(x=>x.type==='required_status_checks'),null,2))"
```

- [ ] **Step 3: Stop and ask the maintainer**

This is a repository-settings change. Present the exact before/after check list
and get an explicit yes before the `PUT`. Do not proceed unprompted.

- [ ] **Step 4: Add the new check (only after approval)**

Add `Docker · boot smoke` to the existing `required_status_checks` contexts,
preserving `Typecheck · Test · Build (sqlite)`, `Typecheck · Test · Build (postgres)`,
the secret scan, and the white-label check. Then verify:

```bash
gh api repos/ChrisScottThomas/clarity-crm/rulesets/19571458 \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s);console.log(r.rules.find(x=>x.type==='required_status_checks').parameters.required_status_checks.map(c=>c.context))})"
```

Expected: five contexts, including the new one.

---

### Task 11: Deploy documentation

**Files:**
- Create: `docs/deploying.md`
- Modify: `README.md` (the "Deploying (future — not done yet)" section)
- Modify: `.env.example`
- Modify: `docs/README.md` (index, if it lists the doc set)

- [ ] **Step 1: Write `docs/deploying.md`**

A Diataxis how-to, in this order:

1. **Quickstart (SQLite)** — clone, write `.env`, `docker compose up -d`, open
   `http://localhost:3000`. Exactly the commands, no prose detours.
2. **Quickstart (Postgres)** — the `-f docker-compose.postgres.yml` variant.
3. **Environment variables** — a table with columns: variable, required in
   production, default, what happens when missing. Cover `DATABASE_URL`,
   `SESSION_SECRET`, `CRM_PASSWORD`, `TEAM_EMAILS`, `ANTHROPIC_API_KEY`,
   `DATABASE_POOL_MAX`, `POSTGRES_*`. State plainly that `SESSION_SECRET` and
   `CRM_PASSWORD` are **fail-closed in production — the server refuses to boot
   without them** (`lib/env.ts`), and that a `DATABASE_URL` with an unrecognised
   scheme also refuses to boot.
4. **Switching provider — requires a rebuild.** This section carries real weight
   and must not be softened. The Prisma client is compiled into the server
   bundle, so an image serves exactly one provider. Switching means
   `docker compose -f docker-compose.postgres.yml up -d --build`, not just an
   edited URL. Say what happens if the operator tries the URL-only route: the
   container **refuses to boot**, by design, and prints the rebuild command. Note
   that this is a deliberate guard — without it the app would start, serve pages,
   and fail every query. Cross-reference the README's "Scale & production data"
   section rather than restating it.
5. **Volumes and backup** — SQLite is the `clarity-data` volume (back up by
   copying the file); Postgres is `clarity-pgdata` (`pg_dump`). Link to the
   README's rules on `--accept-data-loss`.
6. **Railway recipe** — deploy from the Dockerfile, attach a managed Postgres,
   set `DATABASE_URL` from the add-on, set `SESSION_SECRET`/`CRM_PASSWORD` as
   service variables, point the healthcheck at `/api/health`, and keep
   `DATABASE_POOL_MAX` modest if scaling replicas.
7. **TLS and reverse proxy — out of scope.** State it directly: these artifacts
   serve plain HTTP on port 3000 and terminating TLS is the operator's job.
   Point at Caddy (automatic certificates) or Traefik, and note that the session
   cookie is `secure` in production, so **the app must be behind HTTPS to work
   correctly** — a bare HTTP deployment will fail to hold a login session.

- [ ] **Step 2: Replace the README section**

Retitle `## Deploying (future — not done yet)` to `## Deploying`, and replace its
body with a short summary: the two compose quickstart commands, the note that
each image is built for one provider (so switching means a rebuild), and a link
to `docs/deploying.md`. Leave `### Scale & production data` untouched below it.

The "Known notes" entry about `app/generated/prisma` needing regeneration after a
fresh clone stays true and unchanged — it describes host development, and the
container path generates the client during its build.

- [ ] **Step 3: Update `.env.example`**

Add the Postgres compose variables (`POSTGRES_USER`, `POSTGRES_PASSWORD`,
`POSTGRES_DB`) with a comment that they are only read by
`docker-compose.postgres.yml`, and note at the top that Docker Compose reads
`.env` from the repo root.

- [ ] **Step 4: Verify every command in the guide**

Run each quickstart block verbatim from a clean state. Any command that does not
work as written is a documentation bug — fix the doc, not the reader's
expectations.

```bash
docker compose down -v 2>/dev/null; rm -rf .next
# then follow docs/deploying.md quickstart exactly as written
```

- [ ] **Step 5: Commit**

```bash
git add docs/deploying.md README.md .env.example docs/README.md
git commit -m "docs: real deploy guide replacing the not-done-yet placeholder"
```

---

### Task 12: Full verification

**Files:** none

- [ ] **Step 1: Run the whole suite**

```bash
npm run db:generate && npx tsc --noEmit && npx vitest run
```

Expected: tsc clean; all tests pass. Baseline entering Phase 3 was **190**; this
plan adds 40 (Task 3: 5, Task 4: 5, Task 5: 4, Task 6: 8, Task 7: 8, Task 8: 10),
so expect **230**. If the count differs, find out why before moving on.

- [ ] **Step 2: Re-verify both providers on the host**

```bash
env -u DATABASE_URL npm run db:push && npm run db:smoke
```

Expected: `db-smoke: OK (create/read/delete Company against sqlite)`.

- [ ] **Step 3: Re-verify both container stacks**

Repeat Task 8 Step 6 end to end. Both must return 200.

- [ ] **Step 4: Confirm no stray artifacts**

```bash
git status --porcelain
```

Expected: clean. No `.env`, no `data/`, no spike files.

---

### Task 13: Close the loop on the spec

**Files:**
- Modify: `docs/superpowers/specs/2026-07-23-phase-3-deploy-design.md`
- Modify: `docs/superpowers/plans/2026-07-22-shipping-state-plan.md`

- [ ] **Step 1: Fold measured reality into the spec**

Update the spec with anything implementation taught that the spikes did not:
final image size, the `start_period` actually used, and any design point that
shifted. Per the risk verification protocol, the spec is a live record — it must
match what shipped.

- [ ] **Step 2: Cross-link from the parent plan**

In the parent plan's Phase 3 section, link the spec, this plan, and the spike
findings — matching how Phase 2's section was cross-linked.

- [ ] **Step 3: Commit and open the PR**

```bash
git add docs/
git commit -m "docs: sync Phase 3 spec and parent plan with what shipped"
git push -u origin claude/phase-3-deploy-design
```

Then open the PR with a body covering, under these headings:

- **What shipped** — the artifact list from the File structure table
- **Spike findings** — each risk R1–R5, its verdict, and the evidence
- **Measured numbers** — image size per variant, boot time to a DB-backed 200, healthcheck `start_period`
- **Repo settings changed** — the Task 10 ruleset edit, and who approved it
- **Deliberate scope cuts** — Vercel, Fly.io, TLS/reverse proxy, registry
  publishing, multi-arch builds; each with its one-line reason

```bash
gh pr create --title "feat(deploy): Phase 3 — deploy & distribution" --body-file /tmp/phase3-pr-body.md
```

- [ ] **Step 4: Confirm CI is green**

```bash
gh pr checks --watch
```

Expected: all checks pass, including the new `Docker · boot smoke`.

---

## Exit criteria

- [ ] `docker compose up` on a clean fork yields a working instance on SQLite
- [ ] `docker compose -f docker-compose.postgres.yml up` does the same on Postgres
- [ ] A provider mismatch fails at boot with a rebuild instruction, never at
      first query — asserted by CI, not just by the entrypoint
- [ ] CI proves both providers boot, on every PR
- [ ] `docs/deploying.md` is followable start to finish by someone who has never
      seen the repo, with every command verified
- [ ] Spec risk table has no `Unproven` or `Unmeasured` rows left
