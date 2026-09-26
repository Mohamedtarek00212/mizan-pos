export type PaymentMethod = 'CASH' | 'CARD';
export type PaymentStatus = 'CAPTURED' | 'FAILED' | 'REVERSED';

export interface PaymentRow {
  id: number;
  sale_id: number;
  method: PaymentMethod;
  amount: string;
  status: PaymentStatus;
  captured_at: Date;
  reversed_at: Date | null;
  failure_code: string | null;
}

export interface PaymentSummary {
  id: number;
  sale_id: number;
  method: PaymentMethod;
  amount: number;
  status: PaymentStatus;
  captured_at: Date;
  reversed_at: Date | null;
}

export interface CreatePaymentInput {
  method: PaymentMethod;
  amount: number;
  status?: PaymentStatus;
  failureCode?: string | null;
}
