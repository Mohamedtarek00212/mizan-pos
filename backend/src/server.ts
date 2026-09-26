import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { pool } from './db/pool';
import { runMigrations } from './db/migrate';
import type { Server } from 'node:http';

let server: Server | null = null;

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Graceful shutdown started');
  if (!server) {
    await pool.end();
    process.exit(0);
  }
  server.close(async (serverError) => {
    try {
      await pool.end();
      if (serverError) throw serverError;
      logger.info('Graceful shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Graceful shutdown failed');
      process.exit(1);
    }
  });
  server.closeIdleConnections();
  setTimeout(() => {
    logger.error('Graceful shutdown timed out');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

async function start(): Promise<void> {
  if (env.runMigrationsOnStart) {
    await runMigrations();
  }
  const app = createApp();
  server = app.listen(env.port, env.host, () => {
    logger.info(`POS backend listening on ${env.host}:${env.port} (${env.nodeEnv})`);
  });
}

void start().catch(async (err: unknown) => {
  logger.error({ err }, 'POS backend failed to start');
  await pool.end().catch(() => undefined);
  process.exit(1);
});
