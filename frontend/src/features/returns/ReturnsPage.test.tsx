import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/i18n';
import { ReturnsPage } from './ReturnsPage';

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  create: vi.fn(),
  list: vi.fn(),
  decideInline: vi.fn(),
}));

vi.mock('./returnsApi', () => ({
  returnsApi: {
    lookupReceipt: (...args: unknown[]) => mocks.lookup(...args),
    create: (...args: unknown[]) => mocks.create(...args),
    list: (...args: unknown[]) => mocks.list(...args),
    decideInline: (...args: unknown[]) => mocks.decideInline(...args),
  },
}));

vi.mock('../../shared/auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 3, username: 'cashier', fullName: 'Cashier', role: 'CASHIER' } }),
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
  remaining_balance: 0,
  created_at: '2026-09-12T10:00:00Z',
  completed_at: '2026-09-12T10:01:00Z',
  items: [
    {
      id: 8,
      product_id: 2,
      product_name: 'Milk',
      quantity: 1,
      unit_price_snapshot: 40,
      discount_amount: 0,
      tax_rate_snapshot: 0,
      tax_amount: 0,
      line_total: 40,
    },
  ],
};

describe('ReturnsPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    Object.values(mocks).forEach((mock) => mock.mockReset());
  });

  it('looks up a receipt and submits selected return quantities', async () => {
    mocks.lookup.mockResolvedValue(sale);
    mocks.create.mockResolvedValue({
      approval_pending: false,
      return: { id: 5, status: 'REFUNDED' },
    });
    render(
      <MemoryRouter>
        <ReturnsPage />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText('Receipt number'), { target: { value: '1001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find Sale' }));
    expect(await screen.findByText(/Milk/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Return quantity 8'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Return reason'), { target: { value: 'Changed mind' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Return' }));
    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith({
        sale_id: 12,
        reason: 'Changed mind',
        items: [{ sale_item_id: 8, quantity: 1, resellable: true }],
      }),
    );
    expect(await screen.findByText(/refunded successfully/)).toBeInTheDocument();
  });

  it('shows immediate manager approval for a no-receipt return', async () => {
    mocks.create.mockResolvedValue({
      approval_pending: true,
      approval_id: 22,
      return: { id: 6, status: 'REQUESTED' },
    });
    render(
      <MemoryRouter>
        <ReturnsPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Return without Receipt' }));
    const inputs = screen.getAllByRole('spinbutton');
    fireEvent.change(inputs[0], { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Return reason'), { target: { value: 'No receipt' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Return' }));
    expect(
      await screen.findByRole('dialog', { name: 'Manager approval required' }),
    ).toBeInTheDocument();
  });
});
