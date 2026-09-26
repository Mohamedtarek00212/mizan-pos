import { TFunction } from 'i18next';
import { ApiError } from '../../shared/api/apiClient';

/**
 * Maps known structured backend conflict codes (`details.conflict_type`,
 * see `registerSessions.service.ts`) to translated messages. Unrecognized
 * backend errors fall back to the server's own (English) message - the
 * backend's free-text error strings are not localized in this phase (see
 * project-level i18n scope notes), but every conflict this screen can
 * actually produce has a specific, translated mapping here.
 */
export function translateRegisterError(err: unknown, t: TFunction, fallbackKey: string): string {
  if (err instanceof ApiError) {
    const conflictType = (err.details as { conflict_type?: string } | undefined)?.conflict_type;
    switch (conflictType) {
      case 'REGISTER_ALREADY_OPEN':
        return t('openRegister.conflictRegisterAlreadyOpen');
      case 'CASHIER_ALREADY_HAS_OPEN_SESSION':
        return t('openRegister.conflictCashierAlreadyOpen');
      case 'SESSION_ALREADY_CLOSED':
        return t('registerSession.sessionAlreadyClosed');
      default:
        return err.message;
    }
  }
  return t(fallbackKey);
}
