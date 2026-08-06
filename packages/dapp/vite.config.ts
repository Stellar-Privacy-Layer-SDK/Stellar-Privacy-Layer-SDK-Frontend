import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      buffer: 'buffer/',
    },
  },
  optimizeDeps: {
    include: ['@stellar-privacy/sdk'],
  },
  server: {
    port: 3000,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Vite 8 (rolldown) requires a function form for manualChunks.
        // Vendor splitting keeps the initial bundle small and cacheable.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@stellar-privacy')) return 'sdk';
          if (id.includes('@stellar/stellar-sdk') || id.includes('@stellar/freighter-api')) {
            return 'stellar';
          }
          if (id.includes('@noble')) return 'crypto';
          if (id.includes('lucide-react')) return 'icons';
          if (id.includes('react')) return 'react';
          return undefined;
        },
      },
    },
  },
});
