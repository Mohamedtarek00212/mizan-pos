import {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../common/errors';
import { pool } from '../../db/pool';
import { approvalThresholdsRepository } from '../approval-thresholds/approvalThresholds.repository';
import { auditService } from '../audit/audit.service';
import { authService } from '../auth/auth.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { salesService } from '../sales/sales.service';
import { returnsService } from '../returns/returns.service';
import { approvalsRepository } from './approvals.repository';
import { ApprovalDecisionResult, ApprovalRow } from './approvals.types';

export const approvalsService = {
  async list(status?: string): Promise<ApprovalRow[]> {
    if (status && !['PENDING', 'APPROVED', 'DENIED'].includes(status))
      throw new ValidationError('Invalid approval status');
    return approvalsRepository.list(status);
  },

  async get(actingUser: AuthenticatedUser, id: number): Promise<ApprovalRow> {
    const approval = await approvalsRepository.findById(id);
    if (!approval) throw new NotFoundError('Approval not found');
    if (actingUser.role === 'CASHIER' && approval.requested_by !== actingUser.id)
      throw new AuthorizationError();
    return approval;
  },

  async decideInline(
    requester: AuthenticatedUser,
    approvalId: number,
    managerUsername: string,
    managerPassword: string,
    decision: 'APPROVE' | 'DENY',
    note?: string,
  ): Promise<ApprovalDecisionResult> {
    const initial = await approvalsRepository.findById(approvalId);
    if (!initial) throw new NotFoundError('Approval not found');
    if (initial.requested_by !== requester.id)
      throw new AuthorizationError('This approval belongs to another cashier');

    const { user: manager } = await authService.login(managerUsername, managerPassword);
    if (manager.role !== 'MANAGER' && manager.role !== 'ADMIN') {
      throw new AuthenticationError('Manager or Admin credentials are required');
    }
    if (decision === 'APPROVE') await ensureWithinApproverLimit(manager, initial);

    return decide(manager, approvalId, decision, note);
  },

  async decideAsManager(
    manager: AuthenticatedUser,
    approvalId: number,
    decision: 'APPROVE' | 'DENY',
    note?: string,
  ): Promise<ApprovalDecisionResult> {
    const initial = await approvalsRepository.findById(approvalId);
    if (!initial) throw new NotFoundError('Approval not found');
    if (decision === 'APPROVE') await ensureWithinApproverLimit(manager, initial);
    return decide(manager, approvalId, decision, note);
  },
};

async function ensureWithinApproverLimit(
  manager: AuthenticatedUser,
  approval: ApprovalRow,
): Promise<void> {
  const threshold = await approvalThresholdsRepository.getCurrentEffective(manager.roleId);
  if (!threshold) throw new AuthorizationError('No approval threshold is configured');
  if (approval.entity_type === 'DISCOUNT') {
    if (
      !('percentEquivalent' in approval.payload) ||
      approval.payload.percentEquivalent > Number(threshold.max_self_discount_pct)
    ) {
      throw new AuthorizationError('Discount exceeds this approver’s configured limit');
    }
  } else if (Number(approval.amount_context) > Number(threshold.max_self_refund_amt)) {
    throw new AuthorizationError('Refund exceeds this approver’s configured limit');
  }
}

async function decide(
  manager: AuthenticatedUser,
  approvalId: number,
  decision: 'APPROVE' | 'DENY',
  note?: string,
): Promise<ApprovalDecisionResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const approval = await approvalsRepository.findByIdForUpdate(approvalId, client);
    if (!approval) throw new NotFoundError('Approval not found');
    if (approval.status !== 'PENDING') throw new ConflictError('Approval has already been decided');

    let sale: unknown;
    let returned: unknown;
    if (decision === 'APPROVE') {
      if (approval.entity_type === 'DISCOUNT') {
        if (!('percentEquivalent' in approval.payload))
          throw new ConflictError('Invalid discount approval payload');
        sale = await salesService.applyApprovedDiscount(
          approval.entity_id,
          approval.payload,
          manager.id,
          approval.id,
          client,
        );
      } else {
        returned = await returnsService.approveAndRefund(approval.entity_id, manager.id, client);
      }
    } else if (approval.entity_type !== 'DISCOUNT') {
      returned = await returnsService.reject(approval.entity_id, manager.id, note, client);
    }
    const decided = await approvalsRepository.decide(
      approval.id,
      decision === 'APPROVE' ? 'APPROVED' : 'DENIED',
      manager.id,
      note,
      client,
    );
    if (!decided) throw new ConflictError('Approval has already been decided');
    await auditService.record(
      {
        actorId: manager.id,
        actionType: decision === 'APPROVE' ? 'APPROVAL_APPROVED' : 'APPROVAL_DENIED',
        entityType: 'APPROVAL',
        entityId: approval.id,
        reason: note,
        beforeSnapshot: { status: 'PENDING' },
        afterSnapshot: { status: decided.status, entity_id: approval.entity_id },
      },
      client,
    );
    await client.query('COMMIT');
    return { approval: decided, sale, return: returned };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
