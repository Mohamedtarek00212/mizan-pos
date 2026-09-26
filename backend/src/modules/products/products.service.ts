import { AuthenticatedUser } from '../auth/auth.types';
import { ConflictError, NotFoundError, ValidationError } from '../../common/errors';
import { auditService } from '../audit/audit.service';
import { categoriesRepository } from '../categories/categories.repository';
import { taxRatesService } from '../tax-rates/taxRates.service';
import { productsRepository } from './products.repository';
import { pool } from '../../db/pool';
import { stockMovementsRepository } from '../inventory/stockMovements.repository';
import {
  CreateProductInput,
  ListProductsFilters,
  ProductRow,
  ProductSummary,
  UpdateProductInput,
} from './products.types';

async function toSummary(row: ProductRow): Promise<ProductSummary> {
  const effectiveTaxRatePct = await taxRatesService.resolveEffectiveRatePct(row.category_id);
  return {
    id: row.id,
    sku: row.sku,
    barcode: row.barcode,
    name: row.name,
    category_id: row.category_id,
    category_name: row.category_name,
    current_price: Number(row.current_price),
    current_stock: row.current_stock,
    reorder_threshold: row.reorder_threshold,
    is_active: row.is_active,
    effective_tax_rate_pct: effectiveTaxRatePct,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Business/service layer for products (Step 5 A5/A8, Step 4 §4.2).
 * `CatalogService.updateProduct()` per Step 5 A8 must audit price changes
 * within the same atomic unit as the update; catalog mutations more
 * broadly must be audited per this phase's business rules.
 */
export const productsService = {
  async createProduct(
    actingUser: AuthenticatedUser,
    input: CreateProductInput,
  ): Promise<ProductSummary> {
    if (input.currentPrice < 0) {
      throw new ValidationError('current_price must be >= 0');
    }
    if (
      input.initialStock !== undefined &&
      (!Number.isInteger(input.initialStock) || input.initialStock < 0)
    ) {
      throw new ValidationError('initial_stock must be a non-negative integer');
    }
    if (
      input.reorderThreshold !== undefined &&
      (!Number.isInteger(input.reorderThreshold) || input.reorderThreshold < 0)
    ) {
      throw new ValidationError('reorder_threshold must be a non-negative integer');
    }
    if (!Number.isInteger(input.categoryId)) {
      throw new ValidationError('category_id is required');
    }

    const category = await categoriesRepository.findById(input.categoryId);
    if (!category) {
      throw new ValidationError('Invalid category_id');
    }

    const existingSku = await productsRepository.findBySku(input.sku);
    if (existingSku) {
      throw new ConflictError('SKU is already in use');
    }

    if (input.barcode) {
      const existingBarcode = await productsRepository.findActiveByBarcode(input.barcode);
      if (existingBarcode) {
        throw new ConflictError('Barcode is already in use by an active product');
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const created = await productsRepository.insert(input, client);
      if ((input.initialStock ?? 0) > 0) {
        await stockMovementsRepository.insert(
          {
            productId: created.id,
            movementType: 'MANUAL_ADD',
            quantityDelta: input.initialStock!,
            resultingStock: input.initialStock!,
            referenceType: 'MANUAL',
            reason: 'Initial stock',
            performedBy: actingUser.id,
          },
          client,
        );
      }
      await auditService.record(
        {
          actorId: actingUser.id,
          actionType: 'PRODUCT_CREATED',
          entityType: 'PRODUCT',
          entityId: created.id,
          afterSnapshot: {
            sku: created.sku,
            barcode: created.barcode,
            name: created.name,
            category_id: created.category_id,
            current_price: created.current_price,
            initial_stock: input.initialStock ?? 0,
          },
        },
        client,
      );
      await client.query('COMMIT');
      return toSummary(created);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async listProducts(
    filters: ListProductsFilters,
  ): Promise<{ products: ProductSummary[]; total: number }> {
    const { products, total } = await productsRepository.list(filters);
    const summaries = await Promise.all(products.map(toSummary));
    return { products: summaries, total };
  },

  async getProductById(id: number): Promise<ProductSummary> {
    const row = await productsRepository.findById(id);
    if (!row) {
      throw new NotFoundError('Product not found');
    }
    return toSummary(row);
  },

  async getActiveProductByBarcode(barcode: string): Promise<ProductSummary> {
    const row = await productsRepository.findActiveByBarcode(barcode);
    if (!row) {
      throw new NotFoundError('No active product found for this barcode');
    }
    return toSummary(row);
  },

  async updateProduct(
    actingUser: AuthenticatedUser,
    id: number,
    patch: UpdateProductInput,
  ): Promise<ProductSummary> {
    const existing = await productsRepository.findById(id);
    if (!existing) {
      throw new NotFoundError('Product not found');
    }

    if (patch.categoryId !== undefined) {
      const category = await categoriesRepository.findById(patch.categoryId);
      if (!category) {
        throw new ValidationError('Invalid category_id');
      }
    }

    if (patch.currentPrice !== undefined && patch.currentPrice < 0) {
      throw new ValidationError('current_price must be >= 0');
    }

    if (patch.barcode) {
      const existingBarcode = await productsRepository.findActiveByBarcode(patch.barcode);
      if (existingBarcode && existingBarcode.id !== id) {
        throw new ConflictError('Barcode is already in use by an active product');
      }
    }

    const priceChanged =
      patch.currentPrice !== undefined && patch.currentPrice !== Number(existing.current_price);
    const isDeactivating = patch.isActive === false && existing.is_active;
    const isActivating = patch.isActive === true && !existing.is_active;

    const updated = await productsRepository.update(id, patch);
    if (!updated) {
      throw new NotFoundError('Product not found');
    }

    const before = {
      name: existing.name,
      category_id: existing.category_id,
      current_price: existing.current_price,
      barcode: existing.barcode,
      reorder_threshold: existing.reorder_threshold,
      is_active: existing.is_active,
    };
    const after = {
      name: updated.name,
      category_id: updated.category_id,
      current_price: updated.current_price,
      barcode: updated.barcode,
      reorder_threshold: updated.reorder_threshold,
      is_active: updated.is_active,
    };

    await auditService.record({
      actorId: actingUser.id,
      actionType: isDeactivating
        ? 'PRODUCT_DEACTIVATED'
        : isActivating
          ? 'PRODUCT_ACTIVATED'
          : 'PRODUCT_UPDATED',
      entityType: 'PRODUCT',
      entityId: updated.id,
      reason: priceChanged ? 'Price change' : undefined,
      beforeSnapshot: before,
      afterSnapshot: after,
    });

    return toSummary(updated);
  },

  async deactivateProduct(actingUser: AuthenticatedUser, id: number): Promise<ProductSummary> {
    return this.updateProduct(actingUser, id, { isActive: false });
  },
};
