import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useScrollProgress } from './useScrollProgress';

describe('useScrollProgress', () => {
  let rAFCallback = null;

  beforeEach(() => {
    // Clear the DOM before each test
    document.body.innerHTML = '';

    // Mock requestAnimationFrame to capture the callback
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rAFCallback = cb;
      return 1;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rAFCallback = null;
  });

  it('should return early if the scrollBar element does not exist', () => {
    // Ensure the scrollBar element doesn't exist
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

    renderHook(() => useScrollProgress());

    // If scrollBar doesn't exist, it should return early and not add event listeners
    expect(addEventListenerSpy).not.toHaveBeenCalledWith('scroll', expect.any(Function), expect.any(Object));
  });

  it('should add scroll event listener and calculate scroll progress correctly', () => {
    // Setup DOM with a scrollBar element
    const scrollBar = document.createElement('div');
    scrollBar.id = 'scrollBar';
    document.body.appendChild(scrollBar);

    // Mock document heights
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(document.documentElement, 'clientHeight', { value: 200, configurable: true });

    // Spying on the getter since jsdom doesn't allow standard property mutation on scrollTop easily
    let currentScrollTop = 400;
    vi.spyOn(document.documentElement, 'scrollTop', 'get').mockImplementation(() => currentScrollTop);

    // Set up spy for event listeners
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

    renderHook(() => useScrollProgress());

    // Should have added the scroll listener
    expect(addEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true });

    // Initial check (it runs onScroll() on mount, which queues rAFCallback)
    if (rAFCallback) rAFCallback();

    // Formula: (400 / (1000 - 200)) * 100 = 50%
    expect(scrollBar.style.width).toBe('50%');

    // Reset callback for the next event
    rAFCallback = null;

    // Test scroll event triggering updates
    currentScrollTop = 800; // Update the mocked getter's return value

    // Fire the scroll event that the hook listens to
    const scrollEvent = new Event('scroll');
    window.dispatchEvent(scrollEvent);

    // Flush the callback
    if (rAFCallback) rAFCallback();

    // Verify width was updated (800 / 800) * 100 = 100%
    expect(scrollBar.style.width).toBe('100%');
  });

  it('should handle zero scrollable area (height <= 0) gracefully', () => {
    // Setup DOM with a scrollBar element
    const scrollBar = document.createElement('div');
    scrollBar.id = 'scrollBar';
    document.body.appendChild(scrollBar);

    // Mock document heights where clientHeight is equal to scrollHeight
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(document.documentElement, 'clientHeight', { value: 1000, configurable: true });
    vi.spyOn(document.documentElement, 'scrollTop', 'get').mockImplementation(() => 0);

    renderHook(() => useScrollProgress());

    if (rAFCallback) rAFCallback();

    // Should default to 0
    expect(scrollBar.style.width).toBe('0%');
  });

  it('should remove scroll event listener on unmount', () => {
    // Setup DOM with a scrollBar element
    const scrollBar = document.createElement('div');
    scrollBar.id = 'scrollBar';
    document.body.appendChild(scrollBar);

    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useScrollProgress());

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function));
  });
});
