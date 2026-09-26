import { apiRequest } from '../../shared/api/apiClient';
import { Role } from '../../shared/auth/AuthContext';

export interface UserSummary {
  id: number;
  username: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  created_at: string;
  deactivated_at: string | null;
}

export interface CreateUserInput {
  username: string;
  password: string;
  full_name: string;
  role: Role;
}

export interface UpdateUserInput {
  full_name?: string;
  role?: Role;
  is_active?: boolean;
  password?: string;
}

/**
 * Users management API client (Step 5 B2, Step 6 §5.21).
 * Mirrors the backend's Controller -> Service -> Repository contracts
 * exactly - never assumes client-side what the server ultimately enforces
 * (role scoping is re-validated server-side regardless of this UI).
 */
export const usersApi = {
  list(): Promise<{ users: UserSummary[] }> {
    return apiRequest('/users');
  },

  create(input: CreateUserInput): Promise<UserSummary> {
    return apiRequest('/users', { method: 'POST', body: input });
  },

  update(id: number, patch: UpdateUserInput): Promise<UserSummary> {
    return apiRequest(`/users/${id}`, { method: 'PATCH', body: patch });
  },
};
