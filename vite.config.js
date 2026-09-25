import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  // Rutas relativas: el build funciona desde cualquier carpeta (GitHub Pages, etc.)
  base: './',
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      // Un HTML por entorno + el hub de la raíz
      input: {
        hub: resolve(import.meta.dirname, 'index.html'),
        camera: resolve(import.meta.dirname, 'camera/index.html'),
        engine: resolve(import.meta.dirname, 'engine/index.html'),
      },
      // Three.js en su propio fichero: se descarga una vez y lo comparten todos los entornos
      output: {
        manualChunks: (id) => (id.includes('node_modules/three') ? 'three' : undefined),
      },
    },
  },
});
