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
