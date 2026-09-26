import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/i18n';
import { ApiError } from '../../shared/api/apiClient';
import { PosPage } from './PosPage';

const mocks = vi.hoisted(() => ({
  getMyCurrentSessionMock: vi.fn(),
  createSaleMock: vi.fn(),
  addItemMock: vi.fn(),
  updateItemMock: vi.fn(),
  recordCashPaymentMock: vi.fn(),
  completeMock: vi.fn(),
  voidMock: vi.fn(),
  listHeldMock: vi.fn(),
  holdMock: vi.fn(),
  resumeMock: vi.fn(),
  recordCardPaymentMock: vi.fn(),
  lookupByBarcodeMock: vi.fn(),
  listProductsMock: vi.fn(),
  applyDiscountMock: vi.fn(),
  applyBestPromotionMock: vi.fn(),
  decideApprovalMock: vi.fn(),
}));

vi.mock('../catalog/productsApi', () => ({
  productsApi: {
    lookupByBarcode: (...args: unknown[]) => mocks.lookupByBarcodeMock(...args),
    list: (...args: unknown[]) => mocks.listProductsMock(...args),
  },
}));

vi.mock('../registers/registersApi', () => ({
  registersApi: {
    getMyCurrentSession: (...args: unknown[]) => mocks.getMyCurrentSessionMock(...args),
  },
}));

vi.mock('./salesApi', () => ({
  salesApi: {
    create: (...args: unknown[]) => mocks.createSaleMock(...args),
    addItem: (...args: unknown[]) => mocks.addItemMock(...args),
    updateItem: (...args: unknown[]) => mocks.updateItemMock(...args),
    recordCashPayment: (...args: unknown[]) => mocks.recordCashPaymentMock(...args),
    recordCardPayment: (...args: unknown[]) => mocks.recordCardPaymentMock(...args),
    complete: (...args: unknown[]) => mocks.completeMock(...args),
    void: (...args: unknown[]) => mocks.voidMock(...args),
    listHeld: (...args: unknown[]) => mocks.listHeldMock(...args),
    hold: (...args: unknown[]) => mocks.holdMock(...args),
    resume: (...args: unknown[]) => mocks.resumeMock(...args),
    applyDiscount: (...args: unknown[]) => mocks.applyDiscountMock(...args),
    applyBestPromotion: (...args: unknown[]) => mocks.applyBestPromotionMock(...args),
    decideApproval: (...args: unknown[]) => mocks.decideApprovalMock(...args),
  },
}));

let mockUser = { id: 1, username: 'cashier1', fullName: 'Cash Ier', role: 'CASHIER' as const };

vi.mock('../../shared/auth/AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
}));

const OPEN_SESSION = {
  id: 99,
  register_id: 5,
  cashier_id: 1,
  status: 'OPEN' as const,
  starting_cash: 100,
  expected_cash: null,
  counted_cash: null,
  variance: null,
  variance_threshold_snapshot: null,
  exceeds_variance_threshold: null,
  opened_at: '2026-01-01T08:00:00.000Z',
  closed_at: null,
  closed_by: null,
};

const DRAFT_SALE = {
  id: 42,
  register_session_id: 99,
  cashier_id: 1,
  status: 'DRAFT' as const,
  subtotal_amount: 0,
  discount_amount: 0,
  tax_amount: 0,
  total_amount: 0,
  receipt_number: null,
  items: [],
  total_paid: 0,
  remaining_balance: 0,
  created_at: '2026-01-01T09:00:00.000Z',
  completed_at: null,
};

const SALE_WITH_ITEM = {
  ...DRAFT_SALE,
  subtotal_amount: 50,
  total_amount: 50,
  remaining_balance: 50,
  items: [
    {
      id: 1,
      product_id: 7,
      quantity: 1,
      unit_price_snapshot: 50,
      discount_amount: 0,
      tax_rate_snapshot: 0,
      tax_amount: 0,
      line_total: 50,
    },
  ],
};

