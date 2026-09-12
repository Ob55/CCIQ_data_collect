import { defineConfig } from 'vitest/config'

// Scoped to this package so it does not inherit the root project's vitest config.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
})
