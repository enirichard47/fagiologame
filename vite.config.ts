import { defineConfig } from 'vite';

export default defineConfig({
  // Keep Vite scoped to this game; a parent Desktop PostCSS config expects Tailwind.
  css: {
    postcss: {
      plugins: [],
    },
  },
});
