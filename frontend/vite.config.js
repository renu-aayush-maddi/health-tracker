import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // One .env at the repo root serves both apps; only VITE_* variables reach the browser bundle.
  envDir: '..',
  server: {
    port: 5173,
    strictPort: true,
    // Same-origin API in dev, mirroring the Render rewrite in production.
    proxy: { '/api': 'http://localhost:4000' },
  },
  build: {
    // The entry chunk is mostly React DOM, React Router, TanStack Query and Zod (~170 kB gzipped);
    // pages are lazy-loaded. A single vendor chunk was tried and grew the initial download.
    chunkSizeWarningLimit: 600,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  },
});
