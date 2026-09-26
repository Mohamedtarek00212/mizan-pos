import { Router } from 'express';
import { authenticate } from '../../middleware/authMiddleware';
import { authorize } from '../../middleware/rbacMiddleware';
import { salesController } from './sales.controller';

/**
 * Step 5 B8: Sales/Checkout endpoints. All operations are Cashier-facing
 * (Managers/Admins can also view via future reporting screens). The service
 * layer enforces register-session ownership and sale-state legality.
 */
export const salesRouter = Router();

salesRouter.post(
  '/',
  authenticate,
  authorize('CASHIER', 'MANAGER', 'ADMIN'),
  salesController.create,
);
salesRouter.get('/held', authenticate, authorize('CASHIER'), salesController.listHeld);
salesRouter.get(
  '/receipt/:receiptNumber',
  authenticate,
  authorize('CASHIER', 'MANAGER', 'ADMIN'),
  salesController.getByReceipt,
);
salesRouter.get(
  '/:saleId',
  authenticate,
  authorize('CASHIER', 'MANAGER', 'ADMIN'),
  salesController.getById,
);
salesRouter.post(
  '/:saleId/items',
  authenticate,
  authorize('CASHIER', 'MANAGER', 'ADMIN'),
  salesController.addItem,
);
salesRouter.patch(
  '/:saleId/items/:itemId',
  authenticate,
  authorize('CASHIER', 'MANAGER', 'ADMIN'),
  salesController.updateItem,
);
salesRouter.post(
  '/:saleId/discounts',
  authenticate,
  authorize('CASHIER'),
  salesController.applyDiscount,
);
salesRouter.post(
  '/:saleId/promotions/apply',
  authenticate,
  authorize('CASHIER'),
  salesController.applyBestPromotion,
);
salesRouter.post(
  '/:saleId/payments/cash',
  authenticate,
  authorize('CASHIER', 'MANAGER', 'ADMIN'),
  salesController.recordCashPayment,
);
salesRouter.post('/:saleId/hold', authenticate, authorize('CASHIER'), salesController.hold);
salesRouter.post('/:saleId/resume', authenticate, authorize('CASHIER'), salesController.resume);
salesRouter.post(
  '/:saleId/payments/card',
  authenticate,
  authorize('CASHIER', 'MANAGER', 'ADMIN'),
  salesController.recordCardPayment,
);
salesRouter.post(
  '/:saleId/complete',
  authenticate,
  authorize('CASHIER', 'MANAGER', 'ADMIN'),
  salesController.complete,
);
salesRouter.post(
  '/:saleId/void',
  authenticate,
  authorize('CASHIER', 'MANAGER', 'ADMIN'),
  salesController.void,
);
