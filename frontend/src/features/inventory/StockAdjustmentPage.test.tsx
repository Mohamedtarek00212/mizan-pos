import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/i18n';
import { StockAdjustmentPage } from './StockAdjustmentPage';

const mocks = vi.hoisted(() => ({ getProduct: vi.fn(), add: vi.fn(), adjust: vi.fn() }));

vi.mock('./inventoryApi', () => ({
  inventoryApi: {
    getProduct: (...args: unknown[]) => mocks.getProduct(...args),
    add: (...args: unknown[]) => mocks.add(...args),
    adjust: (...args: unknown[]) => mocks.adjust(...args),
  },
}));

const product = {
  id: 7,
  name: 'Fresh Milk',
  current_stock: 4,
  reorder_threshold: 2,
  stock_status: 'OK',
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/inventory/adjust/7']}>
      <Routes>
        <Route path="/inventory/adjust/:productId" element={<StockAdjustmentPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('StockAdjustmentPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getProduct.mockResolvedValue(product);
  });

  it('submits a positive restock with its reason', async () => {
    mocks.add.mockResolvedValue({ product: { ...product, current_stock: 7 }, movement: {} });
    renderPage();
    expect(await screen.findByText('Fresh Milk')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Quantity to add'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Delivery' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mocks.add).toHaveBeenCalledWith(7, 3, 'Delivery'));
    expect(await screen.findByText('Stock updated successfully')).toBeInTheDocument();
  });

  it('prevents a correction that would make stock negative', async () => {
    renderPage();
    expect(await screen.findByText('Fresh Milk')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Correction' }));
    fireEvent.change(screen.getByLabelText('Quantity change (+ or −)'), {
      target: { value: '-5' },
    });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Count correction' } });
    expect(screen.getByText(/would make stock negative/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(mocks.adjust).not.toHaveBeenCalled();
  });
});
