// Minimal proof that the generated client + chosen adapter really talk to the
// database behind DATABASE_URL: create one uniquely-named Company, read it
// back, delete it. Never truncates or resets anything — safe even against a
// database that matters. Run in CI after `db:push` on each provider leg.
import { prisma } from '../lib/db'

async function main(): Promise<void> {
  const name = `__db-smoke__${Date.now()}`
  const created = await prisma.company.create({ data: { name } })
  const found = await prisma.company.findUnique({ where: { id: created.id } })
  if (found?.name !== name) {
    throw new Error(`smoke read-back mismatch: expected "${name}", got "${found?.name}"`)
  }
  await prisma.company.delete({ where: { id: created.id } })
  console.log(`db-smoke: OK (create/read/delete Company against ${process.env.DATABASE_URL ?? 'default sqlite'})`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('db-smoke: FAILED')
    console.error(err)
    process.exit(1)
  })
