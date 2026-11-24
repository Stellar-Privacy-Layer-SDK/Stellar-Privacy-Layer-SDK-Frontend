import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { TransactionHistory } from './History';

const refresh = vi.fn();
const mockUseWallet = vi.fn();
const mockUseShieldedTransfer = vi.fn();

vi.mock('../hooks/useSDK', () => ({
  useWallet: (...args: unknown[]) => mockUseWallet(...args),
  usePool: (...args: unknown[]) => mockUseShieldedTransfer(...args),
}));

const connected = {
  walletInfo: { publicKey: 'GA' + 'X'.repeat(54), isConnected: true, network: 'testnet' },
  isConnecting: false,
  error: null,
  connect: vi.fn(),
  disconnect: vi.fn(),
};

describe('TransactionHistory', () => {
  beforeEach(() => {
    mockUseWallet.mockReturnValue(connected);
    mockUseShieldedTransfer.mockReturnValue({
      transactions: [],
      isProcessing: false,
      error: null,
      deposit: vi.fn(),
      refresh,
    });
  });

  it('requires a wallet connection', () => {
    mockUseWallet.mockReturnValue({ ...connected, walletInfo: null });
    render(
      <MemoryRouter>
        <TransactionHistory />
      </MemoryRouter>,
    );
    expect(screen.getByText('Connect Your Wallet')).toBeDefined();
  });

  it('shows an empty state', () => {
    render(
      <MemoryRouter>
        <TransactionHistory />
      </MemoryRouter>,
    );
    expect(screen.getByText('No transactions yet')).toBeDefined();
  });

  it('renders transaction rows', () => {
    mockUseShieldedTransfer.mockReturnValue({
      transactions: [
        {
          txHash: '0x' + 'a'.repeat(64),
          commitmentHash: '0x' + 'b'.repeat(64),
          nullifier: '0x' + 'c'.repeat(64),
          amount: '100',
          token: 'USDC',
          recipient: 'GA' + 'X'.repeat(54),
          timestamp: Date.now(),
          status: 'confirmed',
        },
        {
          txHash: '0x' + 'd'.repeat(64),
          commitmentHash: '0x' + 'e'.repeat(64),
          nullifier: '0x' + 'f'.repeat(64),
          amount: '50',
          token: 'XLM',
          recipient: 'GA' + 'Y'.repeat(54),
          timestamp: Date.now(),
          status: 'pending',
        },
      ],
      isProcessing: false,
      error: null,
      deposit: vi.fn(),
      refresh,
    });
    render(
      <MemoryRouter>
        <TransactionHistory />
      </MemoryRouter>,
    );
    expect(screen.getByText('100 USDC')).toBeDefined();
    expect(screen.getByText('50 XLM')).toBeDefined();
    expect(screen.getByText('Confirmed')).toBeDefined();
    expect(screen.getByText('Pending')).toBeDefined();
  });

  it('polls while transactions are pending and stops on unmount', () => {
    vi.useFakeTimers();
    refresh.mockClear();
    mockUseShieldedTransfer.mockReturnValue({
      transactions: [
        {
          type: 'withdrawal',
          txHash: 'h',
          commitmentHash: '0x' + 'b'.repeat(64),
          nullifier: 'n',
          amount: '1',
          token: 'XLM',
          recipient: 'GA' + 'X'.repeat(54),
          timestamp: 1,
          status: 'pending',
        },
      ],
      refresh,
    });
    const { unmount } = render(
      <MemoryRouter>
        <TransactionHistory />
      </MemoryRouter>,
    );
    expect(screen.getByText('Withdrawal')).toBeDefined();
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_000);
    expect(refresh).toHaveBeenCalledTimes(2);
    unmount();
    vi.advanceTimersByTime(30_000);
    expect(refresh).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
