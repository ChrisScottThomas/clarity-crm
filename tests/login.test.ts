import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { attemptLogin, resetLoginThrottle, MAX_LOGIN_ATTEMPTS } from '../lib/login'

const IP = '203.0.113.7'

beforeEach(() => {
  vi.stubEnv('CRM_PASSWORD', 'correct-horse')
  resetLoginThrottle()
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('attemptLogin', () => {
  it('accepts the correct password', () => {
    expect(attemptLogin('correct-horse', IP)).toBe('ok')
  })

  it('rejects a wrong password', () => {
    expect(attemptLogin('nope', IP)).toBe('invalid')
  })

  it('rejects an empty password even if CRM_PASSWORD is somehow empty', () => {
    vi.stubEnv('CRM_PASSWORD', '')
    expect(attemptLogin('', IP)).toBe('invalid')
  })

  it('throttles after too many failures from one IP', () => {
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS; i++) {
      expect(attemptLogin('wrong', IP)).toBe('invalid')
    }
    // Next attempt is blocked before the password is even checked.
    expect(attemptLogin('correct-horse', IP)).toBe('throttled')
  })

  it('keeps a different IP unaffected by another IP hitting the limit', () => {
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS; i++) attemptLogin('wrong', IP)
    expect(attemptLogin('correct-horse', '198.51.100.9')).toBe('ok')
  })

  it('clears the failure count after a successful login', () => {
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS - 1; i++) attemptLogin('wrong', IP)
    expect(attemptLogin('correct-horse', IP)).toBe('ok')
    // Counter reset: a fresh run of failures is needed to throttle again.
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS - 1; i++) {
      expect(attemptLogin('wrong', IP)).toBe('invalid')
    }
  })

  it('expires the throttle window over time', () => {
    const t0 = 1_000_000
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS; i++) attemptLogin('wrong', IP, t0)
    expect(attemptLogin('correct-horse', IP, t0)).toBe('throttled')
    // Well past the window, the count has aged out.
    expect(attemptLogin('correct-horse', IP, t0 + 60 * 60 * 1000)).toBe('ok')
  })
})
