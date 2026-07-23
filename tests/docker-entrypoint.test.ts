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

  // Next catches a throw from the instrumentation hook and keeps the port
  // bound, so in-process validation cannot stop a container. The preflight runs
  // the same guards in a process that exits non-zero.
  it('validates the environment in a process that can actually die', () => {
    expect(script).toContain('check:env')
  })

  // A container that can never serve must not get to mutate the schema of a
  // live database on its way down.
  it('validates the environment BEFORE touching the database', () => {
    const check = script.indexOf('check:env')
    const push = script.indexOf('db:push')
    expect(check).toBeGreaterThan(-1)
    expect(push).toBeGreaterThan(check)
  })

  // The provider-mismatch guard predates the preflight and must keep its place.
  it('still rejects a mismatched provider before touching the database', () => {
    const mismatch = script.indexOf('CLARITY_DB_PROVIDER')
    const push = script.indexOf('db:push')
    expect(mismatch).toBeGreaterThan(-1)
    expect(push).toBeGreaterThan(mismatch)
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
