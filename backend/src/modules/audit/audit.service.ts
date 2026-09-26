import { Pool, PoolClient } from 'pg';
import { auditRepository } from './audit.repository';
import { RecordAuditEventInput } from './audit.types';
import { AuditLogFilters } from './audit.types';
import { NotFoundError, ValidationError } from '../../common/errors';

/**
 * Business/service layer for audit logging (Step 5 A5, AL-01/AL-02).
 * Every sensitive operation in other modules calls `record()` as part of
 * its own transaction so the mutation and its audit trail are atomic.
 */
export const auditService = {
  async record(event: RecordAuditEventInput, client?: Pool | PoolClient): Promise<void> {
    await auditRepository.insert(event, client);
  },
  async list(filters: Partial<AuditLogFilters>) {
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new ValidationError('limit must be between 1 and 100');
    if (!Number.isInteger(offset) || offset < 0)
      throw new ValidationError('offset must be a non-negative integer');
    return auditRepository.list({ ...filters, limit, offset });
  },
  async get(id: number) {
    const log = await auditRepository.findById(id);
    if (!log) throw new NotFoundError('Audit log not found');
    return log;
  },
};
