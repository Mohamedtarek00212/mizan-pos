import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ar from './locales/ar.json';
import en from './locales/en.json';

/**
 * Centralized i18n system (Phase: Internationalization foundation).
 * Arabic is the default/primary language; English is secondary. This
 * module is the single source of truth for supported languages,
 * persistence, and `<html dir/lang>` synchronization - every language
 * change, regardless of what triggered it, flows through here.
 */
export const SUPPORTED_LANGUAGES = ['ar', 'en'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'ar';
export const LANGUAGE_STORAGE_KEY = 'pos_language';

export function isSupportedLanguage(value: string): value is Language {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/**
 * Guards every `localStorage` access: some environments (e.g. certain
 * Node/test runner combinations) expose a `localStorage` global that
 * exists but throws or is otherwise unusable. Language persistence is a
 * non-critical enhancement, so it degrades gracefully to "use the
 * in-memory default" rather than crashing the app/tests.
 */
function safeGetItem(key: string): string | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Persistence is best-effort - ignore.
  }
}

export function getStoredLanguage(): Language {
  const stored = safeGetItem(LANGUAGE_STORAGE_KEY);
  return stored && isSupportedLanguage(stored) ? stored : DEFAULT_LANGUAGE;
}

function applyDocumentDirection(language: string): void {
  if (typeof document === 'undefined') {
    return;
  }
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.lang = language;
}

void i18n.use(initReactI18next).init({
  resources: {
    ar: { translation: ar },
    en: { translation: en },
  },
  lng: getStoredLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: { escapeValue: false },
});

// Apply direction immediately for the initial language (avoids a flash of
// the wrong direction before any component mounts).
applyDocumentDirection(i18n.language);

// Single centralized listener: keeps `<html dir/lang>` and localStorage in
// sync with every subsequent language change (Requirements 3/4/5/7).
i18n.on('languageChanged', (lng) => {
  applyDocumentDirection(lng);
  safeSetItem(LANGUAGE_STORAGE_KEY, lng);
});

export default i18n;
