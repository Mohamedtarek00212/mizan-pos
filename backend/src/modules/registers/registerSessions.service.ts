import { AuthenticatedUser } from '../auth/auth.types';
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../common/errors';
import { pool } from '../../db/pool';
import { approvalThresholdsRepository } from '../approval-thresholds/approvalThresholds.repository';
import { auditService } from '../audit/audit.service';
import { paymentsRepository } from '../sales/payments.repository';
import { salesRepository } from '../sales/sales.repository';
import { usersRepository } from '../users/users.repository';
import { registersRepository } from './registers.repository';
import { registerSessionsRepository } from './registerSessions.repository';
import { RegisterSessionRow, RegisterSessionSummary } from './registerSessions.types';

function toSummary(row: RegisterSessionRow): RegisterSessionSummary {
  const variance = row.variance !== null ? Number(row.variance) : null;
  const threshold =
    row.variance_threshold_snapshot !== null ? Number(row.variance_threshold_snapshot) : null;
  return {
    id: row.id,
    register_id: row.register_id,
    register_code: row.register_code ?? '',
    register_name: row.register_name ?? row.register_code ?? '',
    cashier_id: row.cashier_id,
    cashier_name: row.cashier_name ?? '',
    status: row.status,
    starting_cash: Number(row.starting_cash),
    expected_cash: row.expected_cash !== null ? Number(row.expected_cash) : null,
    counted_cash: row.counted_cash !== null ? Number(row.counted_cash) : null,
    variance,
    variance_threshold_snapshot: threshold,
    exceeds_variance_threshold:
      variance !== null && threshold !== null ? Math.abs(variance) > threshold : null,
    opened_at: row.opened_at,
    closed_at: row.closed_at,
    closed_by: row.closed_by,
    closed_by_name: row.closed_by_name ?? null,
  };
}

/**
 * Computes expected cash at close time (CR-04): starting float + net cash
 * sales - net cash refunds/payouts during the session. The Sales/Payments
 * tables do not exist yet in this phase (explicitly out of scope), so net
 * cash movement is always 0 for now - this function is the single,
 * isolated place that formula will be extended in the Sales phase,
 * without needing to touch the close() orchestration logic below.
 */
