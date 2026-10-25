import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useIntersectionFade } from './useIntersectionFade';
import React from 'react';

// A test component that uses our hook
const TestComponent = ({ elements = [] }) => {
  useIntersectionFade();
  return (
    <div>
      {elements.map((el, i) => (
        <div key={i} className={el.className}>
          Test Item {i}
        </div>
      ))}
    </div>
  );
};

describe('useIntersectionFade', () => {
  let originalIntersectionObserver;
  let mockObserve;
  let mockUnobserve;
  let mockDisconnect;

  beforeEach(() => {
    // Save original IntersectionObserver
    originalIntersectionObserver = window.IntersectionObserver;

    // Create mock functions
    mockObserve = vi.fn();
    mockUnobserve = vi.fn();
    mockDisconnect = vi.fn();

    // Mock IntersectionObserver
    window.IntersectionObserver = vi.fn(function(callback, options) {
      this.callback = callback;
      this.options = options;
      this.observe = mockObserve;
      this.unobserve = mockUnobserve;
      this.disconnect = mockDisconnect;
    });
  });

  afterEach(() => {
    // Restore original IntersectionObserver
    window.IntersectionObserver = originalIntersectionObserver;
    vi.clearAllMocks();
  });

  it('should return early if no .fade-in-section elements exist', () => {
    const { container } = render(<TestComponent elements={[{ className: 'other-class' }]} />);

    // IntersectionObserver should not be instantiated
    expect(window.IntersectionObserver).not.toHaveBeenCalled();
  });

  it('should add .is-visible immediately if IntersectionObserver is not supported', () => {
    // Temporarily remove IntersectionObserver
    delete window.IntersectionObserver;

    const { container } = render(
      <TestComponent
        elements={[
          { className: 'fade-in-section' },
          { className: 'fade-in-section' }
        ]}
      />
    );

    const elements = container.querySelectorAll('.fade-in-section');
    expect(elements).toHaveLength(2);
    expect(elements[0]).toHaveClass('is-visible');
    expect(elements[1]).toHaveClass('is-visible');
  });

  it('should set up IntersectionObserver correctly if supported', () => {
    const { container, unmount } = render(
      <TestComponent elements={[{ className: 'fade-in-section' }]} />
    );

    expect(window.IntersectionObserver).toHaveBeenCalledTimes(1);

    // Verify threshold option was passed
    const observerInstance = window.IntersectionObserver.mock.instances[0];
    expect(observerInstance.options).toEqual({ threshold: 0.1 });

    // Verify observe was called for the element
    const fadeElement = container.querySelector('.fade-in-section');
    expect(mockObserve).toHaveBeenCalledWith(fadeElement);

    // Verify disconnect is called on unmount
    unmount();
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it('should add .is-visible and unobserve when intersecting', () => {
    const { container } = render(
      <TestComponent elements={[{ className: 'fade-in-section' }]} />
    );

    const fadeElement = container.querySelector('.fade-in-section');
    const observerInstance = window.IntersectionObserver.mock.instances[0];

    // Trigger intersection
    const mockEntries = [
      {
        isIntersecting: true,
        target: fadeElement
      }
    ];

    // Call the callback that IntersectionObserver passes
    observerInstance.callback(mockEntries);

    // Should add is-visible class
    expect(fadeElement).toHaveClass('is-visible');

    // Should stop observing this element
    expect(mockUnobserve).toHaveBeenCalledWith(fadeElement);
  });

  it('should not add .is-visible when not intersecting', () => {
    const { container } = render(
      <TestComponent elements={[{ className: 'fade-in-section' }]} />
    );

    const fadeElement = container.querySelector('.fade-in-section');
    const observerInstance = window.IntersectionObserver.mock.instances[0];

    // Trigger intersection (not intersecting yet)
    const mockEntries = [
      {
        isIntersecting: false,
        target: fadeElement
      }
    ];

    observerInstance.callback(mockEntries);

    // Should NOT add is-visible class
    expect(fadeElement).not.toHaveClass('is-visible');

    // Should NOT stop observing
    expect(mockUnobserve).not.toHaveBeenCalled();
  });
});
