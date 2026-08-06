import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CopyButton } from './CopyButton';

describe('CopyButton', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('copies the text to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(<CopyButton text="secret-value" />);
    fireEvent.click(screen.getByTitle('Copy to clipboard'));
    expect(writeText).toHaveBeenCalledWith('secret-value');
  });

  it('shows a label after copying', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(<CopyButton text="abc" label="Copy" />);
    await act(async () => {
      fireEvent.click(screen.getByText('Copy'));
    });
    expect(screen.getByText('Copied!')).toBeDefined();
    act(() => {
      vi.advanceTimersByTime(2100);
    });
    expect(screen.getByText('Copy')).toBeDefined();
  });

  it('falls back to execCommand when clipboard is unavailable', () => {
    vi.stubGlobal('navigator', {});
    const execCommand = vi.fn(() => true);
    document.execCommand = execCommand;
    render(<CopyButton text="fallback-value" />);
    fireEvent.click(screen.getByTitle('Copy to clipboard'));
    expect(execCommand).toHaveBeenCalledWith('copy');
  });
});
