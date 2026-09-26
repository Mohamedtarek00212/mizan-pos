/**
 * Minimal design tokens for the Phase 3 (Register & Cash Management)
 * screens - a professional, production-oriented POS visual standard for
 * the screens introduced in this phase, per the "UI Quality" requirement.
 * This intentionally does NOT restyle Phase 1/2 screens; a dedicated
 * UI/UX unification pass is planned after core POS workflows land.
 */
export const theme = {
  color: {
    background: '#f3f7f5',
    surface: '#ffffff',
    border: '#dfe9e5',
    borderStrong: '#b9cbc4',
    text: '#10231d',
    textMuted: '#60716b',
    primary: '#087f5b',
    primaryHover: '#066649',
    primarySoft: '#e8f7f1',
    success: '#087f5b',
    successSoft: '#e8f7f1',
    warning: '#b45309',
    warningSoft: '#fff7e6',
    danger: '#b91c1c',
    dangerSoft: '#fef2f2',
    neutralSoft: '#eef3f1',
  },
  spacing: (multiplier: number): number => multiplier * 8,
  radius: {
    sm: 8,
    md: 14,
    lg: 22,
  },
  shadow: {
    card: '0 8px 24px rgba(18, 54, 43, 0.06)',
  },
  font: {
    heading: { fontSize: 26, fontWeight: 800, letterSpacing: '-0.025em' },
    subheading: { fontSize: 16, fontWeight: 600 },
    body: { fontSize: 14, fontWeight: 400 },
    label: { fontSize: 13, fontWeight: 600 },
    mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
  },
} as const;
