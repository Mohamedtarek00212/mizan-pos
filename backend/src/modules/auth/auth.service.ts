import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { AuthenticationError } from '../../common/errors';
import { authRepository } from './auth.repository';
import { AuthenticatedUser, JwtPayload } from './auth.types';

/**
 * Business/service layer for authentication (Step 5 A5).
 * Implements the core login mechanism (Step 3 W-01) as infrastructure;
 * full authentication behavior (password reset, refresh tokens, lockout
 * policies) is explicitly deferred to a later feature phase.
 */
export const authService = {
  async login(
    username: string,
    password: string,
  ): Promise<{ token: string; user: AuthenticatedUser }> {
    const row = await authRepository.findActiveUserByUsername(username);
    if (!row) {
      throw new AuthenticationError('Invalid username or password');
    }
    if (!row.is_active) {
      throw new AuthenticationError('This account has been deactivated');
    }

    const passwordMatches = await bcrypt.compare(password, row.password_hash);
    if (!passwordMatches) {
      throw new AuthenticationError('Invalid username or password');
    }

    const payload: JwtPayload = { userId: row.id, role: row.role_name };
    const signOptions: jwt.SignOptions = {
      expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'],
    };
    const token = jwt.sign(payload, env.jwtSecret, signOptions);

    return {
      token,
      user: {
        id: row.id,
        username: row.username,
        fullName: row.full_name,
        role: row.role_name,
        roleId: row.role_id,
        isActive: row.is_active,
      },
    };
  },

  verifyToken(token: string): JwtPayload {
    try {
      return jwt.verify(token, env.jwtSecret) as JwtPayload;
    } catch {
      throw new AuthenticationError('Invalid or expired token');
    }
  },

  /**
   * Live re-check of the token subject's current status (Step 5 A4 -
   * deactivation/role changes must apply immediately, UP-05/UP-06). This is
   * called on every authenticated request, never trusting the JWT claims
   * alone for authorization decisions.
   */
  async getLiveUser(userId: number): Promise<AuthenticatedUser> {
    const user = await authRepository.findAuthenticatedUserById(userId);
    if (!user || !user.isActive) {
      throw new AuthenticationError('Account is no longer active');
    }
    return user;
  },
};
