import { Request, Response } from 'express';
import { checkDatabaseConnection } from '../../db/pool';

/**
 * Health check (Phase 0 task 8). Reports process liveness plus DB
 * connectivity, so deployment/dev-setup issues are visible immediately.
 */
export const healthController = {
  async live(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  },

  async check(_req: Request, res: Response): Promise<void> {
    const dbConnected = await checkDatabaseConnection();
    res.status(dbConnected ? 200 : 503).json({
      status: dbConnected ? 'ok' : 'degraded',
      database: dbConnected ? 'connected' : 'unreachable',
      timestamp: new Date().toISOString(),
    });
  },
};
