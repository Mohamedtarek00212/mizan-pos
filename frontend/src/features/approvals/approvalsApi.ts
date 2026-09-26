import { apiRequest } from '../../shared/api/apiClient';
import { Sale } from '../pos/salesApi';

export interface Approval {
  id: number;
  entity_type: 'DISCOUNT' | 'RETURN_NO_RECEIPT' | 'RETURN_WITH_RECEIPT';
  entity_id: number;
  requested_by: number;
  status: 'PENDING' | 'APPROVED' | 'DENIED';
  amount_context: string | null;
  note: string | null;
  requested_at: string;
}

export const approvalsApi = {
  list(): Promise<{ approvals: Approval[] }> {
    return apiRequest('/approvals');
  },

  decide(
    id: number,
    decision: 'APPROVE' | 'DENY',
    note?: string,
  ): Promise<{ approval: Approval; sale?: Sale }> {
    return apiRequest(`/approvals/${id}/decision`, {
      method: 'POST',
      body: { decision, note },
    });
  },
};
