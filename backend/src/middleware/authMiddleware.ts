import { NextFunction, Request, Response } from 'express';
import { AuthenticationError } from '../common/errors';
import { authService } from '../modules/auth/auth.service';

/**
 * JWT authentication middleware (Step 5 A4).
 *
 * The token identifies WHO is calling; on every request we re-fetch the
 * user's LIVE status/role from the database rather than trusting the JWT
 * claims alone, so deactivation/role changes (UP-05/UP-06) take effect
 * immediately even though the token itself cannot be revoked mid-life.
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new AuthenticationError('Missing or malformed Authorization header');
    }
    const token = header.slice('Bearer '.length);
    const payload = authService.verifyToken(token);
    req.user = await authService.getLiveUser(payload.userId);
    next();
  } catch (err) {
    next(err);
  }
}
