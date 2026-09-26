import { NextFunction, Request, Response } from 'express';
import { ValidationError } from '../../common/errors';
import { inventoryService } from './inventory.service';

function productId(req: Request): number {
  const id = Number(req.params.id ?? req.params.productId);
  if (!Number.isInteger(id) || id <= 0) throw new ValidationError('Invalid product id');
  return id;
}

function optionalDate(value: unknown, label: string): Date | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new ValidationError(`${label} must be a date`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ValidationError(`${label} must be a valid date`);
  return date;
}

export const inventoryController = {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({
        products: await inventoryService.list(
          typeof req.query.q === 'string' ? req.query.q : undefined,
        ),
      });
    } catch (err) {
      next(err);
    }
  },
  async lowStock(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ products: await inventoryService.lowStock() });
    } catch (err) {
      next(err);
    }
  },
  async add(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (typeof req.body?.quantity !== 'number') throw new ValidationError('quantity is required');
      res
        .status(201)
        .json(
          await inventoryService.addStock(
            req.user!,
            productId(req),
            req.body.quantity,
            typeof req.body.reason === 'string' ? req.body.reason : undefined,
          ),
        );
    } catch (err) {
      next(err);
    }
  },
  async adjust(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (typeof req.body?.quantity_delta !== 'number' || typeof req.body?.reason !== 'string')
        throw new ValidationError('quantity_delta and reason are required');
      res
        .status(201)
        .json(
          await inventoryService.adjustStock(
            req.user!,
            productId(req),
            req.body.quantity_delta,
            req.body.reason,
          ),
        );
    } catch (err) {
      next(err);
    }
  },
  async movements(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({
        movements: await inventoryService.movements(productId(req), {
          from: optionalDate(req.query.from, 'from'),
          to: optionalDate(req.query.to, 'to'),
          movementType:
            typeof req.query.movement_type === 'string' ? req.query.movement_type : undefined,
        }),
      });
    } catch (err) {
      next(err);
    }
  },
};
