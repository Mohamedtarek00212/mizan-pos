import cors from 'cors';
import express, { Express } from 'express';
import helmet from 'helmet';
import { AuthorizationError } from './common/errors';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { apiRouter } from './routes';

/**
 * Express application assembly (Step 5 A1/A17).
 * Kept as a pure factory function (no side effects like listening) so it
 * can be imported directly by tests (supertest) without starting a server.
 */
export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  if (env.trustProxy) app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || env.corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new AuthorizationError('Origin is not allowed by CORS'));
      },
    }),
  );
  app.use(express.json({ limit: '256kb' }));
  app.use(requestLogger);

  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
