// Login decision logic, kept free of Next request APIs so it can be unit-tested.
// The server action (app/login/actions.ts) supplies the password + client IP and
// translates the result into a cookie/redirect.

import { getCrmPassword } from './env'

export const MAX_LOGIN_ATTEMPTS = 5
export const LOGIN_WINDOW_MS = 15 * 60 * 1000 // 15 minutes

export type LoginResult = 'ok' | 'invalid' | 'throttled'

// In-memory, per-IP failure counter. Adequate for the single-instance,
// shared-password model; resets on restart (boring by design).
const failures = new Map<string, { count: number; firstAt: number }>()

/** Test-only: wipe throttle state between cases. */
export function resetLoginThrottle(): void {
  failures.clear()
}

function isThrottled(ip: string, now: number): boolean {
  const entry = failures.get(ip)
  if (!entry) return false
  if (now - entry.firstAt >= LOGIN_WINDOW_MS) {
    failures.delete(ip)
    return false
  }
  return entry.count >= MAX_LOGIN_ATTEMPTS
}

function recordFailure(ip: string, now: number): void {
  const entry = failures.get(ip)
  if (!entry || now - entry.firstAt >= LOGIN_WINDOW_MS) {
    failures.set(ip, { count: 1, firstAt: now })
    return
  }
  entry.count += 1
}

export function attemptLogin(password: string, ip: string, now = Date.now()): LoginResult {
  if (isThrottled(ip, now)) return 'throttled'

  const expected = getCrmPassword()
  if (!password || !expected || password !== expected) {
    recordFailure(ip, now)
    return 'invalid'
  }

  failures.delete(ip)
  return 'ok'
}
