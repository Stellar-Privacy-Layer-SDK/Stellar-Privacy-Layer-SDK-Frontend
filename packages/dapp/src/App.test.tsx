import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import App from './App';

vi.mock('./hooks/useSDK', () => ({
  useSDK: () => ({}),
  useSDKReady: () => true,
  useWallet: () => ({
    walletInfo: null,
    isConnecting: false,
    error: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
  }),
  useShieldedTransfer: () => ({
    transactions: [],
    isProcessing: false,
    error: null,
    deposit: vi.fn(),
    refreshHistory: vi.fn(),
  }),
  useViewingKeys: () => ({
    keys: [],
    createKey: vi.fn(),
    grantKey: vi.fn(),
    revokeKey: vi.fn(),
    getPrivateKey: vi.fn(),
    refresh: vi.fn(),
  }),
  useNetwork: () => ({ network: 'testnet', switchNetwork: vi.fn() }),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('App routing', () => {
  it('renders the dashboard at /', () => {
    renderAt('/');
    expect(screen.getByText('Welcome to Stellar Privacy Layer')).toBeDefined();
  });

  it('renders the shielded transfer page', () => {
    renderAt('/shielded-transfer');
    expect(screen.getByText('Connect Your Wallet')).toBeDefined();
  });

  it('renders the compliance page', () => {
    renderAt('/compliance');
    expect(screen.getByText('Disclose to Regulator')).toBeDefined();
  });

  it('renders the viewing keys page', () => {
    renderAt('/viewing-keys');
    expect(screen.getByText('Connect Your Wallet')).toBeDefined();
  });

  it('renders the history page', () => {
    renderAt('/history');
    expect(screen.getByText('Connect Your Wallet')).toBeDefined();
  });
});
