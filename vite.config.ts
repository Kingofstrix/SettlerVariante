import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

// base './' funktioniert auf GitHub Pages unabhängig vom Repo-Namen (relative Pfade).
export default defineConfig({
  base: './',
  plugins: [preact()],
  test: { include: ['tests/**/*.test.ts'], testTimeout: 120000 },
});
