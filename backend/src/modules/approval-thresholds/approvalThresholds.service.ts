import { NotFoundError, ValidationError } from '../../common/errors';
import { auditService } from '../audit/audit.service';
import { rolesRepository } from '../roles/roles.repository';
import { approvalThresholdsRepository } from './approvalThresholds.repository';
import { ApprovalThresholdRow, SetThresholdInput } from './approvalThresholds.types';

function toApiShape(row: ApprovalThresholdRow) {
  return {
    role_id: row.role_id,
    max_self_discount_pct: Number(row.max_self_discount_pct),
    max_self_refund_amt: Number(row.max_self_refund_amt),
    register_variance_alert_threshold: Number(row.register_variance_alert_threshold),
    effective_from: row.effective_from,
    effective_to: row.effective_to,
  };
}

/**
 * Business/service layer for approval thresholds (Step 5 A5, A4 - "resolved
 * dynamically per-request from the current effective row"). Admin-only
 * mutation; enforced at the route layer via `authorize('ADMIN')`.
 */
export const approvalThresholdsService = {
  async getCurrentByRoleName(roleName: string) {
    const role = await rolesRepository.findByName(roleName);
    if (!role) {
      throw new NotFoundError('Role not found');
    }
    const current = await approvalThresholdsRepository.getCurrentEffective(role.id);
    if (!current) {
      throw new NotFoundError('No threshold configured for this role');
    }
    return toApiShape(current);
  },

  async getHistoryByRoleName(roleName: string) {
    const role = await rolesRepository.findByName(roleName);
    if (!role) {
      throw new NotFoundError('Role not found');
    }
    const history = await approvalThresholdsRepository.getHistory(role.id);
    return history.map(toApiShape);
  },

  async setNewThreshold(roleName: string, input: SetThresholdInput, actingUserId: number) {
    const role = await rolesRepository.findByName(roleName);
    if (!role) {
      throw new NotFoundError('Role not found');
    }
    if (input.maxSelfDiscountPct < 0 || input.maxSelfDiscountPct > 100) {
      throw new ValidationError('max_self_discount_pct must be between 0 and 100');
    }
    if (input.maxSelfRefundAmt < 0) {
      throw new ValidationError('max_self_refund_amt must be >= 0');
    }
    if (input.registerVarianceAlertThreshold < 0) {
      throw new ValidationError('register_variance_alert_threshold must be >= 0');
    }

    const previous = await approvalThresholdsRepository.getCurrentEffective(role.id);
    const created = await approvalThresholdsRepository.insertNewVersion(
      role.id,
      input,
      actingUserId,
    );

    await auditService.record({
      actorId: actingUserId,
      actionType: 'THRESHOLD_CHANGE',
      entityType: 'APPROVAL_THRESHOLD',
      entityId: created.id,
      beforeSnapshot: previous ? toApiShape(previous) : null,
      afterSnapshot: toApiShape(created),
    });

    return toApiShape(created);
  },
};
