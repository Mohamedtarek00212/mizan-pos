import { Router } from 'express';
import { authenticate } from '../../middleware/authMiddleware';
import { authorize } from '../../middleware/rbacMiddleware';
import { inventoryController } from './inventory.controller';

export const inventoryRouter = Router();
inventoryRouter.use(authenticate, authorize('INVENTORY_STAFF', 'MANAGER', 'ADMIN'));
inventoryRouter.get('/', inventoryController.list);
inventoryRouter.get('/low-stock', inventoryController.lowStock);
