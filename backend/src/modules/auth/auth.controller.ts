import { NextFunction, Request, Response } from 'express';
import { ValidationError } from '../../common/errors';
import { clearLoginRateLimit } from '../../middleware/loginRateLimit';
import { authService } from './auth.service';

/**
 * Controller layer (Step 5 A5) - request/response shaping only, no
 * business logic. Mirrors Step 5 B1 `/auth/login` and `/auth/me`.
 */
export const authController = {
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { username, password } = req.body ?? {};
      if (
        typeof username !== 'string' ||
        typeof password !== 'string' ||
        !username.trim() ||
        !password ||
        username.length > 100 ||
        password.length > 1024
      ) {
        throw new ValidationError('username and password are required');
      }
      const { token, user } = await authService.login(username.trim(), password);
      clearLoginRateLimit(req.ip ?? req.socket.remoteAddress ?? 'unknown');
      res.status(200).json({
        access_token: token,
        user_id: user.id,
        role: user.role,
      });
    } catch (err) {
      next(err);
    }
  },

  async me(req: Request, res: Response): Promise<void> {
    // `req.user` is populated by the `authenticate` middleware.
    res.status(200).json({
      user_id: req.user!.id,
      username: req.user!.username,
      full_name: req.user!.fullName,
      role: req.user!.role,
      is_active: req.user!.isActive,
    });
  },

  async logout(_req: Request, res: Response): Promise<void> {
    // Stateless JWT: nothing to invalidate server-side (Step 5 B1). The
    // client is responsible for discarding the token.
    res.status(204).send();
  },
};
