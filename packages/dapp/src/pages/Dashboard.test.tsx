import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Dashboard } from './Dashboard';

const mockUseWallet = vi.fn();
const mockUseShieldedTransfer = vi.fn();
const mockUseViewingKeys = vi.fn();
const mockUseNetwork = vi.fn();

vi.mock('../hooks/useSDK', () => ({
  useWallet: (...args: unknown[]) => mockUseWallet(...args),
  useShieldedTransfer: (...args: unknown[]) => mockUseShieldedTransfer(...args),
  useViewingKeys: (...args: unknown[]) => mockUseViewingKeys(...args),
  useNetwork: (...args: unknown[]) => mockUseNetwork(...args),
}));

describe('Dashboard', () => {
  beforeEach(() => {
    mockUseWallet.mockReturnValue({
      walletInfo: null,
      isConnecting: false,
      error: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
    });
    mockUseShieldedTransfer.mockReturnValue({
      transactions: [],
      isProcessing: false,
      error: null,
      deposit: vi.fn(),
      refreshHistory: vi.fn(),
    });
    mockUseViewingKeys.mockReturnValue({
      keys: [],
      createKey: vi.fn(),
      grantKey: vi.fn(),
      revokeKey: vi.fn(),
      refresh: vi.fn(),
    });
    mockUseNetwork.mockReturnValue({
      network: 'testnet',
      switchNetwork: vi.fn(),
    });
  });

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

  it('renders quick actions when wallet connected', () => {
    mockUseWallet.mockReturnValue({
      walletInfo: { publicKey: 'GA' + 'X'.repeat(54), isConnected: true, network: 'testnet' },
      isConnecting: false,
      error: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
    });
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
    expect(screen.getByText('Quick Actions')).toBeDefined();
    expect(screen.getByText('New Shielded Transfer')).toBeDefined();
    expect(screen.getByText('Manage Viewing Keys')).toBeDefined();
    expect(screen.getByText('Compliance Panel')).toBeDefined();
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
