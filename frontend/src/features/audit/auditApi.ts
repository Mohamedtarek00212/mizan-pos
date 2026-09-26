import { apiRequest } from '../../shared/api/apiClient';

export interface AuditLog {
  id: number;
  actor_id: number;
  actor_username: string;
  actor_name: string;
  action_type: string;
  entity_type: string;
  entity_id: number;
  reason: string | null;
  before_snapshot: Record<string, unknown> | null;
  after_snapshot: Record<string, unknown> | null;
  created_at: string;
}
export interface AuditFilters {
  entityType?: string;
  entityId?: string;
  actorId?: string;
  actionType?: string;
  from?: string;
  to?: string;
}

export const auditApi = {
  list(filters: AuditFilters): Promise<{ logs: AuditLog[]; total: number }> {
    const params = new URLSearchParams();
    if (filters.entityType) params.set('entity_type', filters.entityType);
    if (filters.entityId) params.set('entity_id', filters.entityId);
    if (filters.actorId) params.set('actor_id', filters.actorId);
    if (filters.actionType) params.set('action_type', filters.actionType);
    if (filters.from) params.set('from', new Date(`${filters.from}T00:00:00`).toISOString());
    if (filters.to) params.set('to', new Date(`${filters.to}T23:59:59.999`).toISOString());
    const query = params.toString();
    return apiRequest(`/audit-logs${query ? `?${query}` : ''}`);
  },
};
