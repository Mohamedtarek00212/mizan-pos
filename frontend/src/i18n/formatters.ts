/**
 * Locale-aware formatting helpers (Requirement 14). Uses the Egypt
 * locale variant for both languages so EGP currency formatting is always
 * correct, while digits/date conventions still follow the active
 * language (Arabic vs. Western numerals, RTL vs. LTR date ordering).
 */
function resolveLocale(language: string): string {
  return language === 'ar' ? 'ar-EG' : 'en-EG';
}

export function formatCurrencyEGP(value: number, language: string): string {
  return new Intl.NumberFormat(resolveLocale(language), {
    style: 'currency',
    currency: 'EGP',
  }).format(value);
}

export function formatNumber(value: number, language: string): string {
  return new Intl.NumberFormat(resolveLocale(language)).format(value);
}

/** `value` is already a percentage point (e.g. 14 means "14%"), not a fraction. */
export function formatPercent(value: number, language: string): string {
  const formatted = new Intl.NumberFormat(resolveLocale(language), {
    maximumFractionDigits: 2,
  }).format(value);
  return `${formatted}%`;
}

export function formatDate(value: string | Date, language: string): string {
  return new Intl.DateTimeFormat(resolveLocale(language), { dateStyle: 'medium' }).format(
    new Date(value),
  );
}

export function formatDateTime(value: string | Date, language: string): string {
  return new Intl.DateTimeFormat(resolveLocale(language), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
