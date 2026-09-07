import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist/client',
    emptyOutDir: false,
    sourcemap: true,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/health-intelligence-tab.js',
        chunkFileNames: 'assets/chunk-[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
