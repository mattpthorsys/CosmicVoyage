// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  // Base public path when served in production (e.g., '/my-game/' if hosted in a subdir)
  base: './',
  build: {
    // Output directory for production build
    outDir: 'dist',
    // Optional: Increase chunk size warning limit if needed
    // chunkSizeWarningLimit: 1000,
  },
  server: {
    // Open the browser automatically when starting the dev server
    open: true,
  },
  // Optional: Define aliases matching tsconfig.json paths
  resolve: {
    alias: {
      '@': '/src' // Adjust path if needed based on project root
    }
  }
});