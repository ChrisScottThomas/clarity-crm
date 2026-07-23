# Phase 3 — Deploy & Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A clean fork of this repo yields a running, persistent Clarity CRM instance from a single `docker compose up`, on either SQLite or Postgres, proven by CI.

**Architecture:** One universal container image. `next build` produces a standalone server; a full production `node_modules` is layered on top so the Prisma CLI is present at runtime. The entrypoint reads `DATABASE_URL`, regenerates the provider-specific Prisma client, applies the schema with `db push`, then execs the server — making provider mismatch structurally impossible. Two self-contained compose files (SQLite default, Postgres variant) and a new `/api/health` route that CI polls to prove the container really booted.

**Tech Stack:** Docker (multi-stage, `node:22-slim`), Docker Compose, Next.js 16 standalone output, Prisma 7 (`better-sqlite3` / `pg` driver adapters), Vitest, GitHub Actions.

**Spec:** [`../specs/2026-07-23-phase-3-deploy-design.md`](../specs/2026-07-23-phase-3-deploy-design.md)

---

## Ground rules for this plan

**Tasks 1–2 are a spike gate.** The spec's risk table (R1–R5) records five
*unproven theories*. Nothing in Phase B may be written until Task 1 has produced
observed output for each and Task 2 has updated the spec with the findings. If a
spike refutes a theory, stop and revise the spec before continuing — do not
patch around it.

**Spike code is throwaway.** It lives in the scratchpad, never in the repo. Only
the *findings* are committed.

**Measured numbers are real numbers.** R4 (boot regeneration time) and R5 (image
size) produce values that go into the compose healthcheck `start_period` and the
deploy docs. Never substitute a plausible-looking figure.

## File structure

| File | Responsibility | Task |
|------|---------------|------|
| `docs/superpowers/spikes/2026-07-23-phase-3-docker-spike.md` | Recorded spike findings (evidence for R1–R5) | 1 |
| `docs/superpowers/specs/2026-07-23-phase-3-deploy-design.md` | Spec — risk table updated with outcomes | 2, 13 |
| `package.json` | `tsx` moves to `dependencies` (runtime dep of the container) | 3 |
| `next.config.ts` | `output: 'standalone'` + `serverExternalPackages` | 3 |
| `app/api/health/route.ts` | Liveness + DB round-trip; returns `{"status":"ok"}` only | 4 |
| `proxy.ts` | Allowlist `/api/health` past the auth gate | 4 |
| `lib/env.ts` | `assertDatabaseUrl()` — boot-time `DATABASE_URL` scheme check | 5 |
| `instrumentation.ts` | Wire the new check into boot | 5 |
| `Dockerfile` | Three-stage build; standalone + layered prod `node_modules` | 6 |
| `.dockerignore` | Keep build context small and secret-free | 6 |
| `docker-entrypoint.sh` | Validate → generate → push → exec server | 7 |
| `docker-compose.yml` | SQLite deployment (named volume) | 8 |
| `docker-compose.postgres.yml` | Postgres deployment (app + `postgres:16`) | 8 |
| `.github/workflows/ci.yml` | New `Docker · boot smoke` job | 9 |
| `docs/deploying.md` | Diataxis how-to: quickstart, env table, provider switch, backup, Railway, TLS caveat | 11 |
| `README.md` | Replace "Deploying (future — not done yet)" with a real summary + link | 11 |

Tests live in `tests/*.test.ts` (flat, matching the existing suite).

---

# Phase A — Spike gate

### Task 1: Prove R1–R5 with a throwaway container

**Files:**
- Create: `docs/superpowers/spikes/2026-07-23-phase-3-docker-spike.md`
- Scratch (never committed): `$SCRATCH/Dockerfile.spike`, `$SCRATCH/entrypoint.spike.sh`

Set `SCRATCH` to this session's scratchpad directory before starting.

