import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import useAmyFrameSequence from './useAmyFrameSequence';

describe('useAmyFrameSequence', () => {
  let mockCanDraw;
  let mockOnReady;
  let mockOnError;
  let mockContext;
  let mockCanvas;

  beforeEach(() => {
    mockCanDraw = vi.fn(() => true);
    mockOnReady = vi.fn();
    mockOnError = vi.fn();

    // Mock import.meta.env
    vi.stubEnv('BASE_URL', '/');

    mockContext = {
      drawImage: vi.fn(),
      clearRect: vi.fn(),
    };

    mockCanvas = {
      getContext: vi.fn((type) => {
        if (type === '2d') return mockContext;
        return null;
      }),
      width: 1920,
      height: 1080,
      dataset: {},
    };

    // Reset fetch mock
    global.fetch = vi.fn().mockImplementation((url) => {
      return Promise.resolve({
        ok: true,
        blob: () => Promise.resolve(new Blob(['dummy'], { type: 'image/avif' })),
        status: 200,
      });
    });

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  const setupHook = (props = {}) => {
    const { result, unmount } = renderHook(() =>
      useAmyFrameSequence({
        enabled: true,
        canDraw: mockCanDraw,
        onReady: mockOnReady,
        onError: mockOnError,
        ...props
      })
    );

    // Attach the mock canvas
    result.current.canvasRef.current = mockCanvas;

    // Force a re-render to trigger useEffect with the attached canvas
    act(() => {
      // Need a way to trigger useEffect, but testing library's renderHook doesn't re-run effects
      // just because a ref changed.
      // Easiest is to re-render the hook.
    });

    return { result, unmount };
  };

  it('initializes correctly and returns canvasRef and requestFrame', () => {
    const { result } = renderHook(() =>
      useAmyFrameSequence({
        enabled: true,
        canDraw: mockCanDraw,
        onReady: mockOnReady,
        onError: mockOnError
      })
    );

    expect(result.current.canvasRef).toBeDefined();
    expect(result.current.requestFrame).toBeInstanceOf(Function);
  });

  it('does nothing when enabled is false', async () => {
    const { result } = renderHook(() =>
      useAmyFrameSequence({
        enabled: false,
        canDraw: mockCanDraw,
        onReady: mockOnReady,
        onError: mockOnError
      })
    );

    result.current.canvasRef.current = mockCanvas;

    // Wait for any potential effects
    await vi.runAllTimersAsync();

    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockCanvas.getContext).not.toHaveBeenCalled();
  });

  it('calls onError if createImageBitmap is not available', () => {
    const originalCreateImageBitmap = global.createImageBitmap;
    global.createImageBitmap = undefined;

    const { result } = renderHook(() =>
      useAmyFrameSequence({
        enabled: true,
        canDraw: mockCanDraw,
        onReady: mockOnReady,
        onError: mockOnError
      })
    );

    // Simulate ref attachment and trigger useEffect
    // Since useEffect depends on `enabled`, we can toggle it to force re-run
    const rerender = renderHook(
      (props) => useAmyFrameSequence(props),
      {
        initialProps: {
          enabled: false,
          canDraw: mockCanDraw,
          onReady: mockOnReady,
          onError: mockOnError
        }
      }
    );

    rerender.result.current.canvasRef.current = mockCanvas;

    rerender.rerender({
      enabled: true,
      canDraw: mockCanDraw,
      onReady: mockOnReady,
      onError: mockOnError
    });

    expect(mockOnError).toHaveBeenCalled();

    global.createImageBitmap = originalCreateImageBitmap;
  });

  it('fetches frames and draws to canvas on successful initialization', async () => {
    const { result, rerender } = renderHook(
      (props) => useAmyFrameSequence(props),
      {
        initialProps: {
          enabled: false,
          canDraw: mockCanDraw,
          onReady: mockOnReady,
          onError: mockOnError
        }
      }
    );

    result.current.canvasRef.current = mockCanvas;

    rerender({
      enabled: true,
      canDraw: mockCanDraw,
      onReady: mockOnReady,
      onError: mockOnError
    });

    // Wait for the async fetch and createImageBitmap to complete
    await vi.runAllTimersAsync();

    // Should fetch the target frame (0) and some lookahead frames
    expect(global.fetch).toHaveBeenCalled();
    expect(global.fetch.mock.calls[0][0]).toContain('frame_000001.avif'); // frame 0 is index + 1 = 1

    expect(mockOnReady).toHaveBeenCalledTimes(1);
    expect(mockContext.drawImage).toHaveBeenCalled();
    expect(mockCanvas.dataset.frame).toBe('1');
  });

  it('aborts pending fetches and closes bitmaps on unmount', async () => {
    const abortSpy = vi.spyOn(AbortController.prototype, 'abort');

    const { result, rerender, unmount } = renderHook(
      (props) => useAmyFrameSequence(props),
      {
        initialProps: {
          enabled: false,
          canDraw: mockCanDraw,
          onReady: mockOnReady,
          onError: mockOnError
        }
      }
    );

    result.current.canvasRef.current = mockCanvas;

    rerender({
      enabled: true,
      canDraw: mockCanDraw,
      onReady: mockOnReady,
      onError: mockOnError
    });

    // We don't wait for timers so that the fetches are still pending when we unmount
    unmount();

    expect(abortSpy).toHaveBeenCalled();
    abortSpy.mockRestore();
  });

  it('requests frames based on time', async () => {
    const { result, rerender } = renderHook(
      (props) => useAmyFrameSequence(props),
      {
        initialProps: {
          enabled: false,
          canDraw: mockCanDraw,
          onReady: mockOnReady,
          onError: mockOnError
        }
      }
    );

    result.current.canvasRef.current = mockCanvas;

    rerender({
      enabled: true,
      canDraw: mockCanDraw,
      onReady: mockOnReady,
      onError: mockOnError
    });

    // Clear initial fetch calls
    await vi.runAllTimersAsync();
    global.fetch.mockClear();

    // Request frame at 1 second (24 fps -> frame 24)
    act(() => {
      result.current.requestFrame(1.0);
    });

    await vi.runAllTimersAsync();

    expect(mockCanvas.dataset.targetFrame).toBe('25'); // index 24 + 1

    // Verify that the fetch was called for the new target frame
    const fetchedUrls = global.fetch.mock.calls.map(call => call[0]);
    expect(fetchedUrls).toEqual(expect.arrayContaining([expect.stringContaining('frame_000025.avif')]));
  });

  it('calls onError when fetch fails', async () => {
    global.fetch.mockImplementationOnce(() => Promise.reject(new Error('Network error')));

    const { result, rerender } = renderHook(
      (props) => useAmyFrameSequence(props),
      {
        initialProps: {
          enabled: false,
          canDraw: mockCanDraw,
          onReady: mockOnReady,
          onError: mockOnError
        }
      }
    );

    result.current.canvasRef.current = mockCanvas;

    rerender({
      enabled: true,
      canDraw: mockCanDraw,
      onReady: mockOnReady,
      onError: mockOnError
    });

    await vi.runAllTimersAsync();

    expect(mockOnError).toHaveBeenCalled();
  });

  it('respects canDraw callback', async () => {
    mockCanDraw.mockReturnValue(false);

    const { result, rerender } = renderHook(
      (props) => useAmyFrameSequence(props),
      {
        initialProps: {
          enabled: false,
          canDraw: mockCanDraw,
          onReady: mockOnReady,
          onError: mockOnError
        }
      }
    );

    result.current.canvasRef.current = mockCanvas;

    rerender({
      enabled: true,
      canDraw: mockCanDraw,
      onReady: mockOnReady,
      onError: mockOnError
    });

    await vi.runAllTimersAsync();

    // It should not draw if canDraw returns false
    expect(mockContext.drawImage).not.toHaveBeenCalled();
    expect(mockOnReady).not.toHaveBeenCalled();
  });
});
