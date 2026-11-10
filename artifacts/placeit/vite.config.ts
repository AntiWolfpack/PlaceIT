import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';

const workspaceRoot = path.resolve(import.meta.dirname, '..', '..');
const env = loadEnv(process.env.NODE_ENV ?? 'development', workspaceRoot, '');
const port = Number(
  process.env.PORT ??
    process.env.VITE_PORT ??
    env.VITE_PORT ??
    env.PORT ??
    5173,
);
const basePath = process.env.BASE_PATH ?? env.BASE_PATH ?? '/';
const apiTarget =
  process.env.API_PROXY_TARGET ??
  env.API_PROXY_TARGET ??
  'http://localhost:3000';

export default defineConfig({
  base: basePath,
  envDir: workspaceRoot,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
