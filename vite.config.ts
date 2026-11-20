import { defineConfig } from 'vite';

export default defineConfig({
  // Keep Vite scoped to this game; a parent Desktop PostCSS config expects Tailwind.
  css: {
    postcss: {
      plugins: [],
    },
  },
  build: {
    // Phaser is a sizeable, stable third-party runtime. Keep it in a separate
    // cacheable chunk and allow for its known minified size; its gzip payload
    // is substantially smaller than the raw-size warning threshold suggests.
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/')) return 'vendor';
        },
      },
    },
  },
});
