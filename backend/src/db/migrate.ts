import fs from 'fs';
import path from 'path';
import { pool } from './pool';
import { logger } from '../config/logger';

/**
 * Minimal, dependency-free migration runner (Step 5 A14 - business schema
 * lives in versioned DB tables, but the schema itself still needs a simple,
 * auditable way to move forward). Applies any `.sql` file under
 * `backend/migrations/` not yet recorded in `schema_migrations`, in
 * filename order, each inside its own transaction.
 */

const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR
  ? path.resolve(process.env.MIGRATIONS_DIR)
  : path.resolve(__dirname, '../../migrations');

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    VARCHAR(255) PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const result = await pool.query<{ filename: string }>('SELECT filename FROM schema_migrations');
  return new Set(result.rows.map((r) => r.filename));
}

export async function runMigrations(): Promise<void> {
  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      logger.info(`Applied migration: ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error({ err, file }, 'Migration failed');
      throw err;
    } finally {
      client.release();
    }
  }
}

// Bundlers flatten this module into the server entry, where `require.main ===
// module` is also true. In auto-migrate server mode, `server.ts` owns the one
// migration invocation and this CLI block must stay inactive.
if (require.main === module && process.env.RUN_MIGRATIONS_ON_START !== 'true') {
  runMigrations()
    .then(() => {
      logger.info('All migrations applied successfully');
      return pool.end();
    })
    .catch((err) => {
      logger.error({ err }, 'Migration run failed');
      process.exit(1);
    });
}
