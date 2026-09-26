import { NextFunction, Request, Response } from 'express';
import { ValidationError } from '../../common/errors';
import { productsService } from './products.service';

function parseOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export const productsController = {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { q, category_id, is_active, limit, offset } = req.query;

      if (category_id !== undefined && Number.isNaN(Number(category_id))) {
        throw new ValidationError('category_id must be a number');
      }

      const result = await productsService.listProducts({
        q: parseOptionalString(q),
        categoryId: category_id !== undefined ? Number(category_id) : undefined,
        isActive: is_active === undefined ? undefined : is_active === 'true',
        limit: limit !== undefined ? Number(limit) : undefined,
        offset: offset !== undefined ? Number(offset) : undefined,
      });

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async getByBarcode(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const product = await productsService.getActiveProductByBarcode(req.params.barcode);
      res.status(200).json(product);
    } catch (err) {
      next(err);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        throw new ValidationError('Invalid product id');
      }
      const product = await productsService.getProductById(id);
      res.status(200).json(product);
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sku, barcode, name, category_id, current_price, initial_stock, reorder_threshold } =
        req.body ?? {};

      if (typeof sku !== 'string' || !sku) {
        throw new ValidationError('sku is required');
      }
      if (typeof name !== 'string' || !name) {
        throw new ValidationError('name is required');
      }
      if (typeof category_id !== 'number') {
        throw new ValidationError('category_id is required');
      }
      if (typeof current_price !== 'number') {
        throw new ValidationError('current_price is required and must be a number');
      }
      if (barcode !== undefined && barcode !== null && typeof barcode !== 'string') {
        throw new ValidationError('barcode must be a string');
      }
      if (initial_stock !== undefined && typeof initial_stock !== 'number') {
        throw new ValidationError('initial_stock must be a number');
      }
      if (reorder_threshold !== undefined && typeof reorder_threshold !== 'number') {
        throw new ValidationError('reorder_threshold must be a number');
      }

      const created = await productsService.createProduct(req.user!, {
        sku,
        barcode: barcode ?? null,
        name,
        categoryId: category_id,
        currentPrice: current_price,
        initialStock: initial_stock,
        reorderThreshold: reorder_threshold,
      });

      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        throw new ValidationError('Invalid product id');
      }

      const { name, category_id, current_price, barcode, reorder_threshold, is_active } =
        req.body ?? {};

      if (name !== undefined && typeof name !== 'string') {
        throw new ValidationError('name must be a string');
      }
      if (category_id !== undefined && typeof category_id !== 'number') {
        throw new ValidationError('category_id must be a number');
      }
      if (current_price !== undefined && typeof current_price !== 'number') {
        throw new ValidationError('current_price must be a number');
      }
      if (barcode !== undefined && barcode !== null && typeof barcode !== 'string') {
        throw new ValidationError('barcode must be a string or null');
      }
      if (reorder_threshold !== undefined && typeof reorder_threshold !== 'number') {
        throw new ValidationError('reorder_threshold must be a number');
      }
      if (is_active !== undefined && typeof is_active !== 'boolean') {
        throw new ValidationError('is_active must be a boolean');
      }

      const updated = await productsService.updateProduct(req.user!, id, {
        name,
        categoryId: category_id,
        currentPrice: current_price,
        barcode,
        reorderThreshold: reorder_threshold,
        isActive: is_active,
      });

      res.status(200).json(updated);
    } catch (err) {
      next(err);
    }
  },

  async deactivate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        throw new ValidationError('Invalid product id');
      }
      const updated = await productsService.deactivateProduct(req.user!, id);
      res.status(200).json(updated);
    } catch (err) {
      next(err);
    }
  },
};
