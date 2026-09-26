import { Role } from '../auth/auth.types';

export interface UserRow {
  id: number;
  role_id: number;
  username: string;
  password_hash: string;
  full_name: string;
  is_active: boolean;
  created_at: Date;
  deactivated_at: Date | null;
  role_name: Role;
}

/** Never includes `password_hash` - returned to API clients. */
export interface UserSummary {
  id: number;
  username: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  created_at: Date;
  deactivated_at: Date | null;
}

export interface CreateUserInput {
  username: string;
  password: string;
  fullName: string;
  role: Role;
}

export interface UpdateUserInput {
  fullName?: string;
  role?: Role;
  isActive?: boolean;
  password?: string;
}

export interface ListUsersFilters {
  role?: Role;
  roleIn?: Role[];
  isActive?: boolean;
}
