import { assertProductionSecrets } from './lib/env'
import { validateConfig } from './lib/config-validation'
import { clarityConfig } from './clarity.config'

// Runs once when a server instance starts, before it accepts requests.
// Fail closed: refuse to boot in production without the required auth secrets,
// and refuse to boot in any environment with a malformed clarity.config.ts.
export function register() {
  assertProductionSecrets()
  validateConfig(clarityConfig)
}
