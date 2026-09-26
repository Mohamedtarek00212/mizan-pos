import { NextFunction, Request, Response } from 'express';
import { ValidationError } from '../../common/errors';
import { promotionsService } from './promotions.service';

export const promotionsController = {
  async list(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ promotions: await promotionsService.list() });
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body ?? {};
      const startsAt = new Date(body.starts_at);
      const endsAt = new Date(body.ends_at);
      if (typeof body.name !== 'string') throw new ValidationError('name is required');
      if (body.scope !== 'GENERAL' && body.scope !== 'CATEGORY' && body.scope !== 'PRODUCT')
        throw new ValidationError('Invalid promotion scope');
      if (body.discount_type !== 'PERCENT' && body.discount_type !== 'FIXED')
        throw new ValidationError('Invalid discount type');
      if (typeof body.discount_value !== 'number')
        throw new ValidationError('discount_value must be a number');
      if (
        body.product_id !== undefined &&
        (!Number.isInteger(body.product_id) || body.product_id <= 0)
      )
        throw new ValidationError('product_id must be a positive integer');
      if (
        body.category_id !== undefined &&
        (!Number.isInteger(body.category_id) || body.category_id <= 0)
      )
        throw new ValidationError('category_id must be a positive integer');
      if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()))
        throw new ValidationError('Valid starts_at and ends_at are required');
      const created = await promotionsService.create(req.user!, {
        name: body.name,
        scope: body.scope,
        productId: body.product_id,
        categoryId: body.category_id,
        discountType: body.discount_type,
        discountValue: body.discount_value,
        startsAt,
        endsAt,
      });
      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  },

  async setActive(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || typeof req.body?.is_active !== 'boolean')
        throw new ValidationError('Valid id and is_active are required');
      res.status(200).json(await promotionsService.setActive(req.user!, id, req.body.is_active));
    } catch (err) {
      next(err);
    }
  },
};
