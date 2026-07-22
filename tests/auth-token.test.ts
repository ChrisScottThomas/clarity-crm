import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { makeToken, verifyToken, TOKEN_TTL_MS } from '../lib/token'

const SECRET = 'test-secret-value'

beforeEach(() => {
  vi.stubEnv('SESSION_SECRET', SECRET)
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('token — sign/verify', () => {
  it('accepts a freshly minted token', () => {
    const token = makeToken()
    expect(verifyToken(token)).toBe(true)
  })

  it('rejects a missing/empty token', () => {
    expect(verifyToken(undefined)).toBe(false)
    expect(verifyToken('')).toBe(false)
  })

  it('rejects a token whose signature was forged with the wrong secret', () => {
    const token = makeToken()
    vi.stubEnv('SESSION_SECRET', 'a-different-secret')
    expect(verifyToken(token)).toBe(false)
  })

  it('rejects a token whose payload was tampered with after signing', () => {
    const token = makeToken()
    const [payload, sig] = token.split('.')
    // Flip a character in the payload; signature no longer matches.
    const tampered = `${payload.slice(0, -1)}${payload.slice(-1) === 'A' ? 'B' : 'A'}.${sig}`
    expect(verifyToken(tampered)).toBe(false)
  })

  it('rejects the old constant "ok" token format', () => {
    // The pre-hardening token was a constant `ok.<hmac('ok')>` with no expiry.
    // That shape must no longer verify.
    expect(verifyToken('ok.anything')).toBe(false)
  })

  it('rejects a token past its TTL', () => {
    const now = Date.now()
    const token = makeToken({ now: now - TOKEN_TTL_MS - 1000 })
    expect(verifyToken(token, { now })).toBe(false)
  })

  it('accepts a token just inside its TTL', () => {
    const now = Date.now()
    const token = makeToken({ now: now - TOKEN_TTL_MS + 1000 })
    expect(verifyToken(token, { now })).toBe(true)
  })

  it('mints distinct tokens on each call (nonce)', () => {
    expect(makeToken()).not.toBe(makeToken())
  })
})
