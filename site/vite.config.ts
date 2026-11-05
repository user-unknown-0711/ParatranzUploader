import preact from '@preact/preset-vite'
import { defineConfig } from 'vitest/config'

// The site is served under /<repo>/, so every URL in the build is relative.
export default defineConfig({
  base: './',
  plugins: [preact()],
  // The search worker is made with { type: 'module' }, so it is built as a module too.
  worker: { format: 'es' },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
