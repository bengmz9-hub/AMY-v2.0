import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Decisión del usuario (15-nov-2026): la web se ve siempre completa, con vídeo y
// animaciones, aunque el sistema pida movimiento reducido. Sustituye en src/ cada
// `(prefers-reduced-motion: reduce)` (CSS y matchMedia) por una consulta que nunca
// coincide. Quitar este plugin devuelve el respeto a esa preferencia.
const REDUCED_QUERY = /\(prefers-reduced-motion:\s*reduce\)/g;
const NEVER_QUERY = '(min-width: 1px) and (max-width: 0px)';
const ignoreReducedMotion = () => ({
  name: 'amy-ignore-reduced-motion',
  enforce: 'pre',
  transform(code, id) {
    if (!id.includes('/src/') || !REDUCED_QUERY.test(code)) return null;
    REDUCED_QUERY.lastIndex = 0;
    return { code: code.replace(REDUCED_QUERY, NEVER_QUERY), map: null };
  },
});

// https://vite.dev/config/
export default defineConfig({
  plugins: [ignoreReducedMotion(), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
