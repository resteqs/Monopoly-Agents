import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Repo root (parent of viewer/) so the board JSON in engine/ can be imported.
const repoRoot = new URL('..', import.meta.url).pathname;

export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  server: { fs: { allow: [repoRoot] } },
});
