import { Router } from 'express';
import { authenticate } from '../../middleware/authMiddleware';
import { authorize } from '../../middleware/rbacMiddleware';
import { auditController } from './audit.controller';

export const auditRouter = Router();
auditRouter.use(authenticate, authorize('MANAGER', 'ADMIN'));
auditRouter.get('/', auditController.list);
auditRouter.get('/:id', auditController.get);
