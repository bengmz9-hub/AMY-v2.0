import { render } from '@testing-library/react';
import { useScrollProgress } from './useScrollProgress';
import { vi } from 'vitest';

const TestComponent = () => {
  useScrollProgress();
  return <div style={{ height: '2000px' }}>Test</div>;
};

describe('useScrollProgress', () => {
  let originalRequestAnimationFrame;
  let scrollBar;
  let rafCallbacks = [];

  beforeAll(() => {
    originalRequestAnimationFrame = window.requestAnimationFrame;
    // We queue the callbacks so we can trigger them explicitly
    window.requestAnimationFrame = (callback) => {
      rafCallbacks.push(callback);
      return 1;
    };
  });

  afterAll(() => {
    window.requestAnimationFrame = originalRequestAnimationFrame;
  });

  beforeEach(() => {
    document.body.innerHTML = '';
    rafCallbacks = [];

    scrollBar = document.createElement('div');
    scrollBar.id = 'scrollBar';
    document.body.appendChild(scrollBar);
  });

  const flushRaf = () => {
    const callbacks = [...rafCallbacks];
    rafCallbacks = [];
    callbacks.forEach(cb => cb());
  };

  it('does nothing if #scrollBar is not in the DOM', () => {
    document.body.innerHTML = '';

    render(<TestComponent />);
    flushRaf();

    expect(() => {
      window.dispatchEvent(new window.Event('scroll'));
      flushRaf();
    }).not.toThrow();
  });

  it('updates #scrollBar width based on scroll position', () => {
    Object.defineProperty(document.body, 'scrollTop', { value: 0, writable: true });
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 1000, writable: true });
    Object.defineProperty(document.documentElement, 'clientHeight', { value: 500, writable: true });

    render(<TestComponent />);
    flushRaf();

    expect(scrollBar.style.width).toBe('0%');

    // Change body.scrollTop and fire scroll
    document.body.scrollTop = 250;
    window.dispatchEvent(new window.Event('scroll'));
    flushRaf();

    expect(scrollBar.style.width).toBe('50%');

    // Change body.scrollTop again and fire scroll
    document.body.scrollTop = 500;
    window.dispatchEvent(new window.Event('scroll'));
    flushRaf();

    expect(scrollBar.style.width).toBe('100%');
  });

  it('cleans up event listener on unmount', () => {
    Object.defineProperty(document.body, 'scrollTop', { value: 0, writable: true });
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 1000, writable: true });
    Object.defineProperty(document.documentElement, 'clientHeight', { value: 500, writable: true });

    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = render(<TestComponent />);
    flushRaf();

    expect(addEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true });
    expect(scrollBar.style.width).toBe('0%');

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function));

    // Try changing scroll and fire scroll after unmount
    document.body.scrollTop = 500;
    window.dispatchEvent(new window.Event('scroll'));
    flushRaf();

    // Should remain 0% because listener is removed
    expect(scrollBar.style.width).toBe('0%');

    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
  });
});
