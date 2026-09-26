import { Router } from 'express';
import { authenticate } from '../../middleware/authMiddleware';
import { authorize } from '../../middleware/rbacMiddleware';
import { approvalThresholdsController } from './approvalThresholds.controller';

export const approvalThresholdsRouter = Router();

approvalThresholdsRouter.get(
  '/:role',
  authenticate,
  authorize('MANAGER', 'ADMIN'),
  approvalThresholdsController.getCurrent,
);
approvalThresholdsRouter.get(
  '/:role/history',
  authenticate,
  authorize('ADMIN'),
  approvalThresholdsController.getHistory,
);
approvalThresholdsRouter.post(
  '/:role',
  authenticate,
  authorize('ADMIN'),
  approvalThresholdsController.create,
);
