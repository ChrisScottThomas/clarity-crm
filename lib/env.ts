// Centralized, fail-closed access to auth secrets.
//
// In production a missing/empty secret is a hard error: we refuse to run rather
// than silently fall back to a well-known value (the old `?? 'dev'` footgun).
// Outside production a dev fallback keeps local work frictionless.

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
