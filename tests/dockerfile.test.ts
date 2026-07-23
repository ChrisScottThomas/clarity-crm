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
  // Anchored to `RUN` deliberately: the comment above the build stage also
  // mentions `next build`, and an unanchored match lands on the comment.
  it('supplies DATABASE_URL to both db:generate and next build', () => {
    const generate = dockerfile.match(/^RUN .*db:generate.*$/m)?.[0] ?? ''
    const build = dockerfile.match(/^RUN .*next build.*$/m)?.[0] ?? ''
    expect(generate).toContain('DATABASE_URL')
    expect(build).toContain('DATABASE_URL')
  })

  // R6: next build only *constructs* the client, never connects — so the build
  // URL can be unreachable, and must be, or credentials land in image history.
  it('uses an unreachable dummy URL at build time, never a real one', () => {
    expect(dockerfile).toContain('127.0.0.1:1')
  })

  it('installs openssl so Prisma can detect libssl', () => {
    expect(dockerfile).toContain('openssl')
  })

  // R7 finding: `npx` ignores PATH. A tooling tree beside /app/node_modules let
  // `npx prisma` silently network-install 7.9.0 against a 7.8.0 baked client.
  it('merges the tooling tree into /app/node_modules, not beside it', () => {
    expect(dockerfile).toMatch(/COPY --from=tooling[^\n]*\.\/node_modules/)
  })

  // Order is load-bearing: reversing it lets the CLI's transitive react-dom and
  // next overwrite the app's own.
  it('copies the standalone tree after the tooling tree', () => {
    const tooling = dockerfile.search(/COPY --from=tooling/)
    const standalone = dockerfile.search(/COPY --from=builder[^\n]*standalone/)
    expect(tooling).toBeGreaterThan(-1)
    expect(standalone).toBeGreaterThan(tooling)
  })

  // Measured: `RUN chown -R` on /app rewrites every file's metadata and writes a
  // second full copy into the layer — 819 MB, taking 1.13 GB to 1.95 GB.
  it('never recursively chowns the whole app directory', () => {
    expect(dockerfile).not.toMatch(/chown -R[^\n]*\/app\s*$/m)
    expect(dockerfile).not.toMatch(/chown -R node:node \/app\b(?!\/data)/)
  })

  // Variant C proved a floating CLI version is not a theoretical risk.
  it('pins the tooling versions from the lockfile rather than hardcoding them', () => {
    expect(dockerfile).toContain('package-lock.json')
    expect(dockerfile).toMatch(/node_modules\/prisma/)
  })

  it('runs as a non-root user', () => {
    expect(dockerfile).toMatch(/^USER\s+(?!root)/m)
  })

  it('delegates startup to the entrypoint rather than running the server directly', () => {
    expect(dockerfile).toContain('docker-entrypoint.sh')
    expect(dockerfile).toMatch(/ENTRYPOINT/)
  })
})
