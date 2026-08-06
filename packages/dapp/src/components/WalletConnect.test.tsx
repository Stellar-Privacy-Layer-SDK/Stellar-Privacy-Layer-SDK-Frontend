import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WalletConnect } from './WalletConnect';

const mockUseWallet = vi.fn();
vi.mock('../hooks/useSDK', () => ({
  useWallet: (...args: unknown[]) => mockUseWallet(...args),
}));

const address = 'GA' + 'X'.repeat(54);

describe('WalletConnect', () => {
  beforeEach(() => {
    mockUseWallet.mockReturnValue({
      walletInfo: null,
      isConnecting: false,
      error: null,
      connect: vi.fn().mockResolvedValue({ publicKey: address }),
      disconnect: vi.fn(),
    });
  });

  it('shows a connect button when disconnected', () => {
    render(<WalletConnect />);
    expect(screen.getByText('Connect Freighter')).toBeDefined();
  });

  it('calls connect on click', () => {
    render(<WalletConnect />);
    fireEvent.click(screen.getByText('Connect Freighter'));
    expect(mockUseWallet().connect).toHaveBeenCalled();
  });

  it('shows the truncated address when connected', () => {
    mockUseWallet.mockReturnValue({
      walletInfo: { publicKey: address, isConnected: true, network: 'testnet' },
      isConnecting: false,
      error: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
    });
    render(<WalletConnect />);
    expect(screen.getByText('GAXXXX...XXXX')).toBeDefined();
  });

  it('disconnects when clicking the disconnect button', () => {
    const disconnect = vi.fn();
    mockUseWallet.mockReturnValue({
      walletInfo: { publicKey: address, isConnected: true, network: 'testnet' },
      isConnecting: false,
      error: null,
      connect: vi.fn(),
      disconnect,
    });
    render(<WalletConnect />);
    fireEvent.click(screen.getByText('Disconnect'));
    expect(disconnect).toHaveBeenCalled();
  });

  it('shows connection errors', () => {
    mockUseWallet.mockReturnValue({
      walletInfo: null,
      isConnecting: false,
      error: 'Freighter is locked',
      connect: vi.fn(),
      disconnect: vi.fn(),
    });
    render(<WalletConnect />);
    expect(screen.getByText('Freighter is locked')).toBeDefined();
  });
});
