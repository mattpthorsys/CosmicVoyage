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
    headers: {
      // Ensure correct MIME types and allow cross-origin (though likely not needed for localhost)
      'Access-Control-Allow-Origin': '*',
      'Content-Security-Policy': "default-src 'self'; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self';", // Example CSP, adjust as needed
      // You might try removing or simplifying CSP if it causes issues
    }
  },
  // Optional: Define aliases matching tsconfig.json paths
  resolve: {
    alias: {
      '@': '/src' // Adjust path if needed based on project root
    }
  },

  test: {
    environment: 'happy-dom', // Use happy-dom for simulating DOM
    globals: true, // Use Vitest globals (describe, it, expect, etc.)
  },
});