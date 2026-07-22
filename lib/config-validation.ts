// Fail-loud validation for clarity.config.ts.
//
// A fork's config is committed code, so a malformed one is a bug we want to
// surface at boot — in every environment, not just production — rather than as
// a confusing runtime null somewhere downstream. `validateConfig` is called
// from instrumentation `register()`; it throws with an actionable message.

import type { clarityConfig } from '../clarity.config'

type ClarityConfig = typeof clarityConfig

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(`Invalid clarity.config.ts: ${message}`)
}

function assertNonEmptyStringList(value: unknown, field: string): void {
  assert(Array.isArray(value) && value.length > 0, `${field} must be a non-empty array`)
  for (const item of value as unknown[]) {
    assert(typeof item === 'string' && item.trim().length > 0, `${field} contains a blank or non-string entry`)
  }
}

function assertHex(value: unknown, field: string): void {
  assert(typeof value === 'string' && HEX.test(value), `${field} must be a hex colour like #429edb (got ${JSON.stringify(value)})`)
}

export function validateConfig(cfg: ClarityConfig): void {
  const c = cfg as any

  // Branding
  assert(typeof c.brand?.name === 'string' && c.brand.name.trim().length > 0, 'brand.name must be a non-empty string')
  assert(typeof c.brand?.logo === 'string' && c.brand.logo.trim().length > 0, 'brand.logo must be a non-empty string')
  assertHex(c.brand?.colors?.midnight, 'brand.colors.midnight')
  assertHex(c.brand?.colors?.text, 'brand.colors.text')
  assertHex(c.brand?.colors?.blue, 'brand.colors.blue')

  // Core vocab — always required.
  assertNonEmptyStringList(c.stages, 'stages')
  assertNonEmptyStringList(c.owners, 'owners')
  assertNonEmptyStringList(c.tracks, 'tracks')
  assertNonEmptyStringList(c.sources, 'sources')
  assertNonEmptyStringList(c.nextActions, 'nextActions')

  // Diagnostics toggle.
  assert(typeof c.diagnosticsEnabled === 'boolean', 'diagnosticsEnabled must be a boolean')

  // Diagnostic vocab — only required when the framework is enabled. A minimal
  // fork can turn diagnostics off and leave these empty.
  if (c.diagnosticsEnabled) {
    assertNonEmptyStringList(c.constraints, 'constraints')
    assertNonEmptyStringList(c.businessDebts, 'businessDebts')
    assertNonEmptyStringList(c.roadmapStages, 'roadmapStages')
    for (const constraint of c.constraints as string[]) {
      assertHex(c.constraintColors?.[constraint], `constraintColors.${constraint}`)
    }
  }

  // Any debt colours present must be well-formed (the default set covers only
  // a subset of debts, so we validate what's given rather than require totality).
  for (const [debt, colour] of Object.entries(c.debtColors ?? {})) {
    assertHex(colour, `debtColors["${debt}"]`)
  }
}
