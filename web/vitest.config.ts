import { defineConfig } from 'vitest/config'

// The calculation engine is plain TypeScript with no DOM dependency, so tests
// run in Node without the Vite plugin chain.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
