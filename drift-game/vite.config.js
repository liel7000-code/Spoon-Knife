import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: true },
  build: { chunkSizeWarningLimit: 800, assetsInlineLimit: 200000 }, // three.js is ~600 kB; small font files are inlined
});
