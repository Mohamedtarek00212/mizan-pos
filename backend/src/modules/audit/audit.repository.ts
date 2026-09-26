import { Pool, PoolClient } from 'pg';
import { pool } from '../../db/pool';
import { AuditLogFilters, AuditLogRow, RecordAuditEventInput } from './audit.types';

/**
 * Data-access layer for the immutable audit trail (Step 4 §6, AL-03).
 * Accepts an optional transaction client so callers can insert the audit
 * row within the same atomic unit of work as the business mutation it
 * describes (Step 5 A8 - "one service method = one database transaction").
 */
export const auditRepository = {
  async insert(event: RecordAuditEventInput, client: Pool | PoolClient = pool): Promise<void> {
    await client.query(
      `INSERT INTO audit_logs
        (actor_id, action_type, entity_type, entity_id, reason, before_snapshot, after_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        event.actorId,
        event.actionType,
        event.entityType,
        event.entityId,
        event.reason ?? null,
        event.beforeSnapshot ? JSON.stringify(event.beforeSnapshot) : null,
        event.afterSnapshot ? JSON.stringify(event.afterSnapshot) : null,
      ],
    );
  },

  async list(filters: AuditLogFilters): Promise<{ logs: AuditLogRow[]; total: number }> {
    const values: unknown[] = [];
    const clauses: string[] = [];
    const add = (value: unknown, column: string) => {
      values.push(value);
      clauses.push(`${column} = $${values.length}`);
    };
    if (filters.entityType) add(filters.entityType, 'a.entity_type');
    if (filters.entityId) add(filters.entityId, 'a.entity_id');
    if (filters.actorId) add(filters.actorId, 'a.actor_id');
    if (filters.actionType) add(filters.actionType, 'a.action_type');
    if (filters.from) {
      values.push(filters.from);
      clauses.push(`a.created_at >= $${values.length}`);
    }
    if (filters.to) {
      values.push(filters.to);
      clauses.push(`a.created_at <= $${values.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    values.push(filters.limit, filters.offset);
    const result = await pool.query<AuditLogRow & { total_count: string }>(
      `SELECT a.*, u.username AS actor_username, u.full_name AS actor_name,
              COUNT(*) OVER() AS total_count
         FROM audit_logs a JOIN users u ON u.id = a.actor_id
         ${where} ORDER BY a.created_at DESC, a.id DESC
         LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    return { logs: result.rows, total: Number(result.rows[0]?.total_count ?? 0) };
  },

  async findById(id: number): Promise<AuditLogRow | null> {
    const result = await pool.query<AuditLogRow>(
      `SELECT a.*, u.username AS actor_username, u.full_name AS actor_name
         FROM audit_logs a JOIN users u ON u.id = a.actor_id WHERE a.id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  },
};
