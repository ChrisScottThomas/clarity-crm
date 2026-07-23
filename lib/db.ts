import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaPg } from '@prisma/adapter-pg'
import { chooseAdapter } from './db-adapter'

const g = globalThis as unknown as { prisma?: PrismaClient }

// The client in app/generated/prisma was generated for one provider
// (npm run db:generate reads DATABASE_URL). If the URL points at the other
// provider at runtime, Prisma rejects the adapter at construction with a
// clear provider-mismatch error — regenerate with the right DATABASE_URL.
function createPrismaClient() {
  const choice = chooseAdapter(process.env.DATABASE_URL, process.env.DATABASE_POOL_MAX)
  const adapter =
    choice.kind === 'sqlite'
      ? new PrismaBetterSqlite3({ url: choice.url })
      : new PrismaPg({
          connectionString: choice.connectionString,
          ...(choice.max !== undefined ? { max: choice.max } : {}),
        })
  return new PrismaClient({ adapter })
}

export const prisma = g.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') g.prisma = prisma
