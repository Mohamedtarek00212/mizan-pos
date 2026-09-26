import { NextFunction, Request, Response } from 'express';
import { ValidationError } from '../../common/errors';
import { Role } from '../auth/auth.types';
import { usersService } from './users.service';

const VALID_ROLES: Role[] = ['CASHIER', 'MANAGER', 'INVENTORY_STAFF', 'ADMIN'];

function isValidRole(value: unknown): value is Role {
  return typeof value === 'string' && VALID_ROLES.includes(value as Role);
}

export const usersController = {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { username, password, full_name, role } = req.body ?? {};
      if (
        typeof username !== 'string' ||
        !username ||
        typeof password !== 'string' ||
        !password ||
        typeof full_name !== 'string' ||
        !full_name ||
        !isValidRole(role)
      ) {
        throw new ValidationError('username, password, full_name, and a valid role are required');
      }
      if (password.length < 8) {
        throw new ValidationError('Password must be at least 8 characters');
      }

      const created = await usersService.createUser(req.user!, {
        username,
        password,
        fullName: full_name,
        role,
      });
      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  },

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { role, is_active } = req.query;
      if (role !== undefined && !isValidRole(role)) {
        throw new ValidationError('Invalid role filter');
      }
      const filters = {
        role: role as Role | undefined,
        isActive: is_active === undefined ? undefined : is_active === 'true',
      };
      const users = await usersService.listUsers(req.user!, filters);
      res.status(200).json({ users });
    } catch (err) {
      next(err);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        throw new ValidationError('Invalid user id');
      }
      const user = await usersService.getUserById(req.user!, id);
      res.status(200).json(user);
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        throw new ValidationError('Invalid user id');
      }
      const { full_name, role, is_active, password } = req.body ?? {};

      if (role !== undefined && !isValidRole(role)) {
        throw new ValidationError('Invalid role');
      }
      if (full_name !== undefined && typeof full_name !== 'string') {
        throw new ValidationError('full_name must be a string');
      }
      if (is_active !== undefined && typeof is_active !== 'boolean') {
        throw new ValidationError('is_active must be a boolean');
      }
      if (password !== undefined && typeof password !== 'string') {
        throw new ValidationError('password must be a string');
      }

      const updated = await usersService.updateUser(req.user!, id, {
        fullName: full_name,
        role,
        isActive: is_active,
        password,
      });
      res.status(200).json(updated);
    } catch (err) {
      next(err);
    }
  },
};
