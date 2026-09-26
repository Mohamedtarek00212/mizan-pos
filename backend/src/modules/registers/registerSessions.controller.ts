import { NextFunction, Request, Response } from 'express';
import { ValidationError } from '../../common/errors';
import { registerSessionsService } from './registerSessions.service';

function parseRegisterId(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    throw new ValidationError('Invalid register id');
  }
  return id;
}

export const registerSessionsController = {
  async open(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const registerId = parseRegisterId(req);
      const { starting_cash } = req.body ?? {};
      if (typeof starting_cash !== 'number') {
        throw new ValidationError('starting_cash is required and must be a number');
      }
      const session = await registerSessionsService.openSession(
        req.user!,
        registerId,
        starting_cash,
      );
      res.status(201).json(session);
    } catch (err) {
      next(err);
    }
  },

  async getCurrent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const registerId = parseRegisterId(req);
      const session = await registerSessionsService.getCurrentSession(registerId);
      res.status(200).json(session);
    } catch (err) {
      next(err);
    }
  },

  async getMyCurrent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const session = await registerSessionsService.getCurrentForCashier(req.user!);
      res.status(200).json(session);
    } catch (err) {
      next(err);
    }
  },

  async close(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const registerId = parseRegisterId(req);
      const sessionId = Number(req.params.sessionId);
      if (!Number.isInteger(sessionId)) {
        throw new ValidationError('Invalid session id');
      }
      const { counted_cash } = req.body ?? {};
      if (typeof counted_cash !== 'number') {
        throw new ValidationError('counted_cash is required and must be a number');
      }
      const session = await registerSessionsService.closeSession(
        req.user!,
        registerId,
        sessionId,
        counted_cash,
      );
      res.status(200).json(session);
    } catch (err) {
      next(err);
    }
  },
};
