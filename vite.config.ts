import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solid()],
  build: {
    outDir: 'build',
  },
  server: {
    port: 8080,
  },
  css: {
    modules: {
      localsConvention: 'camelCase',
    },
  },
});
