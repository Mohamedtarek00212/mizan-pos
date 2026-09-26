import { PoolClient } from 'pg';
import { pool } from '../../db/pool';
import { SetupStatus } from './setup.types';

export const setupRepository = {
  async status(): Promise<SetupStatus> {
    const result = await pool.query<{
      initialized: boolean;
      store_name: string | null;
      currency_code: string | null;
    }>(
      `SELECT EXISTS(SELECT 1 FROM users) AS initialized,
              (SELECT store_name FROM store_settings WHERE id = 1) AS store_name,
              (SELECT currency_code FROM store_settings WHERE id = 1) AS currency_code`,
    );
    const row = result.rows[0];
    return {
      initialized: row?.initialized ?? false,
      store_name: row?.store_name ?? null,
      currency_code: row?.currency_code ?? null,
    };
  },

  async lock(client: PoolClient): Promise<void> {
    await client.query('SELECT pg_advisory_xact_lock($1)', [150002]);
  },

  async isInitialized(client: PoolClient): Promise<boolean> {
    const result = await client.query<{ initialized: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM store_settings WHERE id = 1)
           OR EXISTS(SELECT 1 FROM users) AS initialized`,
    );
    return result.rows[0]?.initialized ?? false;
  },
};
