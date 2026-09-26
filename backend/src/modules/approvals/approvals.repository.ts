import { PoolClient } from 'pg';
import { pool } from '../../db/pool';
import { ReturnApprovalPayload } from '../returns/returns.types';
import { ApprovalRow, DiscountApprovalPayload } from './approvals.types';

export const approvalsRepository = {
  async createDiscount(
    saleId: number,
    requestedBy: number,
    amountContext: number,
    payload: DiscountApprovalPayload,
    client?: PoolClient,
  ): Promise<ApprovalRow> {
    const db = client ?? pool;
    const result = await db.query<ApprovalRow>(
      `INSERT INTO manager_approvals
         (entity_type, entity_id, requested_by, amount_context, payload)
       VALUES ('DISCOUNT', $1, $2, $3, $4)
       RETURNING *`,
      [saleId, requestedBy, amountContext, JSON.stringify(payload)],
    );
    return result.rows[0];
  },

  async createReturn(
    returnId: number,
    entityType: 'RETURN_NO_RECEIPT' | 'RETURN_WITH_RECEIPT',
    requestedBy: number,
    amountContext: number,
    payload: ReturnApprovalPayload,
    client: PoolClient,
  ): Promise<ApprovalRow> {
    const result = await client.query<ApprovalRow>(
      `INSERT INTO manager_approvals
         (entity_type, entity_id, requested_by, amount_context, payload)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [entityType, returnId, requestedBy, amountContext, JSON.stringify(payload)],
    );
    return result.rows[0];
  },

  async findById(id: number, client?: PoolClient): Promise<ApprovalRow | null> {
    const db = client ?? pool;
    const result = await db.query<ApprovalRow>('SELECT * FROM manager_approvals WHERE id = $1', [
      id,
    ]);
    return result.rows[0] ?? null;
  },

  async findByIdForUpdate(id: number, client: PoolClient): Promise<ApprovalRow | null> {
    const result = await client.query<ApprovalRow>(
      'SELECT * FROM manager_approvals WHERE id = $1 FOR UPDATE',
      [id],
    );
    return result.rows[0] ?? null;
  },

  async hasActiveApprover(): Promise<boolean> {
    const result = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM users u JOIN roles r ON r.id = u.role_id
         WHERE u.is_active = true AND r.name IN ('MANAGER', 'ADMIN')
       ) AS exists`,
    );
    return result.rows[0].exists;
  },

  async list(status?: string): Promise<ApprovalRow[]> {
    const values: unknown[] = [];
    let where = '';
    if (status) {
      values.push(status);
      where = 'WHERE status = $1';
    }
    const result = await pool.query<ApprovalRow>(
      `SELECT * FROM manager_approvals ${where} ORDER BY requested_at DESC LIMIT 100`,
      values,
    );
    return result.rows;
  },

  async decide(
    id: number,
    status: 'APPROVED' | 'DENIED',
    decidedBy: number,
    note: string | undefined,
    client: PoolClient,
  ): Promise<ApprovalRow | null> {
    const result = await client.query<ApprovalRow>(
      `UPDATE manager_approvals
       SET status = $2, decided_by = $3, note = $4, decided_at = now()
       WHERE id = $1 AND status = 'PENDING'
       RETURNING *`,
      [id, status, decidedBy, note ?? null],
    );
    return result.rows[0] ?? null;
  },
};
