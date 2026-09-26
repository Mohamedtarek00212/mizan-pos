import { NextFunction, Request, Response } from 'express';
import { ValidationError } from '../../common/errors';
import { auditService } from './audit.service';

function positiveInteger(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new ValidationError(`${label} must be a positive integer`);
  return parsed;
}

function date(value: unknown, label: string): Date | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new ValidationError(`${label} must be a date`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new ValidationError(`${label} must be a valid date`);
  return parsed;
}

export const auditController = {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const from = date(req.query.from, 'from');
      const to = date(req.query.to, 'to');
      if (from && to && from > to) throw new ValidationError('from must not be after to');
      res.json(
        await auditService.list({
          entityType: typeof req.query.entity_type === 'string' ? req.query.entity_type : undefined,
          entityId: positiveInteger(req.query.entity_id, 'entity_id'),
          actorId: positiveInteger(req.query.actor_id, 'actor_id'),
          actionType: typeof req.query.action_type === 'string' ? req.query.action_type : undefined,
          from,
          to,
          limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
          offset: req.query.offset === undefined ? undefined : Number(req.query.offset),
        }),
      );
    } catch (err) {
      next(err);
    }
  },
  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = positiveInteger(req.params.id, 'id');
      res.json(await auditService.get(id!));
    } catch (err) {
      next(err);
    }
  },
};
