import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// Singleton Prisma client; log queries only in development to avoid log spam
export const prisma =
  global.__prisma ||
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? [{ emit: 'event', level: 'query' }, 'warn']
        : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}

// $on types vary across Prisma versions; use a cast to avoid version-specific overload mismatch
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(prisma as any).$on?.('error', (e: { message: string }) => {
  logger.error('Prisma error', { message: e.message });
});

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
