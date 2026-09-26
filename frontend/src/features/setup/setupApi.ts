import { apiRequest } from '../../shared/api/apiClient';

export interface SetupStatus {
  initialized: boolean;
  store_name: string | null;
  currency_code: string | null;
}

export interface SetupPayload {
  store_name: string;
  admin_full_name: string;
  admin_username: string;
  admin_password: string;
  register_code: string;
  register_name: string;
  tax_rate_pct: number;
}

export const setupApi = {
  status: (): Promise<SetupStatus> => apiRequest('/setup/status'),
  initialize: (payload: SetupPayload): Promise<SetupStatus> =>
    apiRequest('/setup/initialize', { method: 'POST', body: payload }),
};
