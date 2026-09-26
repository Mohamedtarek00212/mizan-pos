import { act, render, screen, waitFor } from '@testing-library/react';
import { useTranslation } from 'react-i18next';
import { describe, expect, it } from 'vitest';
import i18n, { DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY, getStoredLanguage } from './i18n';

function Probe(): JSX.Element {
  const { t } = useTranslation();
  return <h2>{t('categories.title')}</h2>;
}

/**
 * Core i18n foundation tests (Internationalization phase, Testing
 * requirements). Covers: Arabic default, language switching (text +
 * dir), and persistence across reload.
 */
describe('i18n foundation', () => {
  it('defaults to Arabic when no language preference is stored', () => {
    window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
    expect(DEFAULT_LANGUAGE).toBe('ar');
    expect(getStoredLanguage()).toBe('ar');
  });

  it('switching to English changes visible UI text and sets dir="ltr"', async () => {
    await act(async () => {
      await i18n.changeLanguage('ar');
    });
    render(<Probe />);
    expect(screen.getByText('الفئات')).toBeInTheDocument();

    await act(async () => {
      await i18n.changeLanguage('en');
    });
    await waitFor(() => expect(screen.getByText('Categories')).toBeInTheDocument());
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.documentElement.lang).toBe('en');
  });

  it('switching to Arabic sets dir="rtl"', async () => {
    await i18n.changeLanguage('en');
    expect(document.documentElement.dir).toBe('ltr');

    await i18n.changeLanguage('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
  });

  it('switching to English sets dir="ltr"', async () => {
    await i18n.changeLanguage('ar');
    expect(document.documentElement.dir).toBe('rtl');

    await i18n.changeLanguage('en');
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.documentElement.lang).toBe('en');
  });

  it('persists the language preference so it survives a reload', async () => {
    await i18n.changeLanguage('en');
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');
    // Simulate a reload: a fresh call to getStoredLanguage() reads
    // straight from localStorage, exactly as `i18n.ts` does on next boot.
    expect(getStoredLanguage()).toBe('en');

    await i18n.changeLanguage('ar');
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('ar');
    expect(getStoredLanguage()).toBe('ar');
  });
});
