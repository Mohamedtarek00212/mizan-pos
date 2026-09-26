import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/i18n';
import { ApiError } from '../../shared/api/apiClient';
import { OpenRegisterPage } from './OpenRegisterPage';

const openSessionMock = vi.fn();
const listMock = vi.fn();

vi.mock('./registersApi', () => ({
  registersApi: {
    list: () => listMock(),
    openSession: (...args: unknown[]) => openSessionMock(...args),
  },
}));

function renderAtRegisterOne() {
  return render(
    <MemoryRouter initialEntries={['/registers/1/open']}>
      <Routes>
        <Route path="/registers/:id/open" element={<OpenRegisterPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('OpenRegisterPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    openSessionMock.mockReset();
    listMock.mockReset();
    listMock.mockResolvedValue({
      registers: [{ id: 1, code: 'REG-1', display_name: 'Main register', is_active: true, current_session_status: 'CLOSED' }],
    });
  });

  it('validates starting cash before submitting (English)', async () => {
    renderAtRegisterOne();
    expect(screen.getByRole('heading', { name: 'Open Register' })).toBeInTheDocument();

    await screen.findByLabelText('Starting Cash');
    fireEvent.click(screen.getByRole('button', { name: 'Open Register' }));
    expect(await screen.findByText('Starting cash is required')).toBeInTheDocument();
    expect(openSessionMock).not.toHaveBeenCalled();
  });

  it('submits the starting cash amount on confirm', async () => {
    openSessionMock.mockResolvedValue({
      id: 42,
      register_id: 1,
      register_code: 'REG-1',
      register_name: 'Main register',
      cashier_id: 1,
      cashier_name: 'Cash Ier',
      status: 'OPEN',
      starting_cash: 150,
    });
    renderAtRegisterOne();

    await screen.findByLabelText('Starting Cash');
    fireEvent.change(screen.getByLabelText('Starting Cash'), { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open Register' }));

    await waitFor(() => {
      expect(openSessionMock).toHaveBeenCalledWith(1, 150);
    });
  });

  it('surfaces a translated message for a known conflict error', async () => {
    openSessionMock.mockRejectedValue(
      new ApiError(409, 'CONFLICT', 'This register already has an open session', {
        conflict_type: 'REGISTER_ALREADY_OPEN',
      }),
    );
    renderAtRegisterOne();

    await screen.findByLabelText('Starting Cash');
    fireEvent.change(screen.getByLabelText('Starting Cash'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open Register' }));

    expect(
      await screen.findByText('This register already has an open session.'),
    ).toBeInTheDocument();
  });

  it('renders correctly in Arabic', async () => {
    await i18n.changeLanguage('ar');
    renderAtRegisterOne();
    expect(screen.getByRole('heading', { name: 'فتح الخزينة' })).toBeInTheDocument();
    expect(await screen.findByLabelText('النقدية الافتتاحية')).toBeInTheDocument();
  });
});
