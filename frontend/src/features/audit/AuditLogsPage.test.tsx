import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../../i18n/i18n';
import { AuditLogsPage } from './AuditLogsPage';

const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('./auditApi', () => ({ auditApi: { list: (...args: unknown[]) => mocks.list(...args) } }));

describe('AuditLogsPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    mocks.list.mockReset();
    mocks.list.mockResolvedValue({
      total: 1,
      logs: [
        {
          id: 9,
          actor_id: 1,
          actor_username: 'admin',
          actor_name: 'Administrator',
          action_type: 'PRODUCT_UPDATED',
          entity_type: 'PRODUCT',
          entity_id: 3,
          reason: 'Price correction',
          before_snapshot: { price: 10 },
          after_snapshot: { price: 12 },
          created_at: '2026-09-12T12:00:00Z',
        },
      ],
    });
  });

  it('shows an immutable entry and expands its before/after snapshots', async () => {
    render(
      <MemoryRouter>
        <AuditLogsPage />
      </MemoryRouter>,
    );
    const entry = await screen.findByRole('button', { name: /Product updated/ });
    expect(screen.getByText('1 audit entries')).toBeInTheDocument();
    fireEvent.click(entry);
    expect(screen.getByText('Before')).toBeInTheDocument();
    expect(screen.getByText(/"price": 10/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });
});
