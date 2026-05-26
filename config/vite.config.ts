import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const rendererRoot = path.resolve(__dirname, '../src/renderer');

export default defineConfig({
  plugins: [react()],
  root: rendererRoot,
  base: './',
  build: {
    outDir: path.resolve(__dirname, '../dist/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(rendererRoot, 'index.html'),
        quickLauncher: path.resolve(rendererRoot, 'quick-launcher.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../src/shared'),
    },
  },
  server: {
    port: 5175,
    strictPort: true,
  },
});
