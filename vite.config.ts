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
  
  // Get API URL from environment variable or use fallback
  const apiBaseUrl = env.VITE_API_BASE_URL || 'http://localhost:3001';
  
  console.log(`[Vite Config] Using API URL: ${apiBaseUrl} (Mode: ${mode})`);
  
  return {
    server: {
      host: "localhost",
      port: 3000,
      hmr: {
        overlay: false,
      }
    },
    plugins: [
      react({
        // This is critical for React.forwardRef to work correctly
        jsxRuntime: 'automatic',
        // Ensure React is properly externalized
        babel: {
          plugins: []
        }
      }),
      mode === 'development' && componentTagger(),
      visualizer({
        open: false,
        gzipSize: true,
      }),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "react": path.resolve(__dirname, "./node_modules/react"),
        "react-dom": path.resolve(__dirname, "./node_modules/react-dom")
      },
    },
    define: {
      'process.env.VITE_API_BASE_URL': JSON.stringify(apiBaseUrl),
    },
    build: {
      outDir: "dist",
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            // Critical: Ensure React is in its own chunk
            if (id.includes('node_modules/react/') || 
                id.includes('node_modules/react-dom/') ||
                id.includes('node_modules/scheduler/')) {
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
            
            // Chart libraries
            if (id.includes('node_modules/recharts/') || 
                id.includes('node_modules/chart.js/') || 
                id.includes('node_modules/chartjs-plugin-datalabels/')) {
              return 'chart-lib';
            }
            
            // Keep other node_modules as vendor
            if (id.includes('node_modules/')) {
              return 'vendor';
            }
          }
        }
      },
      // Use common for modules that need to share React
      commonjsOptions: {
        include: [/node_modules/],
        requireReturnsDefault: 'auto',
      },
    },
    optimizeDeps: {
      include: [
        'react', 
        'react-dom', 
        'recharts', 
        '@radix-ui/react-slot'
      ],
      esbuildOptions: {
        // Ensure proper React namespace preservation
        define: {
          global: 'globalThis'
        }
      }
    },
  };
});
