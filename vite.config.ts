import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
const online = process.env.ZIZAI_REVIEW_BUILD === '1';
const base = online ? '/kaiju-next/' : '/';
const archive = online
  ? JSON.parse(readFileSync('public/review-data/manifest.json', 'utf8'))
  : null;
export default defineConfig({
  base,
  define: {
    __REVIEW_CONFIG__: JSON.stringify(
      online
        ? {
            base,
            statsDate: archive.defaultDate,
            tierDate: archive.defaultDate,
            builtAt: archive.builtAt,
          }
        : null,
    ),
  },
  plugins: [react()],
  build: {
    outDir: online ? 'dist-review' : 'dist',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) return 'vendor';
          if (id.endsWith('/data/heroes.json')) return 'heroes';
        },
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 4317,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:4318' },
  },
  preview: { host: '127.0.0.1', port: 4317, strictPort: true },
});
