/**
 * Centralized business/error taxonomy (Step 5 A9).
 * Feature modules should throw one of these (or a subclass added in a later
 * phase) instead of generic Error/strings, so the error-handling middleware
 * can map them to a consistent HTTP response shape.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    statusCode: number,
    errorCode: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(400, 'VALIDATION_ERROR', message, details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(401, 'AUTHENTICATION_ERROR', message);
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super(403, 'AUTHORIZATION_ERROR', message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(404, 'NOT_FOUND', message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(409, 'CONFLICT', message, details);
  }
}

export class CardDeclinedError extends AppError {
  constructor(message = 'Card payment was declined') {
    super(402, 'CARD_DECLINED', message);
  }
}

export class CardPaymentUncertainError extends AppError {
  constructor(message = 'Card payment outcome could not be confirmed') {
    super(409, 'CARD_PAYMENT_UNCERTAIN', message, { do_not_retry: true });
  }
}

export class ApprovalUnavailableError extends AppError {
  constructor(message = 'Manager approval is unavailable') {
    super(403, 'APPROVAL_UNAVAILABLE', message);
  }
}
