import '@testing-library/jest-dom/vitest';

/**
 * Minimal `localStorage` polyfill for the test environment. Some
 * Node/jsdom version combinations leave `window.localStorage` undefined
 * (a known environment quirk, unrelated to app code) - the i18n
 * persistence tests need a real, working store to assert against.
 *
 * NOTE: this must run and complete *before* `../i18n/i18n` is evaluated
 * (it reads `localStorage` at module-load time), so it uses a dynamic
 * `import()` rather than a static one - static imports are hoisted above
 * all other statements in a module, which would otherwise defeat this
 * ordering entirely.
 */
if (typeof window !== 'undefined' && !window.localStorage) {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => store.set(key, String(value)),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      get length() {
        return store.size;
      },
    },
    writable: true,
  });
}

await import('../i18n/i18n');
