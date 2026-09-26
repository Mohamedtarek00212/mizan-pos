import { auditService } from '../audit/audit.service';
import { NotFoundError, ValidationError } from '../../common/errors';
import { rolesRepository } from './roles.repository';
import { RoleWithPermissions, VALID_PERMISSION_KEYS } from './roles.types';

/**
 * Business/service layer for roles/permissions (Step 5 A5, UP-02).
 * Admin-only mutation; enforced at the route layer via `authorize('ADMIN')`.
 */
export const rolesService = {
  async listRolesWithPermissions(): Promise<RoleWithPermissions[]> {
    const roles = await rolesRepository.findAll();
    const withPermissions = await Promise.all(
      roles.map(async (role) => ({
        id: role.id,
        name: role.name,
        permissions: await rolesRepository.getPermissions(role.id),
      })),
    );
    return withPermissions;
  },

  async updatePermissions(
    roleId: number,
    permissionKeys: string[],
    actingUserId: number,
  ): Promise<RoleWithPermissions> {
    const role = await rolesRepository.findById(roleId);
    if (!role) {
      throw new NotFoundError('Role not found');
    }

    const invalidKeys = permissionKeys.filter(
      (key) => !VALID_PERMISSION_KEYS.includes(key as (typeof VALID_PERMISSION_KEYS)[number]),
    );
    if (invalidKeys.length > 0) {
      throw new ValidationError(`Invalid permission key(s): ${invalidKeys.join(', ')}`);
    }

    const before = await rolesRepository.getPermissions(roleId);
    await rolesRepository.setPermissions(roleId, permissionKeys);

    await auditService.record({
      actorId: actingUserId,
      actionType: 'PERMISSION_CHANGE',
      entityType: 'ROLE',
      entityId: roleId,
      beforeSnapshot: { permissions: before },
      afterSnapshot: { permissions: permissionKeys },
    });

    return { id: role.id, name: role.name, permissions: permissionKeys };
  },
};