**What is being proven** (from the spec's risk table):

| # | Theory | Evidence that settles it |
|---|--------|--------------------------|
| R1 | Next standalone resolves a Prisma client regenerated *after* build | A real query succeeds in the running container |
| R2 | Native modules survive the standalone trace | A SQLite query *and* a Postgres query both succeed |
| R3 | `node:22-slim` uses `better-sqlite3` prebuilt binaries | No compile-from-source in the build log |
| R4 | Boot regeneration is fast enough for a healthcheck | Measured seconds from container start to first 200 |
| R5 | Layered `node_modules` image size is acceptable | Measured MB from `docker images` |

- [ ] **Step 1: Write the spike Dockerfile**

Create `$SCRATCH/Dockerfile.spike`:

```dockerfile
# THROWAWAY — spike only. Proves R1-R5. Not the production Dockerfile.
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run db:generate
RUN npx next build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# The layered full production node_modules — this is the R2/R5 question.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/package.json ./package.json
COPY entrypoint.spike.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && mkdir -p /app/data
EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
```

- [ ] **Step 2: Write the spike entrypoint**

Create `$SCRATCH/entrypoint.spike.sh`:

```sh
#!/bin/sh
set -e
echo "spike: DATABASE_URL=${DATABASE_URL}"
START=$(date +%s)
npx tsx scripts/prisma-provider.ts generate
npx tsx scripts/prisma-provider.ts db push
END=$(date +%s)
echo "spike: R4 regeneration+push took $((END-START))s"
exec node server.js
```

- [ ] **Step 3: Build the spike image and capture the log**

```bash
cd /Users/chris.scott-thomas/github/clarity-crm/.claude/worktrees/session-c77cb5
cp "$SCRATCH/Dockerfile.spike" "$SCRATCH/entrypoint.spike.sh" .
docker build -f Dockerfile.spike -t clarity-spike . 2>&1 | tee "$SCRATCH/spike-build.log"
rm -f Dockerfile.spike entrypoint.spike.sh
```

Expected: build succeeds. **Do not proceed on a failed build — record the failure
as the R1/R2/R3 finding and stop.**

- [ ] **Step 4: Settle R3 — check for compile-from-source**

```bash
grep -iE "node-gyp|prebuild-install|gyp info|make: Entering" "$SCRATCH/spike-build.log" || echo "R3: no compile-from-source markers found"
```

Expected: no `node-gyp` build markers for `better-sqlite3`. Record the literal
output either way.

- [ ] **Step 5: Settle R5 — measure image size**

```bash
docker images clarity-spike --format '{{.Size}}'
```

Record the exact figure.

- [ ] **Step 6: Settle R1/R2/R4 on SQLite**

```bash
docker run -d --name spike-sqlite -p 3011:3000 \
  -e DATABASE_URL="file:./data/clarity.db" \
  -e NODE_ENV=production \
  -e SESSION_SECRET=spike-not-a-real-secret \
  -e CRM_PASSWORD=spike-not-a-real-password \
  clarity-spike
sleep 20
docker logs spike-sqlite 2>&1 | tee "$SCRATCH/spike-sqlite.log"
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3011/login
```

Expected: logs show `spike: R4 ... took Ns` (record N), the Prisma generate
naming `sqlite`, and `curl` returns `200`. A 200 from a page that renders means
the standalone server resolved the regenerated client — **that is R1**.

- [ ] **Step 7: Settle R1/R2 on Postgres**

```bash
docker network create spike-net || true
docker run -d --name spike-pg --network spike-net \
  -e POSTGRES_PASSWORD=spike -e POSTGRES_DB=clarity postgres:16
sleep 10
docker run -d --name spike-postgres --network spike-net -p 3012:3000 \
  -e DATABASE_URL="postgres://postgres:spike@spike-pg:5432/clarity" \
  -e NODE_ENV=production \
  -e SESSION_SECRET=spike-not-a-real-secret \
  -e CRM_PASSWORD=spike-not-a-real-password \
  clarity-spike
sleep 25
docker logs spike-postgres 2>&1 | tee "$SCRATCH/spike-postgres.log"
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3012/login
```

Expected: the *same image* generates a `postgresql` client and serves `200`.
That is the core R1 claim — one image, both providers. Record the R4 timing for
this leg too (Postgres is the slower one).

- [ ] **Step 8: Tear down**

```bash
docker rm -f spike-sqlite spike-postgres spike-pg 2>/dev/null || true
docker network rm spike-net 2>/dev/null || true
docker rmi clarity-spike 2>/dev/null || true
```

- [ ] **Step 9: Write the findings document**

Create `docs/superpowers/spikes/2026-07-23-phase-3-docker-spike.md` with a
section per risk. Each section states the theory, the **verbatim observed
output** (log excerpt, HTTP code, measured number), and a verdict of
**Confirmed** or **Refuted**. No verdict may rest on reasoning. Close with a
"Consequences for the plan" section naming any task that must change.

- [ ] **Step 10: Commit**

```bash
git add docs/superpowers/spikes/2026-07-23-phase-3-docker-spike.md
git commit -m "docs: Phase 3 Docker spike findings (R1-R5)"
```

Confirm nothing from the scratchpad leaked in:

```bash
git status --porcelain
```

Expected: clean; no `Dockerfile.spike` or `entrypoint.spike.sh`.

---

### Task 2: Update the spec with spike findings — GATE

**Files:**
- Modify: `docs/superpowers/specs/2026-07-23-phase-3-deploy-design.md` (risk table)

- [ ] **Step 1: Update each risk row's Status**

Change every `Unproven`/`Unmeasured` to `Confirmed` or `Refuted`, each linking to
the spike document. Replace R4 and R5's placeholder framing with the measured
numbers.

- [ ] **Step 2: Handle any refutation**

If any row is **Refuted**, stop here and revise the affected spec section before
touching Phase B. For R1 specifically the recorded fallback is the build-arg
variant, which changes Tasks 6 and 7 substantially — that is a spec revision and
a fresh review, not an in-flight patch.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-07-23-phase-3-deploy-design.md
git commit -m "docs: record Phase 3 spike outcomes in the design spec"
```

**GATE: do not start Task 3 until every risk row reads Confirmed.**

---

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

  // The container entrypoint runs db:generate and db:push, both of which route
  // through scripts/prisma-provider.ts — so tsx is a runtime dependency, not a
  // dev one. See docs/superpowers/specs/2026-07-23-phase-3-deploy-design.md §2.
  it('ships tsx as a production dependency', () => {
    expect(pkg.dependencies).toHaveProperty('tsx')
    expect(pkg.devDependencies ?? {}).not.toHaveProperty('tsx')
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

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/deploy-config.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Verify the build still works**

```bash
npm run db:generate && npx next build
```

Expected: build succeeds and reports standalone output. Confirm the server file exists:

```bash
test -f .next/standalone/server.js && echo "standalone server present"
```

- [ ] **Step 7: Commit**

```bash
git add next.config.ts package.json package-lock.json tests/deploy-config.test.ts
git commit -m "feat(deploy): standalone output; tsx becomes a runtime dependency"
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

### Task 6: Dockerfile and `.dockerignore`

**Files:**
- Create: `Dockerfile`, `.dockerignore`
- Test: `tests/dockerfile.test.ts`

The Dockerfile below is the spike's `Dockerfile.spike` promoted to production
shape: non-root user, pinned base, no scratch entrypoint. **If Task 1 refuted any
theory, this file must reflect the corrected design.**

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

  it('runs as a non-root user', () => {
    expect(dockerfile).toMatch(/^USER\s+(?!root)/m)
  })

  it('ships the pieces the entrypoint needs to regenerate the client', () => {
    expect(dockerfile).toContain('prisma.config.ts')
    expect(dockerfile).toContain('scripts')
    expect(dockerfile).toContain('.next/standalone')
  })

  it('delegates startup to the entrypoint rather than running the server directly', () => {
    expect(dockerfile).toContain('docker-entrypoint.sh')
    expect(dockerfile).toMatch(/ENTRYPOINT/)
  })
})

