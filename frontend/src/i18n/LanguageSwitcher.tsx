import { useTranslation } from 'react-i18next';
import { Language, SUPPORTED_LANGUAGES } from './i18n';

const LANGUAGE_LABELS: Record<Language, string> = {
  ar: 'العربية',
  en: 'English',
};

/**
 * Global language switcher (Requirement: "Language switching must work
 * without breaking the current application state"). Rendered once at
 * the app shell level so it's available on every screen without
 * restructuring any individual page's layout.
 */
export function LanguageSwitcher(): JSX.Element {
  const { t, i18n } = useTranslation();
  const current = i18n.language as Language;

  return (
    <div className="language-switcher">
      <span>{t('common.language')}:</span>
      {SUPPORTED_LANGUAGES.map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => i18n.changeLanguage(lang)}
          aria-pressed={current === lang}
          className="language-switch-switch"
        >
          {LANGUAGE_LABELS[lang]}
        </button>
      ))}
    </div>
  );
}
