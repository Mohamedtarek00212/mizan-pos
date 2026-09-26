import { Router } from 'express';
import { authenticate } from '../../middleware/authMiddleware';
import { authorize } from '../../middleware/rbacMiddleware';
import { reportsController } from './reports.controller';

export const reportsRouter = Router();
reportsRouter.use(authenticate, authorize('MANAGER', 'ADMIN'));
reportsRouter.get('/sales-summary', reportsController.sales);
reportsRouter.get('/cash-reconciliation', reportsController.cash);
reportsRouter.get('/inventory-status', reportsController.inventory);
reportsRouter.get('/returns-refunds', reportsController.returns);
