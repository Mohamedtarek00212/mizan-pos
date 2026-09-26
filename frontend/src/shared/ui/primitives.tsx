import { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { theme } from './theme';

/**
 * Small, reusable presentational primitives for the Phase 3 screens -
 * consistent buttons/cards/badges/empty-states without introducing a
 * full component library or redesigning existing screens.
 */

export function PageContainer({
  children,
  maxWidth = 640,
}: {
  children: ReactNode;
  maxWidth?: number;
}): JSX.Element {
  return (
    <div
      style={{
        padding: theme.spacing(3),
        maxWidth,
        margin: '0 auto',
        width: '100%',
      }}
    >
      {children}
    </div>
  );
}

export function PageHeading({ children }: { children: ReactNode }): JSX.Element {
  return (
    <h1
      style={{
        ...theme.font.heading,
        color: theme.color.text,
        margin: `0 0 ${theme.spacing(3)}px`,
      }}
    >
      {children}
    </h1>
  );
}

export function Card({
  children,
  style,
  className,
}: {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}): JSX.Element {
  return (
    <div
      className={className}
      style={{
        background: theme.color.surface,
        border: `1px solid ${theme.color.border}`,
        borderRadius: theme.radius.md,
        boxShadow: theme.shadow.card,
        padding: theme.spacing(3),
        marginBottom: theme.spacing(3),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  fullWidth?: boolean;
}

export function Button({
  variant = 'primary',
  fullWidth,
  style,
  disabled,
  ...rest
}: ButtonProps): JSX.Element {
  const base: CSSProperties = {
    fontSize: 14,
    fontWeight: 600,
    padding: '11px 18px',
    borderRadius: theme.radius.sm,
    border: '1px solid transparent',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    width: fullWidth ? '100%' : undefined,
    transition: 'transform 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease',
  };

  const variants: Record<string, CSSProperties> = {
    primary: {
      background: `linear-gradient(135deg, ${theme.color.primary}, #0ca678)`,
      color: '#fff',
      boxShadow: '0 5px 14px rgba(8, 127, 91, 0.18)',
    },
    secondary: {
      background: theme.color.surface,
      color: theme.color.text,
      border: `1px solid ${theme.color.borderStrong}`,
    },
    danger: { background: theme.color.danger, color: '#fff' },
  };

  return (
    <button {...rest} disabled={disabled} style={{ ...base, ...variants[variant], ...style }} />
  );
}

export function FieldLabel({
  children,
  htmlFor,
}: {
  children: ReactNode;
  htmlFor?: string;
}): JSX.Element {
  return (
    <label
      htmlFor={htmlFor}
      style={{
        ...theme.font.label,
        color: theme.color.text,
        display: 'block',
        marginBottom: theme.spacing(1),
      }}
    >
      {children}
    </label>
  );
}

// Shared styling belongs beside the small UI primitives that consume it.
// eslint-disable-next-line react-refresh/only-export-components
export const inputStyle: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 15,
  borderRadius: theme.radius.sm,
  border: `1px solid ${theme.color.borderStrong}`,
  background: theme.color.surface,
  color: theme.color.text,
  outlineColor: theme.color.primary,
};

export function StatusBadge({
  tone,
  children,
}: {
  tone: 'success' | 'warning' | 'danger' | 'neutral';
  children: ReactNode;
}): JSX.Element {
  const toneStyles: Record<string, CSSProperties> = {
    success: { background: theme.color.successSoft, color: theme.color.success },
    warning: { background: theme.color.warningSoft, color: theme.color.warning },
    danger: { background: theme.color.dangerSoft, color: theme.color.danger },
    neutral: { background: theme.color.neutralSoft, color: theme.color.textMuted },
  };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.02em',
        ...toneStyles[tone],
      }}
    >
      {children}
    </span>
  );
}

export function EmptyState({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: theme.spacing(5),
        color: theme.color.textMuted,
        fontSize: 14,
      }}
    >
      {children}
    </div>
  );
}

export function AlertBanner({
  tone,
  children,
}: {
  tone: 'danger' | 'warning' | 'success';
  children: ReactNode;
}): JSX.Element {
  const toneStyles: Record<string, CSSProperties> = {
    danger: {
      background: theme.color.dangerSoft,
      color: theme.color.danger,
      border: `1px solid ${theme.color.danger}33`,
    },
    warning: {
      background: theme.color.warningSoft,
      color: theme.color.warning,
      border: `1px solid ${theme.color.warning}33`,
    },
    success: {
      background: theme.color.successSoft,
      color: theme.color.success,
      border: `1px solid ${theme.color.success}33`,
    },
  };
  return (
    <div
      role="alert"
      style={{
        padding: theme.spacing(2),
        borderRadius: theme.radius.sm,
        fontSize: 14,
        fontWeight: 500,
        marginBottom: theme.spacing(2),
        ...toneStyles[tone],
      }}
    >
      {children}
    </div>
  );
}

export function Spinner(): JSX.Element {
  return (
    <span
      role="status"
      style={{
        display: 'inline-block',
        width: 16,
        height: 16,
        borderRadius: '50%',
        border: `2px solid ${theme.color.border}`,
        borderTopColor: theme.color.primary,
        animation: 'pos-spin 0.7s linear infinite',
      }}
    />
  );
}
