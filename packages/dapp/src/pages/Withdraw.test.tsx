import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Buffer } from 'buffer';
import { StrKey } from '@stellar/stellar-sdk';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { Withdraw } from './Withdraw';

const mockUseWallet = vi.fn();
const mockUseShieldedTransfer = vi.fn();
vi.mock('../hooks/useSDK', () => ({
  useWallet: () => mockUseWallet(),
  useShieldedTransfer: () => mockUseShieldedTransfer(),
}));

const recipient = StrKey.encodeEd25519PublicKey(Buffer.alloc(32));
const commitment = {
  hash: '0x' + 'a'.repeat(64),
  nullifier: '0x' + 'b'.repeat(64),
  amount: '42',
  token: 'native',
  recipient,
  timestamp: 1,
};
const withdraw = vi.fn();

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/withdraw']}>
      <Routes>
        <Route path="/withdraw" element={<Withdraw />} />
        <Route path="/history" element={<p>History page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Withdraw', () => {
  beforeEach(() => {
    withdraw.mockReset().mockResolvedValue({ txHash: 'w' });
    mockUseWallet.mockReturnValue({ walletInfo: { isConnected: true } });
    mockUseShieldedTransfer.mockReturnValue({
      commitments: [commitment], isProcessing: false, error: null, withdraw,
    });
  });

  it('requires a wallet', () => {
    mockUseWallet.mockReturnValue({ walletInfo: null });
    renderPage();
    expect(screen.getByText('Connect Your Wallet')).toBeDefined();
  });

  it('shows an empty state', () => {
    mockUseShieldedTransfer.mockReturnValue({ commitments: [], isProcessing: false, error: null, withdraw });
    renderPage();
    expect(screen.getByText('No commitments to withdraw')).toBeDefined();
  });

  it('validates the form', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    expect(screen.getByText('Select a commitment to withdraw')).toBeDefined();
    expect(screen.getByText(/valid Stellar public key/)).toBeDefined();
    expect(withdraw).not.toHaveBeenCalled();
  });

  it('withdraws the selected commitment and opens the history', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('radio'));
    fireEvent.change(screen.getByLabelText('Recipient (G...)'), { target: { value: recipient } });
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    await waitFor(() => expect(screen.getByText('History page')).toBeDefined());
    expect(withdraw).toHaveBeenCalledWith(commitment, recipient);
  });

  it('stays on the page when the withdrawal fails', async () => {
    withdraw.mockRejectedValue(new Error('nope'));
    renderPage();
    fireEvent.click(screen.getByRole('radio'));
    fireEvent.change(screen.getByLabelText('Recipient (G...)'), { target: { value: recipient } });
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    await waitFor(() => expect(withdraw).toHaveBeenCalled());
    expect(screen.queryByText('History page')).toBeNull();
  });
});
