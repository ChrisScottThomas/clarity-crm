// Minimal proof that the generated client + chosen adapter really talk to the
// database behind DATABASE_URL: create one uniquely-named Company, read it
// back, delete it. Never truncates or resets anything — safe even against a
// database that matters. Run in CI after `db:push` on each provider leg.
import { prisma } from '../lib/db'
import { chooseAdapter } from '../lib/db-adapter'

async function main(): Promise<void> {
  // Log the adapter kind, never the raw URL — a postgres URL carries credentials.
  const target = chooseAdapter(process.env.DATABASE_URL, process.env.DATABASE_POOL_MAX).kind
  const name = `__db-smoke__${Date.now()}`
  const created = await prisma.company.create({ data: { name } })
  try {
    const found = await prisma.company.findUnique({ where: { id: created.id } })
    if (found?.name !== name) {
      throw new Error(`smoke read-back mismatch: expected "${name}", got "${found?.name}"`)
    }
  } finally {
    // Best-effort cleanup so a failed run never strands the smoke row; a
    // secondary delete error must not mask the primary failure.
    await prisma.company.delete({ where: { id: created.id } }).catch((err) => {
      console.error(`db-smoke: cleanup of ${created.id} failed:`, err)
    })
  }
  console.log(`db-smoke: OK (create/read/delete Company against ${target})`)
}

main()
  .catch((err) => {
    console.error('db-smoke: FAILED')
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
