import { Router } from 'express';
import { authenticate } from '../../middleware/authMiddleware';
import { authorize } from '../../middleware/rbacMiddleware';
import { categoriesController } from './categories.controller';

/**
 * Step 5 B3: GET is any authenticated role; mutations are Inventory Staff,
 * Manager, Admin (never Cashier).
 */
export const categoriesRouter = Router();

categoriesRouter.get('/', authenticate, categoriesController.list);
categoriesRouter.post(
  '/',
  authenticate,
  authorize('INVENTORY_STAFF', 'MANAGER', 'ADMIN'),
  categoriesController.create,
);
categoriesRouter.get('/:id', authenticate, categoriesController.getById);
categoriesRouter.patch(
  '/:id',
  authenticate,
  authorize('INVENTORY_STAFF', 'MANAGER', 'ADMIN'),
  categoriesController.update,
);
