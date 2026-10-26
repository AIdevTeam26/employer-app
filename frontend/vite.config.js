import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// `server` is for `npm run dev` (forwards /api to the backend).
// `test` is for Vitest (unit tests run in a simulated browser, jsdom).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:4000' } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    css: false,
    coverage: { provider: 'v8', include: ['src/**/*.{js,jsx}'], exclude: ['src/main.jsx', 'src/test/**', 'src/**/*.test.*'] },
  },
});
