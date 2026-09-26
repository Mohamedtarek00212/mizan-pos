import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatCurrencyEGP, formatNumber } from '../../i18n/formatters';
import i18n from '../../i18n/i18n';
import { ProductsPage } from './ProductsPage';

/**
 * `Intl` currency/number formatting can insert invisible bidi control
 * marks (e.g. U+200E/U+200F) and non-breaking spaces that vary subtly by
 * ICU version - strip/collapse those before comparing so the assertion
 * targets the meaningful formatted text, not incidental whitespace.
 */
function normalizeFormattedText(value: string): string {
  return value
    .replace(/[\u200e\u200f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function byNormalizedText(expected: string) {
  return (_content: string, element: Element | null) =>
    normalizeFormattedText(element?.textContent ?? '') === normalizeFormattedText(expected);
}

vi.mock('./categoriesApi', () => ({
  categoriesApi: {
    list: vi.fn().mockResolvedValue({ categories: [{ id: 1, name: 'Beverages' }] }),
  },
}));

vi.mock('./productsApi', () => ({
  productsApi: {
    list: vi.fn().mockResolvedValue({
      products: [
        {
          id: 1,
          sku: 'SKU-1',
          barcode: '12345',
          name: 'Cola Can',
          category_id: 1,
          category_name: 'Beverages',
          current_price: 1.5,
          current_stock: 100,
          reorder_threshold: 10,
          is_active: true,
          effective_tax_rate_pct: 14,
          created_at: '',
          updated_at: '',
        },
      ],
      total: 1,
    }),
  },
}));

describe('ProductsPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders the loaded product list with locale-aware price/stock (English)', async () => {
    render(
      <MemoryRouter>
        <ProductsPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Products' })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Cola Can')).toBeInTheDocument();
    });
    expect(screen.getByText(byNormalizedText(formatCurrencyEGP(1.5, 'en')))).toBeInTheDocument();
    expect(screen.getByText(byNormalizedText(formatNumber(100, 'en')))).toBeInTheDocument();
  });

  it('renders correctly in Arabic with RTL-appropriate locale formatting', async () => {
    await i18n.changeLanguage('ar');
    render(
      <MemoryRouter>
        <ProductsPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'المنتجات' })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Cola Can')).toBeInTheDocument();
    });
    expect(screen.getByText(byNormalizedText(formatCurrencyEGP(1.5, 'ar')))).toBeInTheDocument();
    expect(screen.getByText(byNormalizedText(formatNumber(100, 'ar')))).toBeInTheDocument();
  });
});
