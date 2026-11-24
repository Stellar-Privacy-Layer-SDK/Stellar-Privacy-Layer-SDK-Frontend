import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Dashboard } from './Dashboard';

const mockUseWallet = vi.fn();
const mockUseShieldedTransfer = vi.fn();
const mockUseViewingKeys = vi.fn();
const mockUseNetwork = vi.fn();

vi.mock('../hooks/useSDK', () => ({
  useWallet: (...args: unknown[]) => mockUseWallet(...args),
  usePool: (...args: unknown[]) => mockUseShieldedTransfer(...args),
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
      notes: [],
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
    expect(screen.getByText('New Deposit')).toBeDefined();
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

  it('shows live statistics', () => {
    mockUseShieldedTransfer.mockReturnValue({
      transactions: [{}, {}, {}, {}],
      notes: [{ status: 'available' }, { status: 'spent' }],
    });
    mockUseViewingKeys.mockReturnValue({
      keys: [{ active: true }, { active: true }, { active: false }, { active: true, expiresAt: 1 }],
    });
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
    const value = (label: string) =>
      screen.getByText(label).parentElement?.nextElementSibling?.textContent;
    expect(value('Total Shielded Transactions')).toBe('4');
    expect(value('Active Viewing Keys')).toBe('2');
    expect(value('Unspent Notes')).toBe('1');
  });
});
