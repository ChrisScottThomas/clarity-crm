// Container preflight: validate the runtime environment in a short-lived
// process that EXITS NON-ZERO on failure, before the entrypoint touches the
// database or starts the server.
//
// Why this exists, given instrumentation.ts already runs the same guards:
// Next catches a throw from the instrumentation hook. It logs
//
//   ▲ Next.js 16.2.9  ✓ Ready in 0ms
//   Failed to prepare server Error: An error occurred while loading
//   instrumentation hook: SESSION_SECRET is required in production ...
//
// as an unhandledRejection — and then keeps the port bound. The container stays
// `Running=true`, every request 500s, and orchestrators (Railway, compose
// without a healthcheck, `docker run`) see a healthy process. Only Compose's
// `${VAR:?}` interpolation caught this, and only on the Compose path.
//
// A separate `node` process that throws exits 1, which `set -e` in the
// entrypoint turns into a dead container with the reason printed. That is the
// behaviour the deploy docs promise.

import { pathToFileURL } from 'node:url'
import { assertRuntimeEnv } from '../lib/env'

/**
 * Runs every boot-time guard against the current `process.env`.
 * Throws the first failure; returns silently when the config is usable.
 * Exported so the suite can exercise it without spawning a container.
 */
export function checkRuntimeEnv(): void {
  assertRuntimeEnv()
}

function main(): void {
  try {
    checkRuntimeEnv()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`FATAL: ${message}`)
    console.error('Refusing to boot: fix the environment and start the container again.')
    process.exit(1)
  }
  console.log('clarity: configuration OK')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
