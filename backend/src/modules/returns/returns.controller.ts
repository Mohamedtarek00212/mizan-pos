import { NextFunction, Request, Response } from 'express';
import { ValidationError } from '../../common/errors';
import { returnsService } from './returns.service';

function idFrom(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new ValidationError('Invalid return id');
  return id;
}

export const returnsController = {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sale_id, items, reason } = req.body ?? {};
      if (sale_id !== undefined && (!Number.isInteger(sale_id) || sale_id <= 0))
        throw new ValidationError('sale_id must be a positive integer');
      if (!Array.isArray(items) || typeof reason !== 'string')
        throw new ValidationError('items and reason are required');
      const result = await returnsService.create(req.user!, {
        saleId: sale_id,
        reason,
        items: items.map((item: unknown) => {
          const value = item as Record<string, unknown>;
          return {
            saleItemId: typeof value.sale_item_id === 'number' ? value.sale_item_id : undefined,
            productId: typeof value.product_id === 'number' ? value.product_id : undefined,
            quantity: value.quantity as number,
            resellable: value.resellable as boolean,
          };
        }),
      });
      res.status(result.approval_pending ? 202 : 201).json(result);
    } catch (err) {
      next(err);
    }
  },

  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json(await returnsService.get(req.user!, idFrom(req)));
    } catch (err) {
      next(err);
    }
  },

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const saleId = req.query.sale_id === undefined ? undefined : Number(req.query.sale_id);
      if (saleId !== undefined && (!Number.isInteger(saleId) || saleId <= 0))
        throw new ValidationError('Invalid sale_id');
      res.status(200).json({
        returns: await returnsService.list({
          saleId,
          status: typeof req.query.status === 'string' ? req.query.status : undefined,
        }),
      });
    } catch (err) {
      next(err);
    }
  },

  async refunds(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ refunds: (await returnsService.get(req.user!, idFrom(req))).refunds });
    } catch (err) {
      next(err);
    }
  },

  async retry(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json(await returnsService.retryRefund(req.user!, idFrom(req)));
    } catch (err) {
      next(err);
    }
  },
};
