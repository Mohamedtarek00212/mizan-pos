import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/i18n';
import { CategoriesPage } from './CategoriesPage';

vi.mock('./categoriesApi', () => ({
  categoriesApi: {
    list: vi.fn().mockResolvedValue({
      categories: [{ id: 1, name: 'Beverages', created_at: '', updated_at: '' }],
    }),
    create: vi.fn(),
    rename: vi.fn(),
  },
}));

describe('CategoriesPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders the loaded categories (English)', async () => {
    render(<CategoriesPage />);

    expect(screen.getByRole('heading', { name: 'Categories' })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Beverages')).toBeInTheDocument();
    });
  });

  it('renders correctly in Arabic', async () => {
    await i18n.changeLanguage('ar');
    render(<CategoriesPage />);

    expect(screen.getByRole('heading', { name: 'الفئات' })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Beverages')).toBeInTheDocument();
    });
  });
});
