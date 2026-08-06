import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('kaboom');
  }
  return <div>Safe content</div>;
}

describe('ErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Safe content')).toBeDefined();
  });

  it('renders the fallback UI when a child throws', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeDefined();
    expect(screen.getByText('kaboom')).toBeDefined();
    spy.mockRestore();
  });

  it('recovers after clicking Try Again', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const state = { throwNow: true };
    function FlakyBomb() {
      if (state.throwNow) {
        throw new Error('kaboom');
      }
      return <div>Safe content</div>;
    }
    render(
      <ErrorBoundary>
        <FlakyBomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeDefined();
    state.throwNow = false;
    fireEvent.click(screen.getByText('Try Again'));
    expect(screen.getByText('Safe content')).toBeDefined();
    spy.mockRestore();
  });
});
