import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock browser APIs not available in jsdom
window.createImageBitmap = vi.fn().mockResolvedValue({
  width: 1920,
  height: 1080,
  close: vi.fn(),
});

HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  drawImage: vi.fn(),
  clearRect: vi.fn(),
}));

global.Performance = global.Performance || {};
global.Performance.now = vi.fn(() => Date.now());

// Mock IntersectionObserver
const mockIntersectionObserver = vi.fn();
mockIntersectionObserver.mockReturnValue({
  observe: () => null,
  unobserve: () => null,
  disconnect: () => null
});
window.IntersectionObserver = mockIntersectionObserver;
