import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  build: {
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
