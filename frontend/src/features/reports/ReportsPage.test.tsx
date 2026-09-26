import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../../i18n/i18n';
import { ReportsPage } from './ReportsPage';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('./reportsApi', () => ({
  reportsApi: { get: (...args: unknown[]) => mocks.get(...args) },
}));

describe('ReportsPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    mocks.get.mockReset();
    mocks.get.mockResolvedValue({
      summary: { sale_count: 2, total: '125.00' },
      rows: [{ date: '2026-09-12', sale_count: 2, total: '125.00' }],
    });
  });

  it('loads the sales summary and reruns it with date filters', async () => {
    render(
      <MemoryRouter>
        <ReportsPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Reports' })).toBeInTheDocument();
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith('sales', {}));
    expect(screen.getAllByText('Sales')).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-09-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run report' }));
    await waitFor(() =>
      expect(mocks.get).toHaveBeenLastCalledWith('sales', { from: '2026-09-01' }),
    );
  });
});
