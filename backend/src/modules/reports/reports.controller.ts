import { NextFunction, Request, Response } from 'express';
import { ValidationError } from '../../common/errors';
import { reportsRepository } from './reports.repository';
import { ReportFilters } from './reports.types';

function filters(req: Request): ReportFilters {
  const result: ReportFilters = {};
  for (const [queryKey, target] of [
    ['register_id', 'registerId'],
    ['cashier_id', 'cashierId'],
    ['product_id', 'productId'],
    ['category_id', 'categoryId'],
  ] as const) {
    if (req.query[queryKey] !== undefined) {
      const value = Number(req.query[queryKey]);
      if (!Number.isInteger(value) || value <= 0)
        throw new ValidationError(`${queryKey} must be a positive integer`);
      result[target] = value;
    }
  }
  for (const key of ['from', 'to'] as const) {
    if (req.query[key] !== undefined) {
      if (typeof req.query[key] !== 'string') throw new ValidationError(`${key} must be a date`);
      const value = new Date(req.query[key]);
      if (Number.isNaN(value.getTime())) throw new ValidationError(`${key} must be a valid date`);
      result[key] = value;
    }
  }
  if (result.from && result.to && result.from > result.to)
    throw new ValidationError('from must not be after to');
  return result;
}

export const reportsController = {
  sales: async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await reportsRepository.salesSummary(filters(req)));
    } catch (err) {
      next(err);
    }
  },
  cash: async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await reportsRepository.cashReconciliation(filters(req)));
    } catch (err) {
      next(err);
    }
  },
  inventory: async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await reportsRepository.inventoryStatus(filters(req)));
    } catch (err) {
      next(err);
    }
  },
  returns: async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await reportsRepository.returnsRefunds(filters(req)));
    } catch (err) {
      next(err);
    }
  },
};
