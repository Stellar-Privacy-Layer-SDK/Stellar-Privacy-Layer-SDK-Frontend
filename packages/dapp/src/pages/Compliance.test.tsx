import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StrKey } from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Compliance } from './Compliance';

// Deterministic, checksum-valid Stellar public key (avoids noble RNG in jsdom).
const validKey = () => StrKey.encodeEd25519PublicKey(Buffer.alloc(32));

const mockUseWallet = vi.fn();
const mockUseShieldedTransfer = vi.fn();
const mockUseSDK = vi.fn();

vi.mock('../hooks/useSDK', () => ({
  useWallet: (...args: unknown[]) => mockUseWallet(...args),
  usePool: (...args: unknown[]) => mockUseShieldedTransfer(...args),
  useSDK: (...args: unknown[]) => mockUseSDK(...args),
}));

const regulator = () => validKey();

describe('Compliance', () => {
  beforeEach(() => {
    mockUseWallet.mockReturnValue({
      walletInfo: { publicKey: 'GA' + 'X'.repeat(54), isConnected: true, network: 'testnet' },
      isConnecting: false,
      error: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
    });
    mockUseShieldedTransfer.mockReturnValue({
      transactions: [{ txHash: 'tx1' }],
      isProcessing: false,
      error: null,
      deposit: vi.fn(),
      refreshHistory: vi.fn(),
    });
    mockUseSDK.mockReturnValue({
      selectiveDisclosure: {
        disclose: vi.fn().mockResolvedValue({ reference: '0x' + 'd'.repeat(64), payloads: [] }),
      },
    });
  });

  it('renders the disclosure form', () => {
    render(
      <MemoryRouter>
        <Compliance />
      </MemoryRouter>,
    );
    expect(screen.getByText('Disclose to Regulator')).toBeDefined();
    expect(screen.getByText('Full Disclosure')).toBeDefined();
    expect(screen.getByText('Amount Only')).toBeDefined();
    expect(screen.getByText('Recipient Only')).toBeDefined();
  });

  it('rejects an invalid regulator key', () => {
    render(
      <MemoryRouter>
        <Compliance />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByPlaceholderText(/GXXXXXXXXXXXXXXXXXXXX/), {
      target: { value: 'invalid' },
    });
    fireEvent.click(screen.getByText('Prepare Disclosure'));
    expect(screen.getByText('Enter a valid Stellar public key')).toBeDefined();
  });

  it('submits a disclosure and shows the result hash', async () => {
    render(
      <MemoryRouter>
        <Compliance />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByPlaceholderText(/GXXXXXXXXXXXXXXXXXXXX/), {
      target: { value: regulator() },
    });
    fireEvent.click(screen.getByText('Prepare Disclosure'));

    await waitFor(() => {
      expect(mockUseSDK().selectiveDisclosure.disclose).toHaveBeenCalled();
    });
    expect(await screen.findByText('Disclosure Reference')).toBeDefined();
    expect(screen.getByText(/nothing is published on-chain/)).toBeDefined();
  });

  it('shows a warning when there are no transactions', () => {
    mockUseShieldedTransfer.mockReturnValue({
      transactions: [],
      isProcessing: false,
      error: null,
      deposit: vi.fn(),
      refreshHistory: vi.fn(),
    });
    render(
      <MemoryRouter>
        <Compliance />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByPlaceholderText(/GXXXXXXXXXXXXXXXXXXXX/), {
      target: { value: regulator() },
    });
    fireEvent.click(screen.getByText('Prepare Disclosure'));
    expect(screen.getByText('No transactions to disclose')).toBeDefined();
  });
});
