import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NetworkSwitcher } from './NetworkSwitcher';

const mockUseNetwork = vi.fn();
vi.mock('../hooks/useSDK', () => ({
  useNetwork: (...args: unknown[]) => mockUseNetwork(...args),
}));

describe('NetworkSwitcher', () => {
  beforeEach(() => {
    mockUseNetwork.mockReturnValue({ network: 'testnet', switchNetwork: vi.fn() });
  });

  it('shows the current network', () => {
    render(<NetworkSwitcher />);
    expect(screen.getByText('Testnet')).toBeDefined();
  });

  it('opens the menu and lists all networks', () => {
    render(<NetworkSwitcher />);
    fireEvent.click(screen.getByLabelText(/Current network/));
    expect(screen.getByText('Mainnet')).toBeDefined();
    expect(screen.getByText('Futurenet')).toBeDefined();
    expect(screen.getByText('Sandbox')).toBeDefined();
  });

  it('switches network on selection', () => {
    const switchNetwork = vi.fn();
    mockUseNetwork.mockReturnValue({ network: 'testnet', switchNetwork });
    render(<NetworkSwitcher />);
    fireEvent.click(screen.getByLabelText(/Current network/));
    fireEvent.click(screen.getByText('Mainnet'));
    expect(switchNetwork).toHaveBeenCalledWith('public');
  });
});
