import pino from 'pino';
import { env } from './env';

/**
 * Structured technical/operational logger (Step 5 A16).
 * This is separate from the business `audit_logs` mechanism, which will be
 * implemented as part of the Audit module in a later phase.
 *
 * Kept dependency-light for Phase 0: emits structured JSON lines. A
 * human-readable dev transport (e.g. pino-pretty) can be added later
 * without changing this module's interface.
 */
export const logger = pino({
  level: env.logLevel,
});
