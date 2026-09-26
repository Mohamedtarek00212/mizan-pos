import { Router } from 'express';
import { healthController } from './health.controller';

export const healthRouter = Router();

healthRouter.get('/', healthController.check);
healthRouter.get('/live', healthController.live);
healthRouter.get('/ready', healthController.check);
