import { Router } from 'express';
import { setupController } from './setup.controller';

export const setupRouter = Router();

// Intentionally public. Initialization itself is atomically disabled forever
// as soon as the first user/store record exists.
setupRouter.get('/status', setupController.status);
setupRouter.post('/initialize', setupController.initialize);
