export interface RegisterSessionRow {
  id: number;
  register_id: number;
  cashier_id: number;
  status: 'OPEN' | 'CLOSED';
  starting_cash: string;
  expected_cash: string | null;
  counted_cash: string | null;
  variance: string | null;
  variance_threshold_snapshot: string | null;
  opened_at: Date;
  closed_at: Date | null;
  closed_by: number | null;
  register_code?: string;
  register_name?: string;
  cashier_name?: string;
  closed_by_name?: string | null;
}

export interface RegisterSessionSummary {
  id: number;
  register_id: number;
  register_code: string;
  register_name: string;
  cashier_id: number;
  cashier_name: string;
  status: 'OPEN' | 'CLOSED';
  starting_cash: number;
  expected_cash: number | null;
  counted_cash: number | null;
  variance: number | null;
  variance_threshold_snapshot: number | null;
  exceeds_variance_threshold: boolean | null;
  opened_at: Date;
  closed_at: Date | null;
  closed_by: number | null;
  closed_by_name: string | null;
}
