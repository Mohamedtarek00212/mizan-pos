export type MovementType = 'SALE' | 'RETURN_RESTOCK' | 'MANUAL_ADD' | 'MANUAL_ADJUST';
export type ReferenceType = 'SALE_ITEM' | 'RETURN_ITEM' | 'MANUAL';

export interface StockMovementRow {
  id: number;
  product_id: number;
  movement_type: MovementType;
  quantity_delta: number;
  resulting_stock: number;
  reference_type: ReferenceType;
  reference_id: number | null;
  reason: string | null;
  performed_by: number;
  created_at: Date;
}

export interface CreateStockMovementInput {
  productId: number;
  movementType: MovementType;
  quantityDelta: number;
  resultingStock: number;
  referenceType: ReferenceType;
  referenceId?: number | null;
  reason?: string | null;
  performedBy: number;
}
