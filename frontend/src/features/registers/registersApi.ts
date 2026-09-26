import { apiRequest } from '../../shared/api/apiClient';

export interface Register {
  id: number;
  code: string;
  display_name: string;
  is_active: boolean;
  current_session_status: 'OPEN' | 'CLOSED';
}

export interface RegisterSession {
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
  opened_at: string;
  closed_at: string | null;
  closed_by: number | null;
  closed_by_name: string | null;
}

/**
 * Registers/Register Sessions API client (Step 5 B7). The backend is the
 * sole authority for expected cash, variance, and threshold comparisons -
 * this client never computes any of those values itself, only displays
 * what the server returns.
 */
export const registersApi = {
  list(): Promise<{ registers: Register[] }> {
    return apiRequest('/registers');
  },

  openSession(registerId: number, startingCash: number): Promise<RegisterSession> {
    return apiRequest(`/registers/${registerId}/sessions`, {
      method: 'POST',
      body: { starting_cash: startingCash },
    });
  },

  getCurrentSession(registerId: number): Promise<RegisterSession> {
    return apiRequest(`/registers/${registerId}/sessions/current`);
  },

  getMyCurrentSession(): Promise<RegisterSession> {
    return apiRequest('/registers/sessions/current');
  },

  closeSession(
    registerId: number,
    sessionId: number,
    countedCash: number,
  ): Promise<RegisterSession> {
    return apiRequest(`/registers/${registerId}/sessions/${sessionId}/close`, {
      method: 'POST',
      body: { counted_cash: countedCash },
    });
  },
};
