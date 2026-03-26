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
    // WebSocket HMR configuration - let Vite auto-configure port
    hmr: true,
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
    chunkSizeWarningLimit: 1000, // Increased limit to 1MB to reduce noise for inevitably large chunks
    rollupOptions: {
      // Add Rollup configuration to handle CommonJS modules
      external: [],
      output: {
        format: 'es',
        exports: 'auto',
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-ui': ['lucide-react', 'class-variance-authority', 'clsx', 'tailwind-merge'],
          'vendor-charts': ['recharts'],
          'vendor-pdf': ['jspdf', 'jspdf-autotable'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-motion': ['framer-motion'],
          'vendor-other': ['@google/generative-ai', 'resend', 'swr', 'sonner']
        },
        // Optimize chunk splitting for better caching
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js'
      }
    },
    // Enable better optimization
    minify: 'terser',
    sourcemap: false,
    target: 'es2020'
  },
  
  // Optimize development server
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', '@supabase/supabase-js'],
    exclude: [
      'jspdf', 'jspdf-autotable', // Heavy PDF libraries
      'recharts', // Charts library - load on demand
      '@google/generative-ai' // AI library - load on demand
    ],
    // Force optimization of problematic dependencies - disabled for faster builds
    // force: true
  },
  
  // Define global constants to replace exports-related issues
  define: {
    global: 'globalThis'
  },
  
  // Resolve module issues
  resolve: {
    alias: {
      // Ensure we use the ES module version of supabase
      '@supabase/supabase-js': '@supabase/supabase-js/dist/module/index.js'
    }
  }
})
