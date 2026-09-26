import { Router } from 'express';
import { authenticate } from '../../middleware/authMiddleware';
import { authorize } from '../../middleware/rbacMiddleware';
import { registersController } from './registers.controller';
import { registerSessionsController } from './registerSessions.controller';

/**
 * Step 5 B7: list is Cashier/Manager/Admin; opening a session is
 * Cashier-only; reading the current session is Cashier/Manager/Admin;
 * closing is the owning Cashier or a Manager/Admin force-close (enforced
 * inside the service, since it depends on session ownership, not just
 * role).
 */
export const registersRouter = Router();

registersRouter.get(
  '/',
  authenticate,
  authorize('CASHIER', 'MANAGER', 'ADMIN'),
  registersController.list,
);

registersRouter.get(
  '/sessions/current',
  authenticate,
  authorize('CASHIER', 'MANAGER', 'ADMIN'),
  registerSessionsController.getMyCurrent,
);

registersRouter.post(
  '/:id/sessions',
  authenticate,
  authorize('CASHIER'),
  registerSessionsController.open,
);

registersRouter.get(
  '/:id/sessions/current',
  authenticate,
  authorize('CASHIER', 'MANAGER', 'ADMIN'),
  registerSessionsController.getCurrent,
);

registersRouter.post(
  '/:id/sessions/:sessionId/close',
  authenticate,
  authorize('CASHIER', 'MANAGER', 'ADMIN'),
  registerSessionsController.close,
);
