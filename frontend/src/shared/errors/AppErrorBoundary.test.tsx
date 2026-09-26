import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/i18n';
import { AppErrorBoundary } from './AppErrorBoundary';

function BrokenComponent(): JSX.Element {
  throw new Error('Deliberate test failure');
}

afterEach(() => vi.restoreAllMocks());

describe('AppErrorBoundary', () => {
  it('shows a recovery action when a child component crashes', async () => {
    await i18n.changeLanguage('en');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<AppErrorBoundary><BrokenComponent /></AppErrorBoundary>);
    expect(screen.getByRole('heading', { name: 'The screen stopped unexpectedly' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload Mizan' })).toBeInTheDocument();
  });
});
