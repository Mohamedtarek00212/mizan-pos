import { NotFoundError, ValidationError } from '../../common/errors';
import { auditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { categoriesRepository } from '../categories/categories.repository';
import { productsRepository } from '../products/products.repository';
import { promotionsRepository } from './promotions.repository';
import { CreatePromotionInput, PromotionRow } from './promotions.types';

function validate(input: CreatePromotionInput): void {
  if (!input.name.trim()) throw new ValidationError('name is required');
  if (!['GENERAL', 'CATEGORY', 'PRODUCT'].includes(input.scope))
    throw new ValidationError('Invalid promotion scope');
  if (!['PERCENT', 'FIXED'].includes(input.discountType))
    throw new ValidationError('Invalid discount type');
  if (!Number.isFinite(input.discountValue) || input.discountValue <= 0)
    throw new ValidationError('discount_value must be positive');
  if (input.discountType === 'PERCENT' && input.discountValue > 100)
    throw new ValidationError('Percentage discount cannot exceed 100');
  if (input.endsAt <= input.startsAt) throw new ValidationError('ends_at must be after starts_at');
  if (input.scope === 'PRODUCT' && !input.productId)
    throw new ValidationError('product_id is required for product promotions');
  if (input.scope === 'CATEGORY' && !input.categoryId)
    throw new ValidationError('category_id is required for category promotions');
}

export const promotionsService = {
  async list(): Promise<PromotionRow[]> {
    return promotionsRepository.listAll();
  },

  async create(actingUser: AuthenticatedUser, input: CreatePromotionInput): Promise<PromotionRow> {
    validate(input);
    if (input.productId && !(await productsRepository.findById(input.productId)))
      throw new NotFoundError('Product not found');
    if (input.categoryId && !(await categoriesRepository.findById(input.categoryId)))
      throw new NotFoundError('Category not found');
    const created = await promotionsRepository.create(input, actingUser.id);
    await auditService.record({
      actorId: actingUser.id,
      actionType: 'PROMOTION_CREATED',
      entityType: 'PROMOTION',
      entityId: created.id,
      afterSnapshot: created as unknown as Record<string, unknown>,
    });
    return created;
  },

  async setActive(
    actingUser: AuthenticatedUser,
    id: number,
    isActive: boolean,
  ): Promise<PromotionRow> {
    const updated = await promotionsRepository.setActive(id, isActive);
    if (!updated) throw new NotFoundError('Promotion not found');
    await auditService.record({
      actorId: actingUser.id,
      actionType: 'PROMOTION_UPDATED',
      entityType: 'PROMOTION',
      entityId: id,
      afterSnapshot: { is_active: isActive },
    });
    return updated;
  },
};
