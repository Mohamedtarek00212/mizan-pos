import { NextFunction, Request, Response } from 'express';
import { ValidationError } from '../../common/errors';
import { rolesService } from './roles.service';

export const rolesController = {
  async list(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const roles = await rolesService.listRolesWithPermissions();
      res.status(200).json({ roles });
    } catch (err) {
      next(err);
    }
  },

  async updatePermissions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const roleId = Number(req.params.id);
      if (!Number.isInteger(roleId)) {
        throw new ValidationError('Invalid role id');
      }
      const { permissions } = req.body ?? {};
      if (!Array.isArray(permissions) || !permissions.every((p) => typeof p === 'string')) {
        throw new ValidationError('permissions must be an array of permission key strings');
      }
      const updated = await rolesService.updatePermissions(roleId, permissions, req.user!.id);
      res.status(200).json(updated);
    } catch (err) {
      next(err);
    }
  },
};
