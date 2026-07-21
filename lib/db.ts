import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

const g = globalThis as unknown as { prisma?: PrismaClient }

function createPrismaClient() {
  const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? 'file:./data/clarity.db' })
  return new PrismaClient({ adapter })
}

export const prisma = g.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') g.prisma = prisma
