import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StrKey } from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';
import { render, screen, fireEvent } from '@testing-library/react';
import { ViewingKeys } from './ViewingKeys';

// Deterministic, checksum-valid Stellar public key (avoids noble RNG in jsdom).
const validKey = () => StrKey.encodeEd25519PublicKey(Buffer.alloc(32));

const mockUseWallet = vi.fn();
const mockUseViewingKeys = vi.fn();

vi.mock('../hooks/useSDK', () => ({
  useWallet: (...args: unknown[]) => mockUseWallet(...args),
  useViewingKeys: (...args: unknown[]) => mockUseViewingKeys(...args),
}));

const connected = {
  walletInfo: { publicKey: 'GA' + 'X'.repeat(54), isConnected: true, network: 'testnet' },
  isConnecting: false,
  error: null,
  connect: vi.fn(),
  disconnect: vi.fn(),
};

function makeKey(overrides: Record<string, unknown> = {}) {
  return {
    id: 'key-1',
    label: 'Audit Key',
    publicKey: 'ab'.repeat(32),
    encryptedPrivateKey: '02:v0:salt:iv:cipher',
    createdAt: Date.now(),
    grantedBy: 'self',
    scope: 'full',
    active: true,
    ...overrides,
  };
}

describe('ViewingKeys', () => {
  beforeEach(() => {
    mockUseWallet.mockReturnValue(connected);
    mockUseViewingKeys.mockReturnValue({
      keys: [makeKey()],
      createKey: vi.fn().mockResolvedValue({}),
      grantKey: vi.fn().mockResolvedValue({}),
      revokeKey: vi.fn().mockResolvedValue(undefined),
      getPrivateKey: vi.fn().mockReturnValue('deadbeef'),
      refresh: vi.fn(),
    });
  });

  it('requires a wallet connection', () => {
    mockUseWallet.mockReturnValue({ ...connected, walletInfo: null });
    render(<ViewingKeys />);
    expect(screen.getByText('Connect Your Wallet')).toBeDefined();
  });

  it('renders active keys', () => {
    render(<ViewingKeys />);
    expect(screen.getByText('Audit Key')).toBeDefined();
    expect(screen.getByText('full')).toBeDefined();
  });

  it('creates a key via the create modal', async () => {
    render(<ViewingKeys />);
    fireEvent.click(screen.getByText('Create Key'));
    fireEvent.change(screen.getByPlaceholderText(/Audit Q3/), {
      target: { value: 'New Key' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Viewing Key' }));
    expect(mockUseViewingKeys().createKey).toHaveBeenCalledWith('New Key', 'full');
  });

  it('rejects invalid grant recipients', () => {
    render(<ViewingKeys />);
    fireEvent.click(screen.getByText('Grant Key'));
    fireEvent.change(screen.getByPlaceholderText(/GXXXXXXXXXXXXXXXXXXXX/), {
      target: { value: 'not-a-key' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Grant Viewing Key' }));
    expect(mockUseViewingKeys().grantKey).not.toHaveBeenCalled();
  });

  it('grants a key to a valid recipient', async () => {
    render(<ViewingKeys />);
    fireEvent.click(screen.getByText('Grant Key'));
    fireEvent.change(screen.getByPlaceholderText(/GXXXXXXXXXXXXXXXXXXXX/), {
      target: { value: validKey() },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Grant Viewing Key' }));
    expect(mockUseViewingKeys().grantKey).toHaveBeenCalled();
  });

  it('revokes a key', () => {
    render(<ViewingKeys />);
    fireEvent.click(screen.getByLabelText(/Revoke key/));
    expect(mockUseViewingKeys().revokeKey).toHaveBeenCalledWith('key-1');
  });

  it('hides private keys unless debug mode is enabled', () => {
    render(<ViewingKeys />);
    fireEvent.click(screen.getByTitle('Show private key'));
    expect(screen.getByText(/Private key hidden/)).toBeDefined();
  });
});
