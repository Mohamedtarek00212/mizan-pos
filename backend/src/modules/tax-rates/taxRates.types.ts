export interface TaxRateRow {
  id: number;
  category_id: number | null;
  rate_pct: string;
  effective_from: Date;
  effective_to: Date | null;
  created_by: number;
  created_at: Date;
}

export interface CreateTaxRateInput {
  categoryId: number | null;
  ratePct: number;
  effectiveFrom: Date;
}
