import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { visualizer } from 'rollup-plugin-visualizer';
import type { ProxyOptions } from 'vite';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on mode
  const env = loadEnv(mode, process.cwd(), '');
  
  // Get API URL from environment variable or use localhost default
  const apiBaseUrl = env.VITE_API_BASE_URL || 'http://localhost:3001';
  
  console.log(`[Vite Config] Using API URL: ${apiBaseUrl} (Mode: ${mode})`);
  
  // Determine if we need to use proxy or direct calls
  const useLocalProxy = 
    !apiBaseUrl.includes('://') || // No protocol in URL
    apiBaseUrl.includes('localhost') || // Local development
    apiBaseUrl.includes('127.0.0.1'); // Local development
  
  return {
    server: {
      host: "localhost",
      port: 3000,
      hmr: {
        overlay: false, // Disable the error overlay which can be CPU intensive
      },
      proxy: useLocalProxy ? {
        '/api': {
          target: apiBaseUrl,
          changeOrigin: true,
          secure: false,
          // Important: DON'T rewrite paths for this use case
          configure: (proxy, _options) => {
            proxy.on('error', (err, _req, _res) => {
              console.log('Proxy error:', err);
            });
            proxy.on('proxyReq', (proxyReq, req, _res) => {
              // console.log('Sending Request:', req.method, req.url);
            });
            proxy.on('proxyRes', (proxyRes, req, _res) => {
              // console.log('Received Response:', proxyRes.statusCode, req.url);
            });
          },
        } as ProxyOptions,
      } : {},
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
    define: {
      // Make environment variables available at build time
      'process.env.VITE_API_BASE_URL': JSON.stringify(apiBaseUrl),
    },
    build: {
      outDir: "dist",
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
  };
});
