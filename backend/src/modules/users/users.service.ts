import bcrypt from 'bcryptjs';
import { AuthenticatedUser, Role } from '../auth/auth.types';
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../common/errors';
import { auditService } from '../audit/audit.service';
import { rolesRepository } from '../roles/roles.repository';
import { usersRepository } from './users.repository';
import {
  CreateUserInput,
  ListUsersFilters,
  UpdateUserInput,
  UserRow,
  UserSummary,
} from './users.types';

const MANAGER_ASSIGNABLE_ROLES: Role[] = ['CASHIER', 'INVENTORY_STAFF'];
const ALL_ROLES: Role[] = ['CASHIER', 'MANAGER', 'INVENTORY_STAFF', 'ADMIN'];

function toSummary(row: UserRow): UserSummary {
  return {
    id: row.id,
    username: row.username,
    full_name: row.full_name,
    role: row.role_name,
    is_active: row.is_active,
    created_at: row.created_at,
    deactivated_at: row.deactivated_at,
  };
}

/**
 * Business/service layer for user management (Step 5 A5, UP-03/UP-04).
 * A Manager may only create/view/edit Cashier and Inventory Staff
 * accounts; an Admin may act on any role. This scoping is enforced here
 * (service layer), never assumed from the frontend.
 */
export const usersService = {
  async createUser(actingUser: AuthenticatedUser, input: CreateUserInput): Promise<UserSummary> {
    if (!ALL_ROLES.includes(input.role)) {
      throw new ValidationError(`Invalid role: ${input.role}`);
    }
    if (actingUser.role === 'MANAGER' && !MANAGER_ASSIGNABLE_ROLES.includes(input.role)) {
      throw new AuthorizationError('Managers may only create Cashier or Inventory Staff accounts');
    }

    const existing = await usersRepository.findByUsername(input.username);
    if (existing) {
      throw new ConflictError('Username is already taken');
    }

    const role = await rolesRepository.findByName(input.role);
    if (!role) {
      throw new ValidationError(`Invalid role: ${input.role}`);
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const created = await usersRepository.insert({
      roleId: role.id,
      username: input.username,
      passwordHash,
      fullName: input.fullName,
    });

    await auditService.record({
      actorId: actingUser.id,
      actionType: 'USER_CREATED',
      entityType: 'USER',
      entityId: created.id,
      afterSnapshot: {
        username: created.username,
        role: created.role_name,
        full_name: created.full_name,
      },
    });

    return toSummary(created);
  },

  async listUsers(
    actingUser: AuthenticatedUser,
    filters: ListUsersFilters,
  ): Promise<UserSummary[]> {
    let effectiveFilters = filters;

    if (actingUser.role === 'MANAGER') {
      if (filters.role && !MANAGER_ASSIGNABLE_ROLES.includes(filters.role)) {
        throw new AuthorizationError('Managers may not view Manager or Admin accounts');
      }
      effectiveFilters = filters.role ? filters : { ...filters, roleIn: MANAGER_ASSIGNABLE_ROLES };
    }

    const rows = await usersRepository.list(effectiveFilters);
    return rows.map(toSummary);
  },

  async getUserById(actingUser: AuthenticatedUser, id: number): Promise<UserSummary> {
    const row = await usersRepository.findById(id);
    if (!row) {
      throw new NotFoundError('User not found');
    }
    if (actingUser.role === 'MANAGER' && !MANAGER_ASSIGNABLE_ROLES.includes(row.role_name)) {
      throw new AuthorizationError('Managers may not view Manager or Admin accounts');
    }
    return toSummary(row);
  },

  async updateUser(
    actingUser: AuthenticatedUser,
    id: number,
    patch: UpdateUserInput,
  ): Promise<UserSummary> {
    const existing = await usersRepository.findById(id);
    if (!existing) {
      throw new NotFoundError('User not found');
    }

    // UP-03: Manager cannot modify an existing Manager/Admin account...
    if (actingUser.role === 'MANAGER' && !MANAGER_ASSIGNABLE_ROLES.includes(existing.role_name)) {
      throw new AuthorizationError('Managers may not modify Manager or Admin accounts');
    }
    // ...nor promote a target account INTO a Manager/Admin role.
    if (
      actingUser.role === 'MANAGER' &&
      patch.role !== undefined &&
      !MANAGER_ASSIGNABLE_ROLES.includes(patch.role)
    ) {
      throw new AuthorizationError('Managers may only assign Cashier or Inventory Staff roles');
    }

    let roleId: number | undefined;
    if (patch.role !== undefined) {
      if (!ALL_ROLES.includes(patch.role)) {
        throw new ValidationError(`Invalid role: ${patch.role}`);
      }
      const role = await rolesRepository.findByName(patch.role);
      if (!role) {
        throw new ValidationError(`Invalid role: ${patch.role}`);
      }
      roleId = role.id;
    }

    let passwordHash: string | undefined;
    if (patch.password !== undefined) {
      if (patch.password.length < 8) {
        throw new ValidationError('Password must be at least 8 characters');
      }
      passwordHash = await bcrypt.hash(patch.password, 10);
    }

    const isDeactivating = patch.isActive === false && existing.is_active;
    const isActivating = patch.isActive === true && !existing.is_active;

    const updated = await usersRepository.update(id, {
      roleId,
      fullName: patch.fullName,
      isActive: patch.isActive,
      passwordHash,
      deactivatedAt: patch.isActive === undefined ? undefined : patch.isActive ? null : new Date(),
    });

    if (!updated) {
      throw new NotFoundError('User not found');
    }

    const before = {
      username: existing.username,
      full_name: existing.full_name,
      role: existing.role_name,
      is_active: existing.is_active,
    };
    const after = {
      username: updated.username,
      full_name: updated.full_name,
      role: updated.role_name,
      is_active: updated.is_active,
    };

    await auditService.record({
      actorId: actingUser.id,
      actionType: isDeactivating
        ? 'USER_DEACTIVATED'
        : isActivating
          ? 'USER_ACTIVATED'
          : 'USER_UPDATED',
      entityType: 'USER',
      entityId: updated.id,
      beforeSnapshot: before,
      afterSnapshot: after,
    });

    return toSummary(updated);
  },
};
