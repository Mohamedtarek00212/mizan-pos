import { ConflictError, NotFoundError, ValidationError } from '../../common/errors';
import { pool } from '../../db/pool';
import { auditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { inventoryRepository } from './inventory.repository';
import { InventoryMutationResult, InventoryProduct } from './inventory.types';
import { stockMovementsRepository } from './stockMovements.repository';
import { MovementType, StockMovementRow } from './stockMovements.types';

const MOVEMENT_TYPES: MovementType[] = ['SALE', 'RETURN_RESTOCK', 'MANUAL_ADD', 'MANUAL_ADJUST'];

async function mutate(
  actingUser: AuthenticatedUser,
  productId: number,
  delta: number,
  movementType: 'MANUAL_ADD' | 'MANUAL_ADJUST',
  reason?: string,
): Promise<InventoryMutationResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const product = await inventoryRepository.lockProduct(productId, client);
    if (!product) throw new NotFoundError('Product not found');
    const resultingStock = product.current_stock + delta;
    if (resultingStock < 0) {
      throw new ConflictError('Stock adjustment would make inventory negative', {
        current_stock: product.current_stock,
        quantity_delta: delta,
      });
    }
    await inventoryRepository.setStock(productId, resultingStock, client);
    const movement = await stockMovementsRepository.insert(
      {
        productId,
        movementType,
        quantityDelta: delta,
        resultingStock,
        referenceType: 'MANUAL',
        reason: reason ?? (movementType === 'MANUAL_ADD' ? 'Manual restock' : undefined),
        performedBy: actingUser.id,
      },
      client,
    );
    await auditService.record(
      {
        actorId: actingUser.id,
        actionType: 'STOCK_MOVEMENT_CREATED',
        entityType: 'STOCK_MOVEMENT',
        entityId: movement.id,
        reason: movement.reason ?? undefined,
        beforeSnapshot: { product_id: productId, stock: product.current_stock },
        afterSnapshot: { product_id: productId, stock: resultingStock, quantity_delta: delta },
      },
      client,
    );
    await client.query('COMMIT');
    return { movement, product: (await inventoryRepository.getProduct(productId))! };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export const inventoryService = {
  async list(q?: string): Promise<InventoryProduct[]> {
    return inventoryRepository.list(q?.trim() || undefined);
  },
  async lowStock(): Promise<InventoryProduct[]> {
    return inventoryRepository.listLowStock();
  },
  async addStock(
    actingUser: AuthenticatedUser,
    productId: number,
    quantity: number,
    reason?: string,
  ): Promise<InventoryMutationResult> {
    if (!Number.isInteger(quantity) || quantity <= 0)
      throw new ValidationError('quantity must be a positive integer');
    return mutate(actingUser, productId, quantity, 'MANUAL_ADD', reason?.trim() || undefined);
  },
  async adjustStock(
    actingUser: AuthenticatedUser,
    productId: number,
    delta: number,
    reason: string,
  ): Promise<InventoryMutationResult> {
    if (!Number.isInteger(delta) || delta === 0)
      throw new ValidationError('quantity_delta must be a non-zero integer');
    if (!reason.trim()) throw new ValidationError('reason is required');
    return mutate(actingUser, productId, delta, 'MANUAL_ADJUST', reason.trim());
  },
  async movements(
    productId: number,
    filters: { from?: Date; to?: Date; movementType?: string },
  ): Promise<StockMovementRow[]> {
    if (!(await inventoryRepository.getProduct(productId)))
      throw new NotFoundError('Product not found');
    if (filters.movementType && !MOVEMENT_TYPES.includes(filters.movementType as MovementType))
      throw new ValidationError('Invalid movement type');
    return inventoryRepository.movements(productId, filters);
  },
};
