import { assertRuntimeEnv } from './lib/env'
import { validateConfig } from './lib/config-validation'
import { clarityConfig } from './clarity.config'

// Runs once when a server instance starts, before it accepts requests.
// Fail closed: refuse to boot in production without the required auth secrets,
// refuse to boot with a DATABASE_URL we can't map to a known provider or a
// DATABASE_POOL_MAX that isn't a positive integer, and refuse to boot in any
// environment with a malformed clarity.config.ts.
//
// IMPORTANT: throwing here is necessary but NOT sufficient in a container.
// Next catches an instrumentation-hook throw, logs `Failed to prepare server`
// as an unhandledRejection, and keeps the port bound — the process stays alive
// serving 500s forever. The container's real fail-closed gate is the preflight
// in docker-entrypoint.sh (scripts/check-runtime-env.ts), which runs the same
// guards in a short-lived process that actually exits non-zero.
export function register() {
  assertRuntimeEnv()
  validateConfig(clarityConfig)
}
