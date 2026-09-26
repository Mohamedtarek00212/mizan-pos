import { NextFunction, Request, Response } from 'express';
import { ValidationError } from '../../common/errors';
import { categoriesService } from './categories.service';

export const categoriesController = {
  async list(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const categories = await categoriesService.listCategories();
      res.status(200).json({ categories });
    } catch (err) {
      next(err);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        throw new ValidationError('Invalid category id');
      }
      const category = await categoriesService.getCategory(id);
      res.status(200).json(category);
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name } = req.body ?? {};
      if (typeof name !== 'string' || !name) {
        throw new ValidationError('name is required');
      }
      const created = await categoriesService.createCategory(req.user!.id, name);
      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        throw new ValidationError('Invalid category id');
      }
      const { name } = req.body ?? {};
      if (typeof name !== 'string' || !name) {
        throw new ValidationError('name is required');
      }
      const updated = await categoriesService.renameCategory(req.user!.id, id, name);
      res.status(200).json(updated);
    } catch (err) {
      next(err);
    }
  },
};
