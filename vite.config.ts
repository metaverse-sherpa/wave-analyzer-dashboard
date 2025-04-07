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
      },
      proxy: {
        '/api': {
          target: 'https://api-backend.metaversesherpa.workers.dev',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, '')
        }
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
        brotliSize: true,
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
      'process.env.VITE_USE_REAL_API': JSON.stringify(env.VITE_USE_REAL_API || 'false'),
      'process.env.VITE_DEBUG_API_CALLS': JSON.stringify(env.VITE_DEBUG_API_CALLS || 'false'),
    },
    build: {
      outDir: "dist",
      chunkSizeWarningLimit: 1000,
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            // Predefined chunk groups
            if (id.includes('node_modules/react/') || 
                id.includes('node_modules/react-dom/') || 
                id.includes('node_modules/react-router-dom/') ||
                id.includes('node_modules/scheduler/')) {
              return 'react';
            }
            
            // UI library components
            if (id.includes('node_modules/@radix-ui/react-dialog') || 
                id.includes('node_modules/@radix-ui/react-tabs') ||
                id.includes('node_modules/@radix-ui/react-popover') ||
                id.includes('node_modules/class-variance-authority') ||
                id.includes('node_modules/clsx') ||
                id.includes('node_modules/tailwind-merge')) {
              return 'ui';
            }
            
            // Chart libraries
            if (id.includes('node_modules/recharts') || 
                id.includes('node_modules/apexcharts') || 
                id.includes('node_modules/react-apexcharts')) {
              return 'charts';
            }
            
            // React Router
            if (id.includes('node_modules/react-router-dom/')) {
              return 'react-router';
            }
            
            // Radix UI components (that aren't in the UI chunk)
            if (id.includes('node_modules/@radix-ui/react-')) {
              return 'radix-ui';
            }
            
            // Chart libraries (that aren't in the charts chunk)
            if (id.includes('node_modules/recharts/') || 
                id.includes('node_modules/chart.js/') || 
                id.includes('node_modules/chartjs-plugin-datalabels/')) {
              return 'chart-lib';
            }
            
            // Keep other node_modules as vendor
            if (id.includes('node_modules/')) {
              return 'vendor';
            }
            
            // Return undefined for everything else so it follows default chunking behavior
            return undefined;
          },
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
