import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { Layout } from './Layout';

vi.mock('../hooks/useSDK', () => ({
  useWallet: () => ({
    walletInfo: null,
    isConnecting: false,
    error: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
  }),
  useNetwork: () => ({ network: 'testnet', switchNetwork: vi.fn() }),
}));

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<div>Home content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('Layout', () => {
  it('renders the brand and navigation items', () => {
    renderLayout();
    expect(screen.getByText('Stellar Privacy')).toBeDefined();
    expect(screen.getByText('Dashboard')).toBeDefined();
    expect(screen.getByText('Shielded Transfer')).toBeDefined();
    expect(screen.getByText('Compliance')).toBeDefined();
    expect(screen.getByText('Viewing Keys')).toBeDefined();
    expect(screen.getByText('History')).toBeDefined();
  });

  it('renders outlet content', () => {
    renderLayout();
    expect(screen.getByText('Home content')).toBeDefined();
  });

  it('opens and closes the mobile sidebar', () => {
    renderLayout();
    const openButton = screen.getByLabelText('Open sidebar');
    fireEvent.click(openButton);
    const closeButton = screen.getByLabelText('Close sidebar');
    expect(closeButton).toBeDefined();
    fireEvent.click(closeButton);
    expect(screen.getByLabelText('Open sidebar')).toBeDefined();
  });
});
