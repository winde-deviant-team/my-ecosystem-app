// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(), 
  ],
  build: {
    rollupOptions: {
      // CRITICAL FIX: Treat lucide-react as an external module to avoid bundler conflict
      external: ['lucide-react'], 
    }
  }
});

