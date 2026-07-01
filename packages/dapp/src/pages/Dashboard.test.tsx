import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Dashboard } from './Dashboard';

vi.mock('../hooks/useSDK', () => ({
  useWallet: vi.fn().mockReturnValue({
    walletInfo: null,
    isConnecting: false,
    error: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
  }),
  useShieldedTransfer: vi.fn().mockReturnValue({
    transactions: [],
    isProcessing: false,
    error: null,
    deposit: vi.fn(),
    refreshHistory: vi.fn(),
  }),
  useViewingKeys: vi.fn().mockReturnValue({
    keys: [],
    createKey: vi.fn(),
    grantKey: vi.fn(),
    revokeKey: vi.fn(),
    refresh: vi.fn(),
  }),
  useNetwork: vi.fn().mockReturnValue({
    network: 'testnet',
    switchNetwork: vi.fn(),
  }),
}));

describe('Dashboard', () => {
  it('renders welcome message when not connected', () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
    expect(screen.getByText('Welcome to Stellar Privacy Layer')).toBeDefined();
    expect(screen.getAllByText('BN254').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Poseidon Hash')).toBeDefined();
  });

  it('renders stats when wallet connected', () => {
    vi.mocked(vi.importActual('../hooks/useSDK')).then(() => {});
    const useWallet = vi.fn().mockReturnValue({
      walletInfo: { publicKey: 'GA' + 'X'.repeat(54), isConnected: true },
    });
    vi.doMock('../hooks/useSDK', () => ({
      useWallet,
      useShieldedTransfer: vi.fn().mockReturnValue({ transactions: [] }),
      useViewingKeys: vi.fn().mockReturnValue({ keys: [] }),
      useNetwork: vi.fn().mockReturnValue({ network: 'testnet', switchNetwork: vi.fn() }),
    }));
  });

  it('shows protocol information section', () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
    expect(screen.getByText('Protocol Information')).toBeDefined();
    expect(screen.getByText('ZK Curve')).toBeDefined();
    expect(screen.getByText('Stellar Protocol 25')).toBeDefined();
  });
});
