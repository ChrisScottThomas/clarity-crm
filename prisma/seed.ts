import 'dotenv/config'
import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? 'file:./data/clarity.db' })
const prisma = new PrismaClient({ adapter })

async function main() {
  const shared = 'https://cal.com/alex-jordan/discovery'
  const settings = [
    { key: 'booking_link_shared', value: shared },
    { key: 'booking_link_alex', value: '' },
    { key: 'booking_link_jordan', value: '' },
  ]
  for (const s of settings) {
    await prisma.setting.upsert({ where: { key: s.key }, update: {}, create: s })
  }
  console.log('Seeded settings. No leads seeded (by design).')
}

main().finally(() => prisma.$disconnect())
