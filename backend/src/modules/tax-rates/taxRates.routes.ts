import { Router } from 'express';
import { authenticate } from '../../middleware/authMiddleware';
import { authorize } from '../../middleware/rbacMiddleware';
import { taxRatesController } from './taxRates.controller';

/**
 * Step 5 B5: view-only for Manager, full config (incl. history + create)
 * Admin-only, per "Tax configuration remains Admin-controlled."
 */
export const taxRatesRouter = Router();

taxRatesRouter.get(
  '/',
  authenticate,
  authorize('MANAGER', 'ADMIN'),
  taxRatesController.listCurrent,
);
taxRatesRouter.get('/history', authenticate, authorize('ADMIN'), taxRatesController.listHistory);
taxRatesRouter.post('/', authenticate, authorize('ADMIN'), taxRatesController.create);
