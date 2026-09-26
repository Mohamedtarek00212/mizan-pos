import { NextFunction, Request, Response } from 'express';
import { ValidationError } from '../../common/errors';
import { approvalThresholdsService } from './approvalThresholds.service';

function parseThresholdBody(body: unknown): {
  maxSelfDiscountPct: number;
  maxSelfRefundAmt: number;
  registerVarianceAlertThreshold: number;
  effectiveFrom: Date;
} {
  const b = (body ?? {}) as Record<string, unknown>;
  const {
    max_self_discount_pct,
    max_self_refund_amt,
    register_variance_alert_threshold,
    effective_from,
  } = b;

  if (
    typeof max_self_discount_pct !== 'number' ||
    typeof max_self_refund_amt !== 'number' ||
    typeof register_variance_alert_threshold !== 'number'
  ) {
    throw new ValidationError(
      'max_self_discount_pct, max_self_refund_amt, and register_variance_alert_threshold are required numbers',
    );
  }

  const effectiveFrom = effective_from ? new Date(effective_from as string) : new Date();
  if (Number.isNaN(effectiveFrom.getTime())) {
    throw new ValidationError('effective_from must be a valid date');
  }

  return {
    maxSelfDiscountPct: max_self_discount_pct,
    maxSelfRefundAmt: max_self_refund_amt,
    registerVarianceAlertThreshold: register_variance_alert_threshold,
    effectiveFrom,
  };
}

export const approvalThresholdsController = {
  async getCurrent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await approvalThresholdsService.getCurrentByRoleName(req.params.role);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async getHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await approvalThresholdsService.getHistoryByRoleName(req.params.role);
      res.status(200).json({ history: result });
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = parseThresholdBody(req.body);
      const result = await approvalThresholdsService.setNewThreshold(
        req.params.role,
        input,
        req.user!.id,
      );
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
};
