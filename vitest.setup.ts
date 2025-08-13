import { vi } from 'vitest';

// Default: explode if anything tries to use real fetch
(globalThis as any).fetch = vi.fn(() => {
  throw new Error('Network access is disabled in tests. Mock fetch.');
});