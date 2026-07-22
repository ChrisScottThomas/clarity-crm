import { assertProductionSecrets } from './lib/env'

// Runs once when a server instance starts, before it accepts requests.
// Fail closed: refuse to boot in production without the required auth secrets.
export function register() {
  assertProductionSecrets()
}
