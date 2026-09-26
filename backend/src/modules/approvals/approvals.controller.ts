import { NextFunction, Request, Response } from 'express';
import { ValidationError } from '../../common/errors';
import { approvalsService } from './approvals.service';

function idFrom(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new ValidationError('Invalid approval id');
  return id;
}

export const approvalsController = {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({
        approvals: await approvalsService.list(
          typeof req.query.status === 'string' ? req.query.status : undefined,
        ),
      });
    } catch (err) {
      next(err);
    }
  },
  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json(await approvalsService.get(req.user!, idFrom(req)));
    } catch (err) {
      next(err);
    }
  },
  async decideInline(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { manager_username, manager_password, decision, note } = req.body ?? {};
      if (typeof manager_username !== 'string' || typeof manager_password !== 'string')
        throw new ValidationError('Manager credentials are required');
      if (decision !== 'APPROVE' && decision !== 'DENY')
        throw new ValidationError('decision must be APPROVE or DENY');
      const result = await approvalsService.decideInline(
        req.user!,
        idFrom(req),
        manager_username,
        manager_password,
        decision,
        typeof note === 'string' ? note : undefined,
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
  async decide(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { decision, note } = req.body ?? {};
      if (decision !== 'APPROVE' && decision !== 'DENY')
        throw new ValidationError('decision must be APPROVE or DENY');
      const result = await approvalsService.decideAsManager(
        req.user!,
        idFrom(req),
        decision,
        typeof note === 'string' ? note : undefined,
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
};
