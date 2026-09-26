import { Pool } from 'pg';
import { env } from '../config/env';
import { logger } from '../config/logger';

/**
 * Shared PostgreSQL connection pool (Step 5 A6 - Repository layer depends on
 * this single connection source; Step 4 data model is the schema target).
 *
 * The schema is managed by versioned migrations; this module owns
 * connectivity and the health-check query used by `/health`.
 */
export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: env.dbPoolMax,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected PostgreSQL pool error');
});

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (err) {
    logger.error({ err }, 'Database connection check failed');
    return false;
  }
}
