import { NextFunction, Request, Response } from 'express';
import { ValidationError } from '../../common/errors';
import { setupService } from './setup.service';

function requiredText(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== 'string') throw new ValidationError(`${field} is required`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new ValidationError(`${field} must be between ${min} and ${max} characters`);
  }
  return normalized;
}

export const setupController = {
  async status(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json(await setupService.status());
    } catch (error) {
      next(error);
    }
  },

  async initialize(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeName = requiredText(req.body?.store_name, 'store_name', 2, 100);
      const adminFullName = requiredText(req.body?.admin_full_name, 'admin_full_name', 2, 100);
      const adminUsername = requiredText(req.body?.admin_username, 'admin_username', 3, 50);
      const adminPassword = requiredText(req.body?.admin_password, 'admin_password', 10, 128);
      const registerCode = requiredText(req.body?.register_code, 'register_code', 1, 20).toUpperCase();
      const registerName = requiredText(req.body?.register_name, 'register_name', 2, 100);
      const taxRatePct = req.body?.tax_rate_pct;

      if (!/^[A-Za-z0-9._-]+$/.test(adminUsername)) {
        throw new ValidationError('admin_username may contain letters, numbers, dot, underscore, and hyphen only');
      }
      if (!/[a-z]/.test(adminPassword) || !/[A-Z]/.test(adminPassword) || !/\d/.test(adminPassword)) {
        throw new ValidationError('admin_password must include uppercase, lowercase, and a number');
      }
      if (!/^[A-Z0-9_-]+$/.test(registerCode)) {
        throw new ValidationError('register_code may contain letters, numbers, underscore, and hyphen only');
      }
      if (typeof taxRatePct !== 'number' || !Number.isFinite(taxRatePct) || taxRatePct < 0 || taxRatePct > 100) {
        throw new ValidationError('tax_rate_pct must be a number between 0 and 100');
      }

      const result = await setupService.initialize({
        storeName,
        adminFullName,
        adminUsername,
        adminPassword,
        registerCode,
        registerName,
        taxRatePct,
      });
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  },
};
