import { ValidationError } from '../../common/errors';
import { auditService } from '../audit/audit.service';
import { categoriesRepository } from '../categories/categories.repository';
import { taxRatesRepository } from './taxRates.repository';
import { CreateTaxRateInput, TaxRateRow } from './taxRates.types';

function toApiShape(row: TaxRateRow) {
  return {
    id: row.id,
    category_id: row.category_id,
    rate_pct: Number(row.rate_pct),
    effective_from: row.effective_from,
    effective_to: row.effective_to,
  };
}

/**
 * Business/service layer for tax rate configuration (Step 5 B5, TX-01).
 * Mutation is Admin-only; Manager has view-only access to the currently
 * effective rates.
 */
export const taxRatesService = {
  async listCurrentEffective() {
    const rows = await taxRatesRepository.listAllCurrentEffective();
    return rows.map(toApiShape);
  },

  async listHistory() {
    const rows = await taxRatesRepository.listAllHistory();
    return rows.map(toApiShape);
  },

  async createNewVersion(input: CreateTaxRateInput, actingUserId: number) {
    if (input.ratePct < 0) {
      throw new ValidationError('rate_pct must be >= 0');
    }
    if (input.categoryId !== null) {
      const category = await categoriesRepository.findById(input.categoryId);
      if (!category) {
        throw new ValidationError('Invalid category_id');
      }
    }

    const previous = await taxRatesRepository.getCurrentEffective(input.categoryId);
    const created = await taxRatesRepository.insertNewVersion(
      input.categoryId,
      input.ratePct,
      input.effectiveFrom,
      actingUserId,
    );

    await auditService.record({
      actorId: actingUserId,
      actionType: 'TAX_RATE_CREATED',
      entityType: 'TAX_RATE',
      entityId: created.id,
      beforeSnapshot: previous ? toApiShape(previous) : null,
      afterSnapshot: toApiShape(created),
    });

    return toApiShape(created);
  },

  /**
   * Resolves the currently effective tax rate percentage for a given
   * category: a category-specific rate takes precedence; falls back to
   * the global rate (category_id IS NULL); returns null if neither is
   * configured. Used by the Products module to surface a derived
   * `effective_tax_rate_pct` on product responses - there is no direct
   * `tax_rate_id` FK on `products` in the approved schema (Step 4 §4.2),
   * so this relationship is resolved dynamically, not stored.
   */
  async resolveEffectiveRatePct(categoryId: number): Promise<number | null> {
    const categorySpecific = await taxRatesRepository.getCurrentEffective(categoryId);
    if (categorySpecific) {
      return Number(categorySpecific.rate_pct);
    }
    const global = await taxRatesRepository.getCurrentEffective(null);
    return global ? Number(global.rate_pct) : null;
  },
};