function computeExpectedCash(startingCash: number, netCashMovements = 0): number {
  return round2(startingCash + netCashMovements);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

async function withLiveExpectedCash(
  row: RegisterSessionRow,
): Promise<RegisterSessionSummary> {
  const summary = toSummary(row);
  if (row.status === 'OPEN') {
    const netCashMovements = await paymentsRepository.getCashTotalForSession(row.id);
    summary.expected_cash = computeExpectedCash(summary.starting_cash, netCashMovements);
  }
  return summary;
}

/**
 * Business/service layer for register sessions (Step 5 A5/A8, W-02/W-10,
 * CR-01..CR-05, INV-07).
 */
export const registerSessionsService = {
  async openSession(
    actingUser: AuthenticatedUser,
    registerId: number,
    startingCash: number,
  ): Promise<RegisterSessionSummary> {
    if (typeof startingCash !== 'number' || Number.isNaN(startingCash) || startingCash < 0) {
      throw new ValidationError('starting_cash is required and must be a number >= 0');
    }

    const register = await registersRepository.findById(registerId);
    if (!register) {
      throw new NotFoundError('Register not found');
    }
    if (!register.is_active) {
      throw new ConflictError('This register is not active');
    }

    // CR-01/INV-07: register must not already have an open session.
    const existingRegisterSession =
      await registerSessionsRepository.findOpenByRegisterId(registerId);
    if (existingRegisterSession) {
      throw new ConflictError('This register already has an open session', {
        conflict_type: 'REGISTER_ALREADY_OPEN',
      });
    }

    // W-02 failure path: a Cashier cannot have more than one open session
    // (across any register) at a time.
    const existingCashierSession = await registerSessionsRepository.findOpenByCashierId(
      actingUser.id,
    );
    if (existingCashierSession) {
      throw new ConflictError('You already have an open register session', {
        conflict_type: 'CASHIER_ALREADY_HAS_OPEN_SESSION',
      });
    }

    const created = await registerSessionsRepository.insertOpen(
      registerId,
      actingUser.id,
      startingCash,
    );

    await auditService.record({
      actorId: actingUser.id,
      actionType: 'REGISTER_OPENED',
      entityType: 'REGISTER_SESSION',
      entityId: created.id,
      afterSnapshot: { register_id: created.register_id, starting_cash: created.starting_cash },
    });

    return withLiveExpectedCash(created);
  },

  async getCurrentForCashier(actingUser: AuthenticatedUser): Promise<RegisterSessionSummary> {
    const session = await registerSessionsRepository.findOpenByCashierId(actingUser.id);
    if (!session) {
      throw new NotFoundError('No open register session found for this cashier');
    }
    return withLiveExpectedCash(session);
  },

  async getCurrentSession(registerId: number): Promise<RegisterSessionSummary> {
    const register = await registersRepository.findById(registerId);
    if (!register) {
      throw new NotFoundError('Register not found');
    }
    const session = await registerSessionsRepository.findOpenByRegisterId(registerId);
    if (!session) {
      throw new NotFoundError('This register has no open session');
    }
    return withLiveExpectedCash(session);
  },

  async closeSession(
    actingUser: AuthenticatedUser,
    registerId: number,
    sessionId: number,
    countedCash: number,
  ): Promise<RegisterSessionSummary> {
    if (typeof countedCash !== 'number' || Number.isNaN(countedCash) || countedCash < 0) {
      throw new ValidationError('counted_cash is required and must be a number >= 0');
    }

    const preSession = await registerSessionsRepository.findById(sessionId);
    if (!preSession || preSession.register_id !== registerId) {
      throw new NotFoundError('Register session not found');
    }
    if (preSession.status !== 'OPEN') {
      throw new ConflictError('This session is already closed', {
        conflict_type: 'SESSION_ALREADY_CLOSED',
      });
    }

    // Own session (Cashier) or Manager/Admin force-close (CR-05).
    const isOwnSession = preSession.cashier_id === actingUser.id;
    const isForceCloseRole = actingUser.role === 'MANAGER' || actingUser.role === 'ADMIN';
    if (!isOwnSession && !isForceCloseRole) {
      throw new AuthorizationError(
        'Only the session owner or a Manager/Admin may close this session',
      );
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Re-read the session under lock for the state transition.
      const session = await registerSessionsRepository.findById(sessionId, client);
      if (!session || session.status !== 'OPEN') {
        throw new ConflictError('This session is already closed', {
          conflict_type: 'SESSION_ALREADY_CLOSED',
        });
      }

      // CR-03: no open (DRAFT/PAYMENT_PENDING) sales may remain on this session.
      const hasOpenSales = await salesRepository.hasNonTerminalSales(sessionId, client);
      if (hasOpenSales) {
        throw new ConflictError(
          'All sales on this session must be completed or voided before closing',
          {
            conflict_type: 'OPEN_SALES_REMAIN',
          },
        );
      }

      const netCashPayments = await paymentsRepository.getCashTotalForSession(sessionId, client);
      const expectedCash = computeExpectedCash(Number(session.starting_cash), netCashPayments);
      const variance = round2(countedCash - expectedCash);

      // Variance threshold is the currently effective, per-role configured
      // value for the session's cashier's role (approval_thresholds -
      // register_variance_alert_threshold), snapshotted at close time so
      // later threshold changes never rewrite past sessions (audit-safe).
      const cashier = await usersRepository.findById(session.cashier_id);
      const threshold = cashier
        ? await approvalThresholdsRepository.getCurrentEffective(cashier.role_id)
        : null;
      const varianceThresholdSnapshot = threshold
        ? Number(threshold.register_variance_alert_threshold)
        : null;

      const closed = await registerSessionsRepository.close(
        sessionId,
        {
          expectedCash,
          countedCash,
          variance,
          varianceThresholdSnapshot,
          closedBy: actingUser.id,
        },
        client,
      );
      if (!closed) {
        throw new NotFoundError('Register session not found');
      }

      await auditService.record(
        {
          actorId: actingUser.id,
          actionType: 'REGISTER_CLOSED',
          entityType: 'REGISTER_SESSION',
          entityId: closed.id,
          reason: isOwnSession ? undefined : 'Manager/Admin force-close',
          beforeSnapshot: { status: 'OPEN', starting_cash: session.starting_cash },
          afterSnapshot: {
            status: 'CLOSED',
            expected_cash: expectedCash,
            counted_cash: countedCash,
            variance,
          },
        },
        client,
      );

      const exceedsThreshold =
        varianceThresholdSnapshot !== null && Math.abs(variance) > varianceThresholdSnapshot;
      if (exceedsThreshold) {
        await auditService.record(
          {
            actorId: actingUser.id,
            actionType: 'REGISTER_VARIANCE_EXCEEDED',
            entityType: 'REGISTER_SESSION',
            entityId: closed.id,
            reason: `Variance ${variance} exceeds threshold ${varianceThresholdSnapshot}`,
            afterSnapshot: { variance, threshold: varianceThresholdSnapshot },
          },
          client,
        );
      }

      await client.query('COMMIT');
      return toSummary(closed);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
};
