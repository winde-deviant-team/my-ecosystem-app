// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import commonjs from '@rollup/plugin-commonjs'; // Import the required plugin

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(), 
    // CRITICAL: Use commonjs plugin to handle dependencies like lucide-react in the build
    commonjs({
      include: /node_modules/,
      // Ensure it handles these packages correctly
      namedExports: {
        'lucide-react': ['Calendar', 'ClipboardList', 'FileText', 'Receipt', 'Trash2', 'PlusCircle', 'ArrowRight', 'X', 'Loader2', 'Download', 'Bell', 'Eye', 'CheckCircle', 'Clock']
      }
    })
  ],
  // This is often needed when dealing with module resolution issues
  resolve: {
    alias: {
      'lucide-react': 'lucide-react' 
    }
  },
  // You must also install the rollup plugin: npm install -D @rollup/plugin-commonjs
});
