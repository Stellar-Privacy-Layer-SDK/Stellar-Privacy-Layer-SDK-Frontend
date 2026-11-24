import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { UnlockGate } from './UnlockGate';

const mocks = vi.hoisted(() => ({ has: vi.fn(), unlock: vi.fn(), setStorage: vi.fn() }));
vi.mock('@stellar-privacy/sdk', () => ({
  createLocalStorageProvider: () => ({}),
  hasEncryptedStorage: mocks.has,
  unlockEncryptedStorage: mocks.unlock,
}));
vi.mock('../hooks/useSDK', () => ({ setSDKStorage: mocks.setStorage }));

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('UnlockGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.has.mockResolvedValue(false);
    mocks.unlock.mockResolvedValue({ encrypted: true });
    render(<UnlockGate>app</UnlockGate>);
  });

  describe('first use', () => {
    it('validates the new password, then shows the app', async () => {
      const submit = await screen.findByRole('button', { name: 'Continue' });
      type('Password', 'short');
      fireEvent.click(submit);
      expect(screen.getByRole('alert').textContent).toContain('at least');
      type('Password', 'long enough password');
      fireEvent.click(submit);
      expect(screen.getByRole('alert').textContent).toContain('do not match');
      expect(mocks.unlock).not.toHaveBeenCalled();
      type('Confirm password', 'long enough password');
      fireEvent.click(submit);
      expect(await screen.findByText('app')).toBeDefined();
      expect(mocks.setStorage).toHaveBeenCalledWith({ encrypted: true });
    });
  });

  it('rejects a wrong password', async () => {
    await screen.findByRole('button', { name: 'Continue' });
    mocks.has.mockResolvedValue(true);
    mocks.unlock.mockRejectedValueOnce(new Error('Wrong password'));
    render(<UnlockGate>other</UnlockGate>);
    fireEvent.click(await screen.findByRole('button', { name: 'Unlock' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Wrong password');
    expect(screen.queryByText('other')).toBeNull();
  });
});
