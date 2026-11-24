import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Deposit } from './Deposit';

const mocks = vi.hoisted(() => ({
  useWallet: vi.fn(), usePool: vi.fn(), getInfo: vi.fn(), deposit: vi.fn(),
}));
vi.mock('../hooks/useSDK', () => {
  const sdk = { pool: { getInfo: mocks.getInfo, exportNote: () => 'backup' } };
  return { useWallet: mocks.useWallet, usePool: mocks.usePool, useSDK: () => sdk };
});

describe('Deposit', () => {
  beforeEach(() => {
    mocks.useWallet.mockReturnValue({ walletInfo: { isConnected: true } });
    mocks.usePool.mockReturnValue({ isProcessing: false, error: null, deposit: mocks.deposit });
    mocks.getInfo.mockResolvedValue({
      token: 'CTOKEN', decimals: 7, denomination: '1000000000', depositCount: 7, root: '0x0',
    });
    mocks.deposit.mockResolvedValue({ txHash: 't', note: { commitment: '0x1' } });
  });

  it('requires a wallet', () => {
    mocks.useWallet.mockReturnValue({ walletInfo: null });
    render(<Deposit />);
    expect(screen.getByText('Connect Your Wallet')).toBeDefined();
  });

  it('shows the pool and offers a backup after depositing', async () => {
    render(<Deposit />);
    expect(await screen.findByText('100.0000000')).toBeDefined();
    expect(screen.getByText('7')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Deposit' }));
    expect(await screen.findByText('Back up your note')).toBeDefined();
  });

  it('disables deposits when the pool cannot be read', async () => {
    mocks.getInfo.mockRejectedValue(new Error('Contract not set'));
    render(<Deposit />);
    expect(await screen.findByText(/Contract not set/)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Deposit' })).toHaveProperty('disabled', true);
  });

  it('offers no backup when the deposit fails', async () => {
    mocks.deposit.mockRejectedValue(new Error('declined'));
    render(<Deposit />);
    await screen.findByText('100.0000000');
    fireEvent.click(screen.getByRole('button', { name: 'Deposit' }));
    await vi.waitFor(() => expect(mocks.deposit).toHaveBeenCalled());
    expect(screen.queryByText('Back up your note')).toBeNull();
  });
});
