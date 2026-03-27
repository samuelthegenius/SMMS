/**
 * @file vite.config.js
 * @description Configuration for the Vite build tool.
 * @author System Administrator
 * 
 * Key Features:
 * - React Plugin: Enables Fast Refresh (HMR) and JSX support.
 * - Security Headers: Implements CSP and other security headers for development.
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    // Integration of React specific features like Fast Refresh
    react({
      jsxRuntime: 'automatic'
    }),
    // Bundle analyzer - only in analyze mode
    mode === 'analyze' && visualizer({
      open: true,
      gzipSize: true,
      brotliSize: true,
      filename: 'dist/stats.html'
    })
  ].filter(Boolean),

  // Development Server Configuration
  server: {
    // Explicit HMR configuration to fix WebSocket connection
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port: 5173,
      clientPort: 5173
    },
    // SPA routing: serve index.html for all routes
    historyApiFallback: true,
    // Security Headers for Development
    headers: {
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://ntayjobqhpbozamoxgad.supabase.co https://va.vercel-scripts.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; connect-src 'self' http://localhost:* https://localhost:* ws://localhost:* wss://localhost:* https://ntayjobqhpbozamoxgad.supabase.co https://api.supabase.co https://mtusmms.me https://api.emailjs.com wss://ntayjobqhpbozamoxgad.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests; object-src 'none'; media-src 'self'; worker-src 'self' blob:;",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload'
    },
    // Enable preloading for better performance
    preTransformRequests: true
  }
  ,

  // Build Configuration for Optimization
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      external: [],
      output: {
        format: 'es',
        exports: 'auto',
        // Simplified chunking strategy - fewer chunks = less HTTP overhead
        manualChunks: {
          // Core framework + UI utilities - merged to avoid circular dependency
          'vendor-core': [
            'react', 'react-dom', 'react-router-dom',
            'lucide-react', 'class-variance-authority', 'clsx', 'tailwind-merge', 'sonner'
          ],
          // Animations - lazy loaded when needed
          'vendor-motion': ['framer-motion'],
          // Data layer
          'vendor-data': ['@supabase/supabase-js', 'swr']
          // Heavy libs (recharts, jspdf, @google/generative-ai, resend) loaded on-demand via dynamic imports
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js'
      }
    },
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.trace'],
        passes: 2,
        dead_code: true,
        unused: true,
        reduce_vars: true,
        collapse_vars: true,
        evaluate: true,
        booleans: true,
        typeofs: true,
        conditionals: true,
        sequences: true,
        properties: true,
        comparisons: true,
        hoist_funs: true,
        hoist_vars: false,
        if_return: true,
        join_vars: true,
        side_effects: true
      },
      mangle: {
        safari10: true,
        properties: false
      },
      format: {
        comments: false,
        ascii_only: true
      }
    },
    cssMinify: true,
    sourcemap: false,
    target: 'es2020',
    reportCompressedSize: false,
    // Generate smaller chunks
    cssCodeSplit: true,
    assetsInlineLimit: 8192,
    // Module preloading for critical chunks
    modulePreload: {
      polyfill: true,
      resolveDependencies: (url, deps, _chunk) => {
        // Only preload critical dependencies
        return deps.filter(dep => 
          dep.includes('vendor-core') || 
          dep.includes('vendor-data')
        );
      }
    },
    // Experimental features for faster builds
    experimental: {
      renderBuiltUrl: (_filename) => {
        return {
          relative: true
        };
      }
    }
  },
  
  // Optimize development server
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', '@supabase/supabase-js', 'lucide-react', 'clsx', 'tailwind-merge', 'class-variance-authority', 'sonner', 'swr'],
    exclude: ['framer-motion'], // Loaded when animations are needed
    esbuildOptions: {
      target: 'es2020',
      minify: true,
      legalComments: 'none'
    },
    force: false
  },
  
  // Define global constants to replace exports-related issues
  define: {
    global: 'globalThis',
    // Polyfill React for legacy modules that might need it globally
    'window.React': 'React'
  },
  
  // Resolve module issues
  resolve: {
    alias: {}
  }
}))
