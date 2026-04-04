import { PrismaClient } from '@/app/generated/prisma'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import path from 'path'

const dbPath = path.resolve(process.cwd(), 'dev.db')

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  const adapter = new PrismaBetterSqlite3({ url: dbPath })
  return new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0])
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
