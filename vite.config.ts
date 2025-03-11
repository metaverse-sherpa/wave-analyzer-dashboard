import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 3000,
    hmr: {
      overlay: false, // Disable the error overlay which can be CPU intensive
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  plugins: [
    react(),
    mode === 'development' && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
    // Increase the warning limit if you're confident about your bundle structure
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // React ecosystem
          if (id.includes('node_modules/react/') || 
              id.includes('node_modules/react-dom/')) {
            return 'react-core';
          }
          
          // React Router
          if (id.includes('node_modules/react-router-dom/')) {
            return 'react-router';
          }
          
          // Radix UI components
          if (id.includes('node_modules/@radix-ui/react-')) {
            return 'radix-ui';
          }
          
          // Recharts library (instead of Chart.js)
          if (id.includes('node_modules/recharts/')) {
            return 'chart-lib';
          }
          
          // Keep other node_modules as vendor
          if (id.includes('node_modules/')) {
            return 'vendor';
          }
        }
      }
    },
    sourcemap: false, // Disable sourcemaps in production
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'recharts'], // Pre-bundle commonly used dependencies
    exclude: ['next'] // Exclude Next.js as it's causing conflicts
  },
}));
