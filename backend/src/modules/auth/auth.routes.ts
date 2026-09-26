import { Router } from 'express';
import { authenticate } from '../../middleware/authMiddleware';
import { loginRateLimit } from '../../middleware/loginRateLimit';
import { authController } from './auth.controller';

export const authRouter = Router();

authRouter.post('/login', loginRateLimit, authController.login);
authRouter.post('/logout', authenticate, authController.logout);
authRouter.get('/me', authenticate, authController.me);
