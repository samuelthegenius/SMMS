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

// Custom plugin to handle CommonJS exports issues
const commonjsFix = () => ({
  name: 'commonjs-fix',
  configResolved(resolved) {
    // Add global definitions for CommonJS compatibility
    resolved.define = {
      ...resolved.define,
      exports: '{}',
      module: 'undefined',
      require: 'undefined',
      global: 'globalThis'
    }
  }
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    // Custom plugin to handle CommonJS exports issues
    commonjsFix(),
    // Integration of React specific features like Fast Refresh
    react({
      // Add JSX runtime configuration
      jsxRuntime: 'automatic',
      // Ensure proper import source
      importSource: 'react'
    })
  ],

  // Development Server Configuration
  server: {
    // WebSocket HMR configuration - use same port as HTTP server
    hmr: {
      port: 5173,
      host: 'localhost',
      protocol: 'ws'
    },
    // SPA routing: serve index.html for all routes
    historyApiFallback: true,
    // Security Headers for Development
    headers: {
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://ntayjobqhpbozamoxgad.supabase.co; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; connect-src 'self' http://localhost:* https://localhost:* ws://localhost:* wss://localhost:* https://ntayjobqhpbozamoxgad.supabase.co https://api.supabase.co https://mtusmms.me https://api.emailjs.com wss://ntayjobqhpbozamoxgad.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests; object-src 'none'; media-src 'self'; worker-src 'self' blob:;",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), unload=()',
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
          'vendor-react': ['react', 'react-dom', 'react-router-dom', 'framer-motion', 'lucide-react', 'class-variance-authority', 'clsx', 'tailwind-merge', 'sonner'],
          'vendor-data': ['@supabase/supabase-js', 'swr']
          // Note: Heavy libs (recharts, jspdf, @google/generative-ai, resend) are NOT here
          // They are loaded on-demand via dynamic imports in the components that use them
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js'
      }
    },
    minify: 'terser',
    sourcemap: false,
    target: 'es2020',
    // Speed up builds
    reportCompressedSize: false
  },
  
  // Optimize development server
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', '@supabase/supabase-js', 'lucide-react', 'clsx', 'tailwind-merge', 'class-variance-authority'],
    // Don't exclude heavy deps - let Vite pre-bundle them for faster loading
    exclude: [],
    esbuildOptions: {
      target: 'es2020'
    }
  },
  
  // Define global constants to replace exports-related issues
  define: {
    global: 'globalThis'
  },
  
  // Resolve module issues
  resolve: {
    alias: {}
  }
})
