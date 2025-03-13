import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { visualizer } from 'rollup-plugin-visualizer';
import type { ProxyOptions } from 'vite';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "localhost",
    port: 3000,
    hmr: {
      overlay: false, // Disable the error overlay which can be CPU intensive
    },
    proxy: process.env.MOCK_API ? undefined : {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        rewrite: (path: string) => path.replace(/^\/api/, ''),
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('Proxy error:', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Sending Request:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('Received Response:', proxyRes.statusCode, req.url);
          });
        },
      } as ProxyOptions,
    },
  },
  plugins: [
    react(),
    mode === 'development' && componentTagger(),
    visualizer({
      open: true,
      gzipSize: true,
    }),
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
  worker: {
    format: 'es', // Use ES modules format for workers
    plugins: () => [] // Updated to return an array of plugins
  },
}));
