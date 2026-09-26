import { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';

type AttemptWindow = { count: number; resetsAt: number };
const attempts = new Map<string, AttemptWindow>();

/** Bounds online password guessing without storing usernames or passwords. */
export function loginRateLimit(req: Request, res: Response, next: NextFunction): void {
  const now = Date.now();
  const key = req.ip ?? req.socket.remoteAddress ?? 'unknown';
  const current = attempts.get(key);
  const window = !current || current.resetsAt <= now
    ? { count: 0, resetsAt: now + env.loginRateLimitWindowMs }
    : current;

  res.setHeader('RateLimit-Limit', env.loginRateLimitMax);
  res.setHeader('RateLimit-Remaining', Math.max(0, env.loginRateLimitMax - window.count - 1));
  res.setHeader('RateLimit-Reset', Math.ceil(window.resetsAt / 1000));

  if (window.count >= env.loginRateLimitMax) {
    res.setHeader('Retry-After', Math.max(1, Math.ceil((window.resetsAt - now) / 1000)));
    res.status(429).json({
      error_code: 'RATE_LIMITED',
      message: 'Too many login attempts. Try again later.',
      details: null,
    });
    return;
  }

  window.count += 1;
  attempts.set(key, window);
  if (attempts.size > 10_000) {
    for (const [candidateKey, candidate] of attempts) {
      if (candidate.resetsAt <= now) attempts.delete(candidateKey);
    }
    if (attempts.size > 10_000) attempts.delete(attempts.keys().next().value as string);
  }
  next();
}

export function resetLoginRateLimitsForTests(): void {
  attempts.clear();
}

export function clearLoginRateLimit(ip: string): void {
  attempts.delete(ip);
}
