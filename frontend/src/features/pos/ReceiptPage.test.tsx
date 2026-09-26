import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/i18n';
import { ReceiptPage } from './ReceiptPage';

const getById = vi.fn();

vi.mock('./salesApi', () => ({
  salesApi: { getById: (...args: unknown[]) => getById(...args) },
}));

const sale = {
  id: 12,
  register_session_id: 4,
  cashier_id: 3,
  status: 'COMPLETED',
  subtotal_amount: 40,
  discount_amount: 0,
  tax_amount: 0,
  total_amount: 40,
  receipt_number: 1001,
  total_paid: 40,
  cash_paid: 40,
  card_paid: 0,
  cash_change_due: 0,
  remaining_balance: 0,
  created_at: '2026-09-12T10:00:00Z',
  completed_at: '2026-09-12T10:01:00Z',
  items: [{
    id: 8,
    product_id: 2,
    product_name: 'Milk',
    quantity: 1,
    unit_price_snapshot: 40,
    discount_amount: 0,
    tax_rate_snapshot: 0,
    tax_amount: 0,
    line_total: 40,
  }],
};

function renderReceipt(): void {
  render(
    <MemoryRouter initialEntries={['/pos/receipt/12']}>
      <Routes>
        <Route path="/pos/receipt/:saleId" element={<ReceiptPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ReceiptPage printing', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    getById.mockReset().mockResolvedValue(sale);
    delete window.mizanDesktop;
  });

  it('sends the completed receipt number to the desktop print bridge', async () => {
    const printReceipt = vi.fn().mockResolvedValue({ ok: true });
    window.mizanDesktop = { printReceipt } as unknown as Window['mizanDesktop'];
    renderReceipt();

    fireEvent.click(await screen.findByRole('button', { name: 'Print / Reprint receipt' }));
    await waitFor(() => expect(printReceipt).toHaveBeenCalledWith(1001));
  });

  it('reports a printer failure without leaving the receipt', async () => {
    window.mizanDesktop = {
      printReceipt: vi.fn().mockResolvedValue({ ok: false, error: 'PRINT_FAILED' }),
    } as unknown as Window['mizanDesktop'];
    renderReceipt();

    fireEvent.click(await screen.findByRole('button', { name: 'Print / Reprint receipt' }));
    expect(await screen.findByText(/could not be sent to the printer/)).toBeInTheDocument();
  });

  it('shows cash change due to the customer', async () => {
    getById.mockResolvedValue({ ...sale, total_paid: 50, cash_paid: 50, cash_change_due: 10 });
    renderReceipt();
    expect(await screen.findByText('Change due')).toBeInTheDocument();
    expect(screen.getByText('EGP 10.00')).toBeInTheDocument();
  });
});
