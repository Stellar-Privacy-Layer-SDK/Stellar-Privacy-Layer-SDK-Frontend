import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from './Modal';

describe('Modal', () => {
  it('renders nothing when closed', () => {
    render(
      <Modal open={false} onClose={vi.fn()} title="Test">
        <p>Body</p>
      </Modal>,
    );
    expect(screen.queryByText('Body')).toBeNull();
  });

  it('renders title and children when open', () => {
    render(
      <Modal open onClose={vi.fn()} title="Test Modal">
        <p>Body content</p>
      </Modal>,
    );
    expect(screen.getByText('Test Modal')).toBeDefined();
    expect(screen.getByText('Body content')).toBeDefined();
  });

  it('closes on overlay click', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Test">
        <p>Body</p>
      </Modal>,
    );
    fireEvent.click(screen.getByText('Body'));
    // click bubbles to overlay when target is the overlay itself
    fireEvent.click(document.querySelector('.fixed.inset-0')!);
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape key', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Test">
        <p>Body</p>
      </Modal>,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
