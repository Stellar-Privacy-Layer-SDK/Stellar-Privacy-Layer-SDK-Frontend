import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Buffer } from 'buffer';
import { StrKey } from '@stellar/stellar-sdk';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { Withdraw } from './Withdraw';

const mockUseWallet = vi.fn();
const mockPool = vi.fn();
const quoteWithdrawal = vi.fn();
const sdk = { pool: { quoteWithdrawal, getInfo: async () => ({ decimals: 7 }) } };
vi.mock('../hooks/useSDK', () => ({
  useSDK: () => sdk,
  useWallet: () => mockUseWallet(),
  usePool: () => mockPool(),
}));

const recipient = StrKey.encodeEd25519PublicKey(Buffer.alloc(32));
const commitment = {
  commitment: '0x' + 'a'.repeat(64),
  nullifier: '0x' + 'b'.repeat(64),
  amount: '42',
  token: 'native',
  status: 'available',
  timestamp: 1,
};
const withdraw = vi.fn();
const importNote = vi.fn();

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
    quoteWithdrawal.mockResolvedValue({ fee: '5000000', received: '1' });
    withdraw.mockReset().mockResolvedValue({ txHash: 'w' });
    mockUseWallet.mockReturnValue({ walletInfo: { isConnected: true } });
    mockPool.mockReturnValue({
      notes: [commitment], isProcessing: false, error: null, withdraw, importNote,
    });
  });

  it('requires a wallet', () => {
    mockUseWallet.mockReturnValue({ walletInfo: null });
    renderPage();
    expect(screen.getByText('Connect Your Wallet')).toBeDefined();
  });

  it('shows an empty state', () => {
    mockPool.mockReturnValue({ notes: [], isProcessing: false, error: null, withdraw });
    renderPage();
    expect(screen.getByText('No notes to withdraw')).toBeDefined();
  });

  it('validates the form', async () => {
    renderPage();
    await screen.findByText('Relayer fee: 0.5000000');
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    expect(screen.getByText('Select a note to withdraw')).toBeDefined();
    expect(screen.getByText(/valid Stellar public key/)).toBeDefined();
    expect(withdraw).not.toHaveBeenCalled();
  });

  it('withdraws the selected commitment and opens the history', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('radio'));
    fireEvent.change(screen.getByLabelText('Recipient (G...)'), { target: { value: recipient } });
    await screen.findByText('Relayer fee: 0.5000000');
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    await waitFor(() => expect(screen.getByText('History page')).toBeDefined());
    expect(withdraw).toHaveBeenCalledWith(commitment, recipient, '5000000');
  });

  it('stays on the page when the withdrawal fails', async () => {
    withdraw.mockRejectedValue(new Error('nope'));
    renderPage();
    fireEvent.click(screen.getByRole('radio'));
    fireEvent.change(screen.getByLabelText('Recipient (G...)'), { target: { value: recipient } });
    await screen.findByText('Relayer fee: 0.5000000');
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    await waitFor(() => expect(withdraw).toHaveBeenCalled());
    expect(screen.queryByText('History page')).toBeNull();
  });

  it('hides spent notes and restores backups', async () => {
    mockPool.mockReturnValue({
      notes: [{ ...commitment, status: 'spent' }], isProcessing: false, error: null, withdraw, importNote,
    });
    renderPage();
    expect(screen.queryByRole('radio')).toBeNull();
    fireEvent.change(screen.getByLabelText('Restore a note backup'), { target: { value: 'b' } });
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(importNote).toHaveBeenCalledWith('b'));
  });

  it('blocks withdrawals when there is no quote', async () => {
    quoteWithdrawal.mockRejectedValue(new Error('Relayer error: HTTP 500'));
    renderPage();
    expect(await screen.findByText(/HTTP 500/)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Withdraw' })).toHaveProperty('disabled', true);
  });
});
