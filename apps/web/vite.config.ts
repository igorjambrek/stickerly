import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@album/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // The fonts are shared with the PDF generator and live at the repo root, so
    // the dev server has to be allowed to reach outside apps/web.
    fs: { allow: [repoRoot] },
    // `ws` because the album's live connection is an /api route too, and a
    // proxy that does not forward the upgrade fails silently: the editor still
    // saves, it just never hears about anybody else.
    proxy: { '/api': { target: 'http://127.0.0.1:3000', ws: true } },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
