import { Router } from 'express';
import { authenticate } from '../../middleware/authMiddleware';
import { authorize } from '../../middleware/rbacMiddleware';
import { approvalsController } from './approvals.controller';

export const approvalsRouter = Router();

approvalsRouter.get('/', authenticate, authorize('MANAGER', 'ADMIN'), approvalsController.list);
approvalsRouter.get(
  '/:id',
  authenticate,
  authorize('CASHIER', 'MANAGER', 'ADMIN'),
  approvalsController.get,
);
approvalsRouter.post(
  '/:id/inline-decision',
  authenticate,
  authorize('CASHIER', 'MANAGER', 'ADMIN'),
  approvalsController.decideInline,
);
approvalsRouter.post(
  '/:id/decision',
  authenticate,
  authorize('MANAGER', 'ADMIN'),
  approvalsController.decide,
);
