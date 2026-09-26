import { Router } from 'express';
import { approvalThresholdsRouter } from '../modules/approval-thresholds/approvalThresholds.routes';
import { approvalsRouter } from '../modules/approvals/approvals.routes';
import { authRouter } from '../modules/auth/auth.routes';
import { categoriesRouter } from '../modules/categories/categories.routes';
import { healthRouter } from '../modules/health/health.routes';
import { inventoryRouter } from '../modules/inventory/inventory.routes';
import { productsRouter } from '../modules/products/products.routes';
import { promotionsRouter } from '../modules/promotions/promotions.routes';
import { registersRouter } from '../modules/registers/registers.routes';
import { returnsRouter } from '../modules/returns/returns.routes';
import { rolesRouter } from '../modules/roles/roles.routes';
import { salesRouter } from '../modules/sales/sales.routes';
import { taxRatesRouter } from '../modules/tax-rates/taxRates.routes';
import { usersRouter } from '../modules/users/users.routes';
import { reportsRouter } from '../modules/reports/reports.routes';
import { auditRouter } from '../modules/audit/audit.routes';
import { setupRouter } from '../modules/setup/setup.routes';

/**
 * Root API router (Step 5 A1 - modular monolith: each domain module
 * mounts its own router here). Additional modules (sales, inventory,
 * etc.) will register their routers here in later phases.
 */
export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/setup', setupRouter);
apiRouter.use('/reports', reportsRouter);
apiRouter.use('/audit-logs', auditRouter);
apiRouter.use('/inventory', inventoryRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/roles', rolesRouter);
apiRouter.use('/approval-thresholds', approvalThresholdsRouter);
apiRouter.use('/approvals', approvalsRouter);
apiRouter.use('/categories', categoriesRouter);
apiRouter.use('/products', productsRouter);
apiRouter.use('/promotions', promotionsRouter);
apiRouter.use('/registers', registersRouter);
apiRouter.use('/returns', returnsRouter);
apiRouter.use('/sales', salesRouter);
apiRouter.use('/tax-rates', taxRatesRouter);
