import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StrKey } from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ShieldedTransfer } from './ShieldedTransfer';

const usdcContract = 'C' + 'A'.repeat(55);

const mockUseWallet = vi.fn();
const mockUseShieldedTransfer = vi.fn();

vi.mock('../hooks/useSDK', () => ({
  useWallet: (...args: unknown[]) => mockUseWallet(...args),
  useShieldedTransfer: (...args: unknown[]) => mockUseShieldedTransfer(...args),
}));

const validKey = () => StrKey.encodeEd25519PublicKey(Buffer.alloc(32));

const depositMock = vi.fn();

describe('ShieldedTransfer', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_TOKEN_CONTRACTS', JSON.stringify({ USDC: usdcContract }));
    depositMock.mockReset();
    depositMock.mockResolvedValue({
      txHash: 'mock_hash',
      commitmentHash: '0x' + 'a'.repeat(64),
    });
    mockUseWallet.mockReturnValue({
      walletInfo: { publicKey: 'GA' + 'X'.repeat(54), isConnected: true },
      isConnecting: false,
      error: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
    });
    mockUseShieldedTransfer.mockReturnValue({
      transactions: [],
      isProcessing: false,
      error: null,
      deposit: depositMock,
      refreshHistory: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function renderPage() {
    return render(
      <MemoryRouter>
        <ShieldedTransfer />
      </MemoryRouter>,
    );
  }

  it('renders the form', () => {
    renderPage();
    expect(screen.getByText('Shielded Transfer')).toBeDefined();
    expect(screen.getByText('Recipient (G...)')).toBeDefined();
    expect(screen.getByText('USDC')).toBeDefined();
    expect(screen.getByText('XLM')).toBeDefined();
  });

  it('shows amount and recipient inputs', () => {
    renderPage();
    expect(screen.getByPlaceholderText('0.00')).toBeDefined();
    expect(
      screen.getByPlaceholderText('GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'),
    ).toBeDefined();
  });

  it('renders submit button', () => {
    renderPage();
    expect(screen.getByText('Submit Shielded Transfer')).toBeDefined();
  });

  it('shows how it works section', () => {
    renderPage();
    expect(screen.getByText('How it works')).toBeDefined();
    expect(screen.getByText(/ZK proof using BN254/)).toBeDefined();
  });

  it('validates amount and recipient before submitting', () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: 'abc' } });
    fireEvent.change(screen.getByPlaceholderText(/GXXXXXXXXXXXXXXXXXXXX/), {
      target: { value: 'not-a-key' },
    });
    fireEvent.click(screen.getByText('Submit Shielded Transfer'));
    expect(screen.getByText(/Enter a valid amount/)).toBeDefined();
    expect(screen.getByText(/Enter a valid Stellar public key/)).toBeDefined();
    expect(depositMock).not.toHaveBeenCalled();
  });

  it('truncates long memos to 28 characters', async () => {
    renderPage();
    fireEvent.click(screen.getByText('USDC'));
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '100' } });
    fireEvent.change(screen.getByPlaceholderText(/GXXXXXXXXXXXXXXXXXXXX/), {
      target: { value: validKey() },
    });
    fireEvent.change(screen.getByPlaceholderText('Reference'), {
      target: { value: 'x'.repeat(40) },
    });
    fireEvent.click(screen.getByText('Submit Shielded Transfer'));
    await waitFor(() => {
      expect(screen.getByText('Transfer Submitted')).toBeDefined();
    });
    expect(depositMock).toHaveBeenCalledWith('100', usdcContract, validKey(), 'x'.repeat(28));
  });

  it('submits a deposit and shows the completion screen', async () => {
    renderPage();
    fireEvent.click(screen.getByText('USDC'));
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '100' } });
    fireEvent.change(screen.getByPlaceholderText(/GXXXXXXXXXXXXXXXXXXXX/), {
      target: { value: validKey() },
    });
    fireEvent.click(screen.getByText('Submit Shielded Transfer'));

    await waitFor(() => {
      expect(screen.getByText('Transfer Submitted')).toBeDefined();
    });
    expect(depositMock).toHaveBeenCalledWith('100', usdcContract, validKey(), undefined);
    expect(screen.getByText('mock_hash')).toBeDefined();

    fireEvent.click(screen.getByText('New Transfer'));
    expect(screen.getByText('Submit Shielded Transfer')).toBeDefined();
  });

  it('returns to the form when the deposit fails', async () => {
    depositMock.mockRejectedValueOnce(new Error('network down'));
    renderPage();
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '100' } });
    fireEvent.change(screen.getByPlaceholderText(/GXXXXXXXXXXXXXXXXXXXX/), {
      target: { value: validKey() },
    });
    fireEvent.click(screen.getByText('Submit Shielded Transfer'));

    await waitFor(() => {
      expect(screen.getByText('Submit Shielded Transfer')).toBeDefined();
    });
  });
});
