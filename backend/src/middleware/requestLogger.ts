import pinoHttp from 'pino-http';
import { logger } from '../config/logger';

/**
 * Structured per-request logging middleware (Step 5 A16 - technical log
 * stream, kept separate from the business audit_logs mechanism).
 */
export const requestLogger = pinoHttp({ logger });
