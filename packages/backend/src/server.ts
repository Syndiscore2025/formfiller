import app from './app';
import { config } from './config';
import { prisma } from './lib/prisma';
import { startAbandonmentDetector } from './jobs/abandonmentDetector';

async function start(): Promise<void> {
  try {
    await prisma.$connect();
    console.log('✅ Database connected');

    startAbandonmentDetector();

    const server = app.listen(config.port, () => {
      console.log(`🚀 Server running on port ${config.port} [${config.nodeEnv}]`);
    });

    const shutdown = async (signal: string): Promise<void> => {
      console.log(`\n${signal} received. Shutting down gracefully...`);
      server.close(async () => {
        await prisma.$disconnect();
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    console.error('Failed to start server:', err);
    await prisma.$disconnect();
    process.exit(1);
  }
}

start();

