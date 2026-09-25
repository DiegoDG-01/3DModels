import { defineConfig } from 'vite';

export default defineConfig({
  // Rutas relativas: el build funciona desde cualquier carpeta (GitHub Pages, etc.)
  base: './',
  build: { chunkSizeWarningLimit: 1200 },
});
