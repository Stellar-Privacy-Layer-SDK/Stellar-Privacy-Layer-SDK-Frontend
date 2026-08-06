import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { LoadingSpinner } from './LoadingSpinner';

describe('LoadingSpinner', () => {
  it('renders a spinner svg', () => {
    const { container } = render(<LoadingSpinner />);
    const svg = container.querySelector('svg');
    expect(svg).toBeDefined();
    expect(svg!.getAttribute('class')).toContain('animate-spin');
  });

  it('applies size classes', () => {
    const { container } = render(<LoadingSpinner size="lg" />);
    expect(container.querySelector('svg')!.getAttribute('class')).toContain('h-8 w-8');
  });
});
