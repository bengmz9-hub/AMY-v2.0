import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import useAmyFrameSequence from './useAmyFrameSequence';

describe('useAmyFrameSequence', () => {
  let mockContext;
  let mockCanvas;

  beforeEach(() => {
    global.fetch = vi.fn();
    global.createImageBitmap = vi.fn();
    global.performance = { now: vi.fn(() => 100) };
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    });

    mockContext = {
      drawImage: vi.fn(),
    };

    mockCanvas = {
      getContext: vi.fn(() => mockContext),
      width: 800,
      height: 600,
      dataset: {},
    };

    // Polyfill import.meta.env
    global.import = { meta: { env: { BASE_URL: '/' } } };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('triggers onError callback when fetch fails to simulate the error path', async () => {
    // Return a rejected promise from fetch
    global.fetch.mockRejectedValue(new Error('Network error'));

    const callbacks = {
      enabled: true,
      canDraw: vi.fn(() => true),
      onReady: vi.fn(),
      onError: vi.fn(),
    };

    const { result, rerender } = renderHook((props) => useAmyFrameSequence(props), { initialProps: callbacks });

    // Set the canvas ref
    result.current.canvasRef.current = mockCanvas;

    // Toggle enabled to re-run the effect now that canvasRef is set
    rerender({ ...callbacks, enabled: false });
    rerender({ ...callbacks, enabled: true });

    // Allow macro-tasks (fetch promise rejections) to execute
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(global.fetch).toHaveBeenCalled();
    expect(callbacks.onError).toHaveBeenCalled();
  });

  it('calls onError if getContext fails or createImageBitmap is not a function', () => {
    // Delete createImageBitmap
    const originalCreateImageBitmap = global.createImageBitmap;
    delete global.createImageBitmap;

    const callbacks = {
      enabled: true,
      canDraw: vi.fn(() => true),
      onReady: vi.fn(),
      onError: vi.fn(),
    };

    const { result, rerender } = renderHook((props) => useAmyFrameSequence(props), { initialProps: callbacks });
    result.current.canvasRef.current = mockCanvas;

    rerender({ ...callbacks, enabled: false });
    rerender({ ...callbacks, enabled: true });

    expect(callbacks.onError).toHaveBeenCalled();

    // Restore
    global.createImageBitmap = originalCreateImageBitmap;
  });

  it('paints frames when fetch and createImageBitmap succeed', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob()),
    });
    const mockBitmap = { close: vi.fn() };
    global.createImageBitmap.mockResolvedValue(mockBitmap);

    const callbacks = {
      enabled: true,
      canDraw: vi.fn(() => true),
      onReady: vi.fn(),
      onError: vi.fn(),
    };

    const { result, rerender } = renderHook((props) => useAmyFrameSequence(props), { initialProps: callbacks });
    result.current.canvasRef.current = mockCanvas;

    rerender({ ...callbacks, enabled: false });
    rerender({ ...callbacks, enabled: true });

    await new Promise(resolve => setTimeout(resolve, 20));

    expect(callbacks.onReady).toHaveBeenCalled();
    expect(mockContext.drawImage).toHaveBeenCalled();

    // Call cleanup (unmount) to ensure memory leaks are avoided (bitmaps closed)
    rerender({ ...callbacks, enabled: false });
    expect(mockBitmap.close).toHaveBeenCalled();
  });
});
