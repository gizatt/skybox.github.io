import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',   // so Image exists
    globals: true,
    coverage: { reporter: ['text','lcov'] }
  }
});