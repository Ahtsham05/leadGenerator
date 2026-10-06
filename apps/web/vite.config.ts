import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The API allows CORS for WEB_ORIGIN, but in development every /api call goes through
// this proxy instead, so the browser only ever talks to one origin.
const apiTarget = process.env.VITE_DEV_API_TARGET ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: apiTarget, changeOrigin: true } },
  },
  preview: { port: 5173, proxy: { '/api': { target: apiTarget, changeOrigin: true } } },
  build: { sourcemap: true, chunkSizeWarningLimit: 700 },
});
