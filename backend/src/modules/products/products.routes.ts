import { Router } from 'express';
import { authenticate } from '../../middleware/authMiddleware';
import { authorize } from '../../middleware/rbacMiddleware';
import { productsController } from './products.controller';
import { inventoryController } from '../inventory/inventory.controller';

/**
 * Step 5 B4: list/get is any authenticated role; barcode lookup is
 * Cashier/Manager/Admin; mutations are Inventory Staff, Manager, Admin
 * (never Cashier, PR-02). `/barcode/:barcode` must be registered before
 * `/:id` so Express doesn't treat "barcode" as an `:id` value.
 */
export const productsRouter = Router();

productsRouter.get('/', authenticate, productsController.list);
productsRouter.post(
  '/',
  authenticate,
  authorize('INVENTORY_STAFF', 'MANAGER', 'ADMIN'),
  productsController.create,
);
productsRouter.get(
  '/barcode/:barcode',
  authenticate,
  authorize('CASHIER', 'MANAGER', 'ADMIN'),
  productsController.getByBarcode,
);
productsRouter.get('/:id', authenticate, productsController.getById);
productsRouter.post(
  '/:id/stock/add',
  authenticate,
  authorize('INVENTORY_STAFF', 'MANAGER', 'ADMIN'),
  inventoryController.add,
);
productsRouter.post(
  '/:id/stock/adjust',
  authenticate,
  authorize('INVENTORY_STAFF', 'MANAGER', 'ADMIN'),
  inventoryController.adjust,
);
productsRouter.get(
  '/:id/stock/movements',
  authenticate,
  authorize('INVENTORY_STAFF', 'MANAGER', 'ADMIN'),
  inventoryController.movements,
);
productsRouter.patch(
  '/:id',
  authenticate,
  authorize('INVENTORY_STAFF', 'MANAGER', 'ADMIN'),
  productsController.update,
);
productsRouter.patch(
  '/:id/deactivate',
  authenticate,
  authorize('INVENTORY_STAFF', 'MANAGER', 'ADMIN'),
  productsController.deactivate,
);
