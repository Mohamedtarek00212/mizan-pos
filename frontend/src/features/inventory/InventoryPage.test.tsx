import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/i18n';
import { InventoryPage } from './InventoryPage';

const mocks = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock('./inventoryApi', () => ({
  inventoryApi: { list: (...args: unknown[]) => mocks.list(...args) },
}));

describe('InventoryPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    mocks.list.mockReset();
  });

  it('shows stock levels, status, and inventory actions', async () => {
    mocks.list.mockResolvedValue({
      products: [
        {
          id: 7,
          sku: 'MILK-1',
          name: 'Fresh Milk',
          category_name: 'Dairy',
          current_stock: 2,
          reorder_threshold: 5,
          stock_status: 'LOW',
        },
      ],
    });

    render(
      <MemoryRouter>
        <InventoryPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Inventory' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Fresh Milk')).toBeInTheDocument());
    expect(screen.getAllByText('Low')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Adjust' })).toHaveAttribute(
      'href',
      '/inventory/adjust/7',
    );
    expect(screen.getByRole('link', { name: 'Movements' })).toHaveAttribute(
      'href',
      '/inventory/movements/7',
    );
  });
});
