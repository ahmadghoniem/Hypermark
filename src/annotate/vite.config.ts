import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import tailwindcss from '@tailwindcss/vite';
import { devMockApi } from './dev-mock-api';
import { katexWoff2Only } from '../../scripts/katex-woff2-only';

export default defineConfig({
  root: __dirname,
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [react(), tailwindcss(), katexWoff2Only(), devMockApi(), viteSingleFile()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      // Drop the dead Oniguruma WASM (~622 KB base64). The fence highlighter
      // runs Shiki's JavaScript regex engine. See scripts/shiki-wasm-stub.ts.
      'shiki/wasm': path.resolve(__dirname, '../../scripts/shiki-wasm-stub.ts'),
      '@': path.resolve(__dirname, '..'),
    }
  },
  build: {
    outDir: path.resolve(__dirname, '../../dist/annotate'),
    emptyOutDir: true,
    target: 'esnext',
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 100000000,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
