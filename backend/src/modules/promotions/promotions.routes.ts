import { Router } from 'express';
import { authenticate } from '../../middleware/authMiddleware';
import { authorize } from '../../middleware/rbacMiddleware';
import { promotionsController } from './promotions.controller';

export const promotionsRouter = Router();

promotionsRouter.get('/', authenticate, authorize('MANAGER', 'ADMIN'), promotionsController.list);
promotionsRouter.post(
  '/',
  authenticate,
  authorize('MANAGER', 'ADMIN'),
  promotionsController.create,
);
promotionsRouter.patch(
  '/:id',
  authenticate,
  authorize('MANAGER', 'ADMIN'),
  promotionsController.setActive,
);
