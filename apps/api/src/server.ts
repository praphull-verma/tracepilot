import app from './app';
import { config } from './config';
import { logger } from './utils/logger';
import { prisma } from './config/database';

const PORT = config.port;

async function main() {
  // Test database connection
  try {
    await prisma.$queryRaw`SELECT 1`;
    logger.info('Database connection established');
  } catch (err) {
    logger.warn('Database connection failed — running in degraded mode', {
      error: (err as Error).message,
    });
  }

  const server = app.listen(PORT, () => {
    logger.info(`TracePilot API started`, {
      port: PORT,
      env: config.env,
      demoMode: config.demoMode,
      frontendUrl: config.frontendUrl,
    });
    console.log(`\n🚀 TracePilot API running at http://localhost:${PORT}`);
    console.log(`📊 Demo mode: ${config.demoMode}`);
    console.log(`🔗 Health: http://localhost:${PORT}/api/health\n`);
  });

  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down gracefully');
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  });
}

main().catch((err) => {
  logger.error('Fatal error', { error: (err as Error).message });
  process.exit(1);
});
