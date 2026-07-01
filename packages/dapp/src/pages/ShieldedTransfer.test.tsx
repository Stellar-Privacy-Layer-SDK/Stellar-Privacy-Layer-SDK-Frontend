import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ShieldedTransfer } from './ShieldedTransfer';

vi.mock('../hooks/useSDK', () => ({
  useWallet: vi.fn().mockReturnValue({
    walletInfo: { publicKey: 'GA' + 'X'.repeat(54), isConnected: true },
    isConnecting: false,
    error: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
  }),
  useShieldedTransfer: vi.fn().mockReturnValue({
    transactions: [],
    isProcessing: false,
    error: null,
    deposit: vi.fn().mockResolvedValue({
      txHash: 'mock_hash',
      commitmentHash: '0x' + 'a'.repeat(64),
    }),
    refreshHistory: vi.fn(),
  }),
}));

describe('ShieldedTransfer', () => {
  it('renders the form', () => {
    render(
      <MemoryRouter>
        <ShieldedTransfer />
      </MemoryRouter>,
    );
    expect(screen.getByText('Shielded Transfer')).toBeDefined();
    expect(screen.getByText('Recipient (G...)')).toBeDefined();
    expect(screen.getByText('USDC')).toBeDefined();
    expect(screen.getByText('XLM')).toBeDefined();
  });

  it('shows amount and recipient inputs', () => {
    render(
      <MemoryRouter>
        <ShieldedTransfer />
      </MemoryRouter>,
    );
    expect(screen.getByPlaceholderText('0.00')).toBeDefined();
    expect(
      screen.getByPlaceholderText('GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'),
    ).toBeDefined();
  });

  it('renders submit button', () => {
    render(
      <MemoryRouter>
        <ShieldedTransfer />
      </MemoryRouter>,
    );
    expect(screen.getByText('Submit Shielded Transfer')).toBeDefined();
  });

  it('shows how it works section', () => {
    render(
      <MemoryRouter>
        <ShieldedTransfer />
      </MemoryRouter>,
    );
    expect(screen.getByText('How it works')).toBeDefined();
    expect(screen.getByText(/ZK proof using BN254/)).toBeDefined();
  });
});
