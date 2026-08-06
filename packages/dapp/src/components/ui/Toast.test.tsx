import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ToastProvider, toast } from './Toast';

function Probe() {
  return (
    <button onClick={() => toast('success', 'Saved!', 'Everything is fine')}>
      Trigger
    </button>
  );
}

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('displays a toast when triggered', () => {
    render(
      <ToastProvider>
        <Probe />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('Trigger'));
    expect(screen.getByText('Saved!')).toBeDefined();
    expect(screen.getByText('Everything is fine')).toBeDefined();
  });

  it('auto-dismisses after the default duration', () => {
    render(
      <ToastProvider>
        <Probe />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('Trigger'));
    act(() => {
      vi.advanceTimersByTime(5200);
    });
    expect(screen.queryByText('Saved!')).toBeNull();
  });

  it('dismisses on close button click', () => {
    render(
      <ToastProvider>
        <Probe />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('Trigger'));
    fireEvent.click(screen.getByLabelText('Dismiss toast'));
    expect(screen.queryByText('Saved!')).toBeNull();
  });
});
