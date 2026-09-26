import { Router } from 'express';
import { authenticate } from '../../middleware/authMiddleware';
import { authorize } from '../../middleware/rbacMiddleware';
import { rolesController } from './roles.controller';

export const rolesRouter = Router();

rolesRouter.get('/', authenticate, authorize('ADMIN'), rolesController.list);
rolesRouter.patch(
  '/:id/permissions',
  authenticate,
  authorize('ADMIN'),
  rolesController.updatePermissions,
);
