import { ConflictError, NotFoundError, ValidationError } from '../../common/errors';
import { auditService } from '../audit/audit.service';
import { categoriesRepository } from './categories.repository';
import { CategoryRow } from './categories.types';

/**
 * Business/service layer for categories (Step 5 A5, Step 6 §5.13).
 * No delete/deactivate path exists in the approved design - categories can
 * only be created and renamed, since `products.category_id` depends on
 * them and the schema has no `is_active` column for categories.
 */
export const categoriesService = {
  async listCategories(): Promise<CategoryRow[]> {
    return categoriesRepository.findAll();
  },

  async getCategory(id: number): Promise<CategoryRow> {
    const category = await categoriesRepository.findById(id);
    if (!category) {
      throw new NotFoundError('Category not found');
    }
    return category;
  },

  async createCategory(actingUserId: number, name: string): Promise<CategoryRow> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new ValidationError('name is required');
    }
    const existing = await categoriesRepository.findByName(trimmed);
    if (existing) {
      throw new ConflictError('A category with this name already exists');
    }

    const created = await categoriesRepository.insert(trimmed);

    await auditService.record({
      actorId: actingUserId,
      actionType: 'CATEGORY_CREATED',
      entityType: 'CATEGORY',
      entityId: created.id,
      afterSnapshot: { name: created.name },
    });

    return created;
  },

  async renameCategory(actingUserId: number, id: number, name: string): Promise<CategoryRow> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new ValidationError('name is required');
    }

    const existing = await categoriesRepository.findById(id);
    if (!existing) {
      throw new NotFoundError('Category not found');
    }

    const duplicate = await categoriesRepository.findByName(trimmed);
    if (duplicate && duplicate.id !== id) {
      throw new ConflictError('A category with this name already exists');
    }

    const updated = await categoriesRepository.rename(id, trimmed);
    if (!updated) {
      throw new NotFoundError('Category not found');
    }

    await auditService.record({
      actorId: actingUserId,
      actionType: 'CATEGORY_UPDATED',
      entityType: 'CATEGORY',
      entityId: updated.id,
      beforeSnapshot: { name: existing.name },
      afterSnapshot: { name: updated.name },
    });

    return updated;
  },
};