describe('.dockerignore', () => {
  const ignore = readFileSync('.dockerignore', 'utf8')

  it('keeps secrets and local state out of the build context', () => {
    for (const entry of ['.env', '.env.local', 'node_modules', '.next', 'data']) {
      expect(ignore).toContain(entry)
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/dockerfile.test.ts`
Expected: FAIL — `ENOENT` on `Dockerfile`.

- [ ] **Step 3: Write `.dockerignore`**

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

- [ ] **Step 4: Write the `Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1

# Debian slim, not Alpine: better-sqlite3 ships prebuilt binaries against glibc;
# musl would force a compile-from-source. Confirmed by the Phase 3 spike (R3) —
# docs/superpowers/spikes/2026-07-23-phase-3-docker-spike.md
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# A client must exist for typecheck and tracing to succeed. The provider chosen
# here is irrelevant — the entrypoint regenerates for the real DATABASE_URL.
RUN npm run db:generate
RUN npx next build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# The standalone bundle's node_modules is a traced subset and omits the prisma
# CLI and tsx, both of which boot-time regeneration needs. Layering the full
# production tree over it is the deliberate trade: correctness now, slimming
# later. See the spec §2.
COPY --from=deps /app/node_modules ./node_modules

COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/package.json ./package.json
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# The entrypoint writes a regenerated client into app/generated/prisma and a
# SQLite file into data/, so both must be owned by the runtime user.
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
 && mkdir -p /app/data /app/app/generated \
 && chown -R node:node /app

USER node
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/dockerfile.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add Dockerfile .dockerignore tests/dockerfile.test.ts
git commit -m "feat(deploy): multi-stage Dockerfile with a non-root runtime"
```

---

### Task 7: Container entrypoint

**Files:**
- Create: `docker-entrypoint.sh`
- Test: `tests/docker-entrypoint.test.ts`

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

  it('regenerates the client and applies the schema before serving', () => {
    const generate = script.indexOf('db:generate')
    const push = script.indexOf('db:push')
    const serve = script.indexOf('server.js')
    expect(generate).toBeGreaterThan(-1)
    expect(push).toBeGreaterThan(generate)
    expect(serve).toBeGreaterThan(push)
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
# One image serves both providers: the Prisma client is generated here, from the
# DATABASE_URL this container is actually about to use, which makes a provider
# mismatch structurally impossible. See
# docs/superpowers/specs/2026-07-23-phase-3-deploy-design.md (P3-1, P3-2).
set -e

DB_URL="${DATABASE_URL:-file:./data/clarity.db}"

case "$DB_URL" in
  file:*|postgres://*|postgresql://*) ;;
  *)
    echo "FATAL: unsupported DATABASE_URL \"$DB_URL\"." >&2
    echo "Use file: (SQLite) or postgres:// / postgresql:// (Postgres)." >&2
    exit 1
    ;;
esac

export DATABASE_URL="$DB_URL"

echo "clarity: generating the Prisma client for this DATABASE_URL..."
npm run db:generate

# `db push` without --accept-data-loss: additive changes apply, destructive ones
# stop the boot rather than silently dropping data.
echo "clarity: applying schema..."
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
Expected: PASS (5 tests).

- [ ] **Step 6: Build and boot the real image on SQLite**

```bash
docker build -t clarity-crm:local .
docker run -d --name clarity-local -p 3010:3000 \
  -e SESSION_SECRET=local-not-a-real-secret \
  -e CRM_PASSWORD=local-not-a-real-password \
  clarity-crm:local
sleep 25
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3010/api/health
docker logs clarity-local | tail -20
docker rm -f clarity-local
```

Expected: `200`. If not, read the logs and fix before committing — this is the
first end-to-end proof of the production artifacts.

- [ ] **Step 7: Commit**

```bash
git add docker-entrypoint.sh tests/docker-entrypoint.test.ts
git commit -m "feat(deploy): entrypoint regenerates the client and applies schema at boot"
```

---

### Task 8: Compose files

**Files:**
- Create: `docker-compose.yml`, `docker-compose.postgres.yml`
- Test: `tests/compose.test.ts`

Use the R4 figure measured in Task 1 for `start_period`. Round up generously —
a healthcheck that fires before regeneration finishes reports a false failure.

- [ ] **Step 1: Write the failing test**

Create `tests/compose.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const sqlite = readFileSync('docker-compose.yml', 'utf8')
const postgres = readFileSync('docker-compose.postgres.yml', 'utf8')

describe('docker-compose.yml (SQLite default)', () => {
  it('defaults to a SQLite file URL', () => {
    expect(sqlite).toContain('file:./data/clarity.db')
  })

  it('persists the database on a named volume', () => {
    expect(sqlite).toContain('/app/data')
    expect(sqlite).toMatch(/volumes:/)
  })

  it('healthchecks via /api/health with a start period for boot regeneration', () => {
    expect(sqlite).toContain('/api/health')
    expect(sqlite).toContain('start_period')
  })

  it('does not hardcode secrets', () => {
    expect(sqlite).not.toMatch(/SESSION_SECRET:\s*\S+/)
  })
})

describe('docker-compose.postgres.yml', () => {
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

Replace `<R4>` with the measured boot time, rounded up (e.g. `40s`).

```yaml
# Clarity CRM — SQLite deployment (the zero-config default).
# Start:  docker compose up -d
# Secrets come from a local .env file; see docs/deploying.md.
services:
  app:
    build: .
    image: clarity-crm:local
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
      # The entrypoint regenerates the Prisma client and applies the schema
      # before serving; measured in the Phase 3 spike (R4).
      start_period: <R4>

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
    build: .
    image: clarity-crm:local
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
      start_period: <R4>

volumes:
  clarity-pgdata:
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/compose.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: Verify both stacks really come up**

```bash
printf 'SESSION_SECRET=local-not-a-real-secret\nCRM_PASSWORD=local-not-a-real-password\nPOSTGRES_PASSWORD=local-not-a-real-password\n' > .env
docker compose up -d --build
sleep 45
curl -s -o /dev/null -w 'sqlite: %{http_code}\n' http://localhost:3000/api/health
docker compose down -v

docker compose -f docker-compose.postgres.yml up -d --build
sleep 50
curl -s -o /dev/null -w 'postgres: %{http_code}\n' http://localhost:3000/api/health
docker compose -f docker-compose.postgres.yml down -v
rm -f .env
```

Expected: `sqlite: 200` and `postgres: 200`. Confirm `.env` is gone and untracked
(`.gitignore` already lists it).

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml docker-compose.postgres.yml tests/compose.test.ts
git commit -m "feat(deploy): SQLite and Postgres compose stacks"
```

---

### Task 9: CI boot-smoke job

**Files:**
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

      # Build once, load into the local daemon, then boot it under both compose
      # stacks. This job IS the phase exit criterion: "a clean fork yields a
      # running instance" becomes a check rather than a claim.
      - name: Build image
        uses: docker/build-push-action@v6
        with:
          context: .
          load: true
          tags: clarity-crm:local
          cache-from: type=gha
          cache-to: type=gha,mode=max

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
```

Note both stacks reuse the already-built `clarity-crm:local` image, so neither
compose invocation rebuilds.

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
node -e "const {readFileSync}=require('fs');const s=readFileSync('.github/workflows/ci.yml','utf8');if(!s.includes('docker:'))throw new Error('docker job missing');console.log('ci.yml contains the docker job')"
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml scripts/wait-for-health.sh
git commit -m "ci: boot-smoke the container image on both providers"
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
4. **Switching provider** — change `DATABASE_URL`, restart the container. Note
   that unlike the host workflow, no manual `db:generate` is needed: the
   entrypoint does it. Cross-reference the README's "Scale & production data"
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
body with a short summary: the two compose quickstart commands, the note that one
image serves both providers because the client is generated at boot, and a link
to `docs/deploying.md`. Leave `### Scale & production data` untouched below it.

Also fix the now-stale claim in the "Known notes" section: with the container,
`app/generated/prisma` is regenerated automatically at boot. The note is still
true for host development — scope it explicitly to that.

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
plan adds 30 (Task 3: 3, Task 4: 5, Task 5: 4, Task 6: 5, Task 7: 5, Task 8: 8),
so expect **220**. If the count differs, find out why before moving on.

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
- **Measured numbers** — image size, boot regeneration time, healthcheck `start_period`
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
- [ ] One image serves both providers — no rebuild when switching
- [ ] CI proves both, on every PR
- [ ] `docs/deploying.md` is followable start to finish by someone who has never
      seen the repo, with every command verified
- [ ] Spec risk table has no `Unproven` or `Unmeasured` rows left
