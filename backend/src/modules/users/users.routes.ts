import { Router } from 'express';
import { authenticate } from '../../middleware/authMiddleware';
import { authorize, requirePermission } from '../../middleware/rbacMiddleware';
import { usersController } from './users.controller';

export const usersRouter = Router();

usersRouter.get('/', authenticate, authorize('MANAGER', 'ADMIN'), usersController.list);
usersRouter.post(
  '/',
  authenticate,
  authorize('MANAGER', 'ADMIN'),
  requirePermission('manage_users'),
  usersController.create,
);
usersRouter.get('/:id', authenticate, authorize('MANAGER', 'ADMIN'), usersController.getById);
usersRouter.patch(
  '/:id',
  authenticate,
  authorize('MANAGER', 'ADMIN'),
  requirePermission('manage_users'),
  usersController.update,
);
