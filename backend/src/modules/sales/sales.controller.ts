import { NextFunction, Request, Response } from 'express';
import { ValidationError } from '../../common/errors';
import { salesService } from './sales.service';

function parseSaleId(req: Request): number {
  const id = Number(req.params.saleId);
  if (!Number.isInteger(id)) {
    throw new ValidationError('Invalid sale id');
  }
  return id;
}

function parseItemId(req: Request): number {
  const id = Number(req.params.itemId);
  if (!Number.isInteger(id)) {
    throw new ValidationError('Invalid item id');
  }
  return id;
}

export const salesController = {
  async listHeld(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const sessionId = Number(req.query.register_session_id);
      if (!Number.isInteger(sessionId))
        throw new ValidationError('register_session_id is required');
      res.status(200).json({ sales: await salesService.listHeldSales(req.user!, sessionId) });
    } catch (err) {
      next(err);
    }
  },
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { register_session_id } = req.body ?? {};
      if (typeof register_session_id !== 'number') {
        throw new ValidationError('register_session_id is required');
      }
      const sale = await salesService.createSale(req.user!, register_session_id);
      res.status(201).json(sale);
    } catch (err) {
      next(err);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const sale = await salesService.getSale(parseSaleId(req));
      res.status(200).json(sale);
    } catch (err) {
      next(err);
    }
  },

  async getByReceipt(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const receiptNumber = Number(req.params.receiptNumber);
      if (!Number.isInteger(receiptNumber) || receiptNumber <= 0)
        throw new ValidationError('Invalid receipt number');
      res.status(200).json(await salesService.getSaleByReceipt(receiptNumber));
    } catch (err) {
      next(err);
    }
  },

  async addItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const saleId = parseSaleId(req);
      const { product_id, quantity } = req.body ?? {};
      if (typeof product_id !== 'number') {
        throw new ValidationError('product_id is required');
      }
      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new ValidationError('quantity must be a positive integer');
      }
      const sale = await salesService.addItem(req.user!, saleId, {
        productId: product_id,
        quantity,
      });
      res.status(200).json(sale);
    } catch (err) {
      next(err);
    }
  },

  async updateItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const saleId = parseSaleId(req);
      const itemId = parseItemId(req);
      const { quantity } = req.body ?? {};
      if (!Number.isInteger(quantity) || quantity < 0) {
        throw new ValidationError('quantity must be a non-negative integer');
      }
      const sale = await salesService.updateItem(req.user!, saleId, itemId, { quantity });
      res.status(200).json(sale);
    } catch (err) {
      next(err);
    }
  },

  async applyDiscount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { scope, discount_type, value, item_id, reason } = req.body ?? {};
      if (scope !== 'ITEM' && scope !== 'SALE')
        throw new ValidationError('scope must be ITEM or SALE');
      if (discount_type !== 'PERCENT' && discount_type !== 'FIXED')
        throw new ValidationError('discount_type must be PERCENT or FIXED');
      if (typeof value !== 'number') throw new ValidationError('value must be a number');
      const result = await salesService.applyManualDiscount(req.user!, parseSaleId(req), {
        scope,
        discountType: discount_type,
        value,
        itemId: typeof item_id === 'number' ? item_id : undefined,
        reason: typeof reason === 'string' ? reason : undefined,
      });
      res.status(result.approval_pending ? 202 : 200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async applyBestPromotion(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json(await salesService.applyBestPromotion(req.user!, parseSaleId(req)));
    } catch (err) {
      next(err);
    }
  },

  async recordCashPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const saleId = parseSaleId(req);
      const { amount } = req.body ?? {};
      if (typeof amount !== 'number' || amount <= 0) {
        throw new ValidationError('amount must be a positive number');
      }
      const sale = await salesService.recordCashPayment(req.user!, saleId, amount);
      res.status(200).json(sale);
    } catch (err) {
      next(err);
    }
  },

  async recordCardPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const saleId = parseSaleId(req);
      const { amount } = req.body ?? {};
      if (typeof amount !== 'number' || amount <= 0) {
        throw new ValidationError('amount must be a positive number');
      }
      const sale = await salesService.recordCardPayment(req.user!, saleId, amount);
      res.status(200).json(sale);
    } catch (err) {
      next(err);
    }
  },

  async complete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const sale = await salesService.completeSale(req.user!, parseSaleId(req));
      res.status(200).json(sale);
    } catch (err) {
      next(err);
    }
  },

  async hold(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json(await salesService.holdSale(req.user!, parseSaleId(req)));
    } catch (err) {
      next(err);
    }
  },

  async resume(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json(await salesService.resumeSale(req.user!, parseSaleId(req)));
    } catch (err) {
      next(err);
    }
  },

  async void(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { reason } = req.body ?? {};
      const sale = await salesService.voidSale(
        req.user!,
        parseSaleId(req),
        typeof reason === 'string' ? reason : undefined,
      );
      res.status(200).json(sale);
    } catch (err) {
      next(err);
    }
  },
};
