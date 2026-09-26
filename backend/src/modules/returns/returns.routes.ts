import { Router } from 'express';
import { authenticate } from '../../middleware/authMiddleware';
import { authorize } from '../../middleware/rbacMiddleware';
import { returnsController } from './returns.controller';

export const returnsRouter = Router();

returnsRouter.post(
  '/',
  authenticate,
  authorize('CASHIER', 'MANAGER', 'ADMIN'),
  returnsController.create,
);
returnsRouter.get('/', authenticate, authorize('MANAGER', 'ADMIN'), returnsController.list);
returnsRouter.get(
  '/:id',
  authenticate,
  authorize('CASHIER', 'MANAGER', 'ADMIN'),
  returnsController.get,
);
returnsRouter.get(
  '/:id/refunds',
  authenticate,
  authorize('CASHIER', 'MANAGER', 'ADMIN'),
  returnsController.refunds,
);
returnsRouter.post(
  '/:id/refunds/retry',
  authenticate,
  authorize('MANAGER', 'ADMIN'),
  returnsController.retry,
);
