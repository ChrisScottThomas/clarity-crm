// Centralized, fail-closed access to auth secrets.
//
// In production a missing/empty secret is a hard error: we refuse to run rather
// than silently fall back to a well-known value (the old `?? 'dev'` footgun).
// Outside production a dev fallback keeps local work frictionless.

import { providerForUrl, parsePoolMax, DEFAULT_DATABASE_URL } from './db-adapter'

const DEV_SESSION_SECRET = 'dev-insecure-secret-do-not-use-in-production'

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

/** The HMAC secret used to sign/verify session tokens. */
export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (secret && secret.length > 0) return secret
  if (isProduction()) {
    throw new Error(
      'SESSION_SECRET is required in production but was missing or empty.',
    )
  }
  return DEV_SESSION_SECRET
}

/** The shared login password. Undefined outside production when unset. */
export function getCrmPassword(): string | undefined {
  const password = process.env.CRM_PASSWORD
  if (password && password.length > 0) return password
  if (isProduction()) {
    throw new Error(
      'CRM_PASSWORD is required in production but was missing or empty.',
    )
  }
  return password || undefined
}

/**
 * Boot-time guard: throws if any required secret is missing in production.
 * Wired into instrumentation so the server refuses to start misconfigured.
 */
export function assertProductionSecrets(): void {
  if (!isProduction()) return
  // Each getter throws with a specific, actionable message when unset.
  getSessionSecret()
  getCrmPassword()
}

/**
 * Boot-time guard: a malformed DATABASE_URL should die here, naming the
 * accepted schemes, rather than surfacing later as an opaque Prisma error.
 * Unset is valid — lib/db-adapter applies the sqlite dev default.
 */
export function assertDatabaseUrl(): void {
  const url = process.env.DATABASE_URL
  providerForUrl(url && url.length > 0 ? url : DEFAULT_DATABASE_URL)
}

/**
 * Boot-time guard: DATABASE_POOL_MAX must be a positive integer if set at all.
 * Checked regardless of provider — on SQLite the value is unused, but silently
 * tolerating `abc` there just defers the failure to the day the operator
 * switches to Postgres. Unset and empty are both valid (driver default).
 */
export function assertDatabasePoolMax(): void {
  parsePoolMax(process.env.DATABASE_POOL_MAX)
}

/**
 * Every boot-time guard in one call, for callers that want all of them:
 * the instrumentation hook and the container's preflight check
 * (scripts/check-runtime-env.ts).
 */
export function assertRuntimeEnv(): void {
  assertProductionSecrets()
  assertDatabaseUrl()
  assertDatabasePoolMax()
}
