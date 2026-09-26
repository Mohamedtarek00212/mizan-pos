import { NextFunction, Request, Response } from 'express';
import { ValidationError } from '../../common/errors';
import { taxRatesService } from './taxRates.service';

export const taxRatesController = {
  async listCurrent(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rates = await taxRatesService.listCurrentEffective();
      res.status(200).json({ tax_rates: rates });
    } catch (err) {
      next(err);
    }
  },

  async listHistory(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rates = await taxRatesService.listHistory();
      res.status(200).json({ tax_rates: rates });
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { category_id, rate_pct, effective_from } = req.body ?? {};

      if (category_id !== undefined && category_id !== null && typeof category_id !== 'number') {
        throw new ValidationError('category_id must be a number or null');
      }
      if (typeof rate_pct !== 'number') {
        throw new ValidationError('rate_pct is required and must be a number');
      }

      const effectiveFrom = effective_from ? new Date(effective_from) : new Date();
      if (Number.isNaN(effectiveFrom.getTime())) {
        throw new ValidationError('effective_from must be a valid date');
      }

      const created = await taxRatesService.createNewVersion(
        { categoryId: category_id ?? null, ratePct: rate_pct, effectiveFrom },
        req.user!.id,
      );
      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  },
};