function renderPos() {
  return render(
    <MemoryRouter initialEntries={['/pos']}>
      <Routes>
        <Route path="/pos" element={<PosPage />} />
        <Route
          path="/pos/receipt/:saleId"
          element={<div data-testid="receipt-page">Receipt</div>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PosPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    mockUser = { id: 1, username: 'cashier1', fullName: 'Cash Ier', role: 'CASHIER' };
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.listHeldMock.mockResolvedValue({ sales: [] });
    delete window.mizanDesktop;
  });

  it('shows a spinner while loading the session', async () => {
    mocks.getMyCurrentSessionMock.mockReturnValue(new Promise(() => {}));
    renderPos();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows an empty state when there is no open register session', async () => {
    mocks.getMyCurrentSessionMock.mockRejectedValue(
      new ApiError(404, 'NOT_FOUND', 'No open session'),
    );
    renderPos();
    await waitFor(() => {
      expect(screen.getByText('No open register session')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Open Register' })).toBeInTheDocument();
  });

  it('creates a draft sale on load and lets the cashier add an item by product id', async () => {
    mocks.getMyCurrentSessionMock.mockResolvedValue(OPEN_SESSION);
    mocks.createSaleMock.mockResolvedValue(DRAFT_SALE);
    mocks.addItemMock.mockResolvedValue(SALE_WITH_ITEM);
    renderPos();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Point of Sale' })).toBeInTheDocument();
    });
    expect(mocks.createSaleMock).toHaveBeenCalledWith(99);

    const productIdInput = screen.getByPlaceholderText('Product ID');
    fireEvent.change(productIdInput, { target: { value: '7' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[1]);

    await waitFor(() => {
      expect(mocks.addItemMock).toHaveBeenCalledWith(42, 7, 1);
    });
    expect(screen.getByText('Product #7')).toBeInTheDocument();
  });

  it('adds an item by barcode lookup', async () => {
    mocks.getMyCurrentSessionMock.mockResolvedValue(OPEN_SESSION);
    mocks.createSaleMock.mockResolvedValue(DRAFT_SALE);
    mocks.lookupByBarcodeMock.mockResolvedValue({
      id: 7,
      name: 'Milk',
      current_price: 50,
      current_stock: 10,
    });
    mocks.addItemMock.mockResolvedValue(SALE_WITH_ITEM);
    renderPos();

    await waitFor(() => screen.getByPlaceholderText('Scan or type barcode'));

    const barcodeInput = screen.getByPlaceholderText('Scan or type barcode');
    fireEvent.change(barcodeInput, { target: { value: '123456789' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0]);

    await waitFor(() => {
      expect(mocks.lookupByBarcodeMock).toHaveBeenCalledWith('123456789');
      expect(mocks.addItemMock).toHaveBeenCalledWith(42, 7, 1);
    });
  });

  it('records a cash payment and completes the sale', async () => {
    mocks.getMyCurrentSessionMock.mockResolvedValue(OPEN_SESSION);
    mocks.createSaleMock.mockResolvedValue(SALE_WITH_ITEM);
    mocks.recordCashPaymentMock.mockResolvedValue({
      ...SALE_WITH_ITEM,
      status: 'PAYMENT_PENDING' as const,
      total_paid: 50,
      remaining_balance: 0,
    });
    mocks.completeMock.mockResolvedValue({
      ...SALE_WITH_ITEM,
      status: 'COMPLETED' as const,
      total_paid: 50,
      remaining_balance: 0,
      receipt_number: 1001,
      completed_at: '2026-01-01T09:05:00.000Z',
    });
    renderPos();

    await waitFor(() => screen.getByPlaceholderText('EGP 50.00'));
    fireEvent.change(screen.getByPlaceholderText('EGP 50.00'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record Payment' }));

    await waitFor(() => {
      expect(mocks.recordCashPaymentMock).toHaveBeenCalledWith(42, 50);
    });

    const completeButton = await screen.findByRole('button', { name: 'Complete Sale' });
    fireEvent.click(completeButton);

    await waitFor(() => {
      expect(mocks.completeMock).toHaveBeenCalledWith(42);
    });
    expect(await screen.findByTestId('receipt-page')).toBeInTheDocument();
  });

  it('opens the configured desktop cash drawer after a captured cash payment', async () => {
    const openCashDrawer = vi.fn().mockResolvedValue({ ok: true });
    window.mizanDesktop = { openCashDrawer } as unknown as Window['mizanDesktop'];
    mocks.getMyCurrentSessionMock.mockResolvedValue(OPEN_SESSION);
    mocks.createSaleMock.mockResolvedValue(SALE_WITH_ITEM);
    mocks.recordCashPaymentMock.mockResolvedValue({
      ...SALE_WITH_ITEM,
      status: 'PAYMENT_PENDING' as const,
      total_paid: 50,
      remaining_balance: 0,
    });
    renderPos();

    const amount = await screen.findByPlaceholderText('EGP 50.00');
    fireEvent.change(amount, { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record Payment' }));

    await waitFor(() => expect(openCashDrawer).toHaveBeenCalledWith(42));
  });

  it('keeps a successful cash payment when the drawer is not configured', async () => {
    window.mizanDesktop = {
      openCashDrawer: vi.fn().mockResolvedValue({ ok: false, error: 'NOT_CONFIGURED' }),
    } as unknown as Window['mizanDesktop'];
    mocks.getMyCurrentSessionMock.mockResolvedValue(OPEN_SESSION);
    mocks.createSaleMock.mockResolvedValue(SALE_WITH_ITEM);
    mocks.recordCashPaymentMock.mockResolvedValue({
      ...SALE_WITH_ITEM,
      status: 'PAYMENT_PENDING' as const,
      total_paid: 50,
      remaining_balance: 0,
    });
    renderPos();

    const amount = await screen.findByPlaceholderText('EGP 50.00');
    fireEvent.change(amount, { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record Payment' }));

    expect(await screen.findByText(/drawer is not configured/)).toBeInTheDocument();
    expect(mocks.recordCashPaymentMock).toHaveBeenCalledWith(42, 50);
  });

  it('captures a keyboard-wedge barcode scan from outside the input', async () => {
    mocks.getMyCurrentSessionMock.mockResolvedValue(OPEN_SESSION);
    mocks.createSaleMock.mockResolvedValue(DRAFT_SALE);
    mocks.lookupByBarcodeMock.mockResolvedValue({
      id: 7,
      name: 'Milk',
      current_price: 50,
      current_stock: 10,
    });
    mocks.addItemMock.mockResolvedValue(SALE_WITH_ITEM);
    renderPos();

    expect(await screen.findByText('Scanner ready')).toBeInTheDocument();
    for (const key of '6291041500012') fireEvent.keyDown(document, { key });
    fireEvent.keyDown(document, { key: 'Enter' });

    await waitFor(() => {
      expect(mocks.lookupByBarcodeMock).toHaveBeenCalledWith('6291041500012');
      expect(mocks.addItemMock).toHaveBeenCalledWith(42, 7, 1);
    });
  });

  it('shows the scanned value when a barcode is unknown', async () => {
    mocks.getMyCurrentSessionMock.mockResolvedValue(OPEN_SESSION);
    mocks.createSaleMock.mockResolvedValue(DRAFT_SALE);
    mocks.lookupByBarcodeMock.mockResolvedValue(null);
    renderPos();

    await screen.findByText('Scanner ready');
    for (const key of '999888777') fireEvent.keyDown(document, { key });
    fireEvent.keyDown(document, { key: 'Enter' });

    expect(await screen.findByText(/999888777 is not registered/)).toBeInTheDocument();
    expect(mocks.addItemMock).not.toHaveBeenCalled();
  });

  it('captures a scan while another field is focused without replacing its value', async () => {
    mocks.getMyCurrentSessionMock.mockResolvedValue(OPEN_SESSION);
    mocks.createSaleMock.mockResolvedValue(DRAFT_SALE);
    mocks.lookupByBarcodeMock.mockResolvedValue({ id: 7, name: 'Milk' });
    mocks.addItemMock.mockResolvedValue(SALE_WITH_ITEM);
    renderPos();

    const searchInput = await screen.findByPlaceholderText('Search products by name, SKU, or barcode');
    fireEvent.change(searchInput, { target: { value: 'milk search' } });
    searchInput.focus();
    for (const key of '6291041500012') fireEvent.keyDown(searchInput, { key });
    fireEvent.keyDown(searchInput, { key: 'Enter' });

    await waitFor(() => expect(mocks.lookupByBarcodeMock).toHaveBeenCalledWith('6291041500012'));
    expect(searchInput).toHaveValue('milk search');
  });

  it('voids a draft sale after confirmation', async () => {
    mocks.getMyCurrentSessionMock.mockResolvedValue(OPEN_SESSION);
    mocks.createSaleMock.mockResolvedValue(SALE_WITH_ITEM);
    mocks.voidMock.mockResolvedValue({ ...SALE_WITH_ITEM, status: 'VOIDED' as const });
    window.confirm = vi.fn(() => true);
    renderPos();

    await waitFor(() => screen.getByRole('button', { name: 'Void Sale' }));
    fireEvent.click(screen.getByRole('button', { name: 'Void Sale' }));

    await waitFor(() => {
      expect(mocks.voidMock).toHaveBeenCalledWith(42);
    });
  });

  it('updates item quantity and removes item when quantity reaches zero', async () => {
    mocks.getMyCurrentSessionMock.mockResolvedValue(OPEN_SESSION);
    mocks.createSaleMock.mockResolvedValue(SALE_WITH_ITEM);
    mocks.updateItemMock.mockResolvedValue({ ...DRAFT_SALE, items: [] });
    renderPos();

    await waitFor(() => screen.getByText('Product #7'));
    const minusButton = screen.getByRole('button', { name: /decrease quantity/i });
    fireEvent.click(minusButton);

    await waitFor(() => {
      expect(mocks.updateItemMock).toHaveBeenCalledWith(42, 1, 0);
    });
  });

  it('searches products by name and adds the selected result', async () => {
    mocks.getMyCurrentSessionMock.mockResolvedValue(OPEN_SESSION);
    mocks.createSaleMock.mockResolvedValue(DRAFT_SALE);
    mocks.listProductsMock.mockResolvedValue({
      products: [
        { id: 7, sku: 'MILK-1', name: 'Fresh Milk', current_price: 50, current_stock: 10 },
      ],
      total: 1,
    });
    mocks.addItemMock.mockResolvedValue(SALE_WITH_ITEM);
    renderPos();

    const search = await screen.findByPlaceholderText('Search products by name, SKU, or barcode');
    fireEvent.change(search, { target: { value: 'milk' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    fireEvent.click(await screen.findByRole('button', { name: /Fresh Milk/ }));

    await waitFor(() => expect(mocks.addItemMock).toHaveBeenCalledWith(42, 7, 1));
  });

  it('holds the current sale and resumes it from the held list', async () => {
    mocks.getMyCurrentSessionMock.mockResolvedValue(OPEN_SESSION);
    mocks.createSaleMock.mockResolvedValue(SALE_WITH_ITEM);
    mocks.holdMock.mockResolvedValue({ ...SALE_WITH_ITEM, held_at: '2026-01-01T09:01:00.000Z' });
    mocks.listHeldMock
      .mockResolvedValueOnce({ sales: [] })
      .mockResolvedValueOnce({
        sales: [{ ...SALE_WITH_ITEM, held_at: '2026-01-01T09:01:00.000Z' }],
      })
      .mockResolvedValue({ sales: [] });
    mocks.resumeMock.mockResolvedValue({ ...SALE_WITH_ITEM, held_at: null });
    renderPos();

    fireEvent.click(await screen.findByRole('button', { name: 'Hold Sale' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Resume' }));
    await waitFor(() => expect(mocks.resumeMock).toHaveBeenCalledWith(42));
    expect(await screen.findByRole('heading', { name: 'Point of Sale' })).toBeInTheDocument();
  });

  it('blocks a retry when the card outcome is uncertain', async () => {
    mocks.getMyCurrentSessionMock.mockResolvedValue(OPEN_SESSION);
    mocks.createSaleMock.mockResolvedValue(SALE_WITH_ITEM);
    mocks.recordCardPaymentMock.mockRejectedValue(
      new ApiError(409, 'CARD_PAYMENT_UNCERTAIN', 'uncertain'),
    );
    renderPos();

    await screen.findByPlaceholderText('EGP 50.00');
    fireEvent.click(screen.getByRole('button', { name: 'Card' }));
    fireEvent.change(screen.getByPlaceholderText('EGP 50.00'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record Payment' }));

    expect(await screen.findByText(/do not retry/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Record Payment' })).not.toBeInTheDocument();
  });

  it('applies a discount within the cashier threshold', async () => {
    const discounted = {
      ...SALE_WITH_ITEM,
      discount_amount: 5,
      total_amount: 45,
      remaining_balance: 45,
      items: [{ ...SALE_WITH_ITEM.items[0], discount_amount: 5, line_total: 45 }],
    };
    mocks.getMyCurrentSessionMock.mockResolvedValue(OPEN_SESSION);
    mocks.createSaleMock.mockResolvedValue(SALE_WITH_ITEM);
    mocks.applyDiscountMock.mockResolvedValue({ approval_pending: false, sale: discounted });
    renderPos();

    const value = await screen.findByLabelText('Discount value');
    fireEvent.change(value, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply Discount' }));

    await waitFor(() =>
      expect(mocks.applyDiscountMock).toHaveBeenCalledWith(42, {
        scope: 'SALE',
        discount_type: 'PERCENT',
        value: 5,
        item_id: undefined,
        reason: undefined,
      }),
    );
    expect(await screen.findByText('Discount applied')).toBeInTheDocument();
  });

  it('collects manager credentials when a discount needs approval', async () => {
    mocks.getMyCurrentSessionMock.mockResolvedValue(OPEN_SESSION);
    mocks.createSaleMock.mockResolvedValue(SALE_WITH_ITEM);
    mocks.applyDiscountMock.mockResolvedValue({
      approval_pending: true,
      approval_id: 88,
      amount_context: '10.00%',
    });
    mocks.decideApprovalMock.mockResolvedValue({
      approval: { id: 88, status: 'APPROVED' },
      sale: { ...SALE_WITH_ITEM, discount_amount: 10, total_amount: 40, remaining_balance: 40 },
    });
    renderPos();

    fireEvent.change(await screen.findByLabelText('Discount value'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply Discount' }));
    const dialog = await screen.findByRole('dialog', { name: 'Manager approval required' });
    fireEvent.change(screen.getByLabelText('Manager username'), { target: { value: 'manager1' } });
    fireEvent.change(screen.getByLabelText('Manager password'), {
      target: { value: 'Password123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() =>
      expect(mocks.decideApprovalMock).toHaveBeenCalledWith(88, {
        manager_username: 'manager1',
        manager_password: 'Password123!',
        decision: 'APPROVE',
        note: undefined,
      }),
    );
    expect(dialog).not.toBeInTheDocument();
  });

  it('applies the best eligible promotion', async () => {
    mocks.getMyCurrentSessionMock.mockResolvedValue(OPEN_SESSION);
    mocks.createSaleMock.mockResolvedValue(SALE_WITH_ITEM);
    mocks.applyBestPromotionMock.mockResolvedValue({
      ...SALE_WITH_ITEM,
      discount_amount: 10,
      total_amount: 40,
      remaining_balance: 40,
    });
    renderPos();

    fireEvent.click(await screen.findByRole('button', { name: 'Apply Best Promotion' }));
    await waitFor(() => expect(mocks.applyBestPromotionMock).toHaveBeenCalledWith(42));
    expect(await screen.findByText('Best eligible promotion applied')).toBeInTheDocument();
  });
});
