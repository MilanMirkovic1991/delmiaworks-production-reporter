import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // 5174 (not 5173) to avoid colliding with the sibling 'Expected PO Receipts'
    // project that already uses 5173 (default Vite). strictPort prevents silent
    // shift to 5175 etc. if 5174 is also busy — we want a hard error instead.
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
  test: {
    environment: 'happy-dom',
    globals: false,
    setupFiles: ['./test/setup.ts'],
  },
});
