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

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    // Integration of React specific features like Fast Refresh
    react()
  ],

  // Development Server Configuration
  server: {
    // Security Headers for Development
    headers: {
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://ntayjobqhpbozamoxgad.supabase.co 'sha256-Z2/iFzh9VMlVkEOar1f/oSHWwQk3ve1qk/C2WdsC4Xk=' 'sha256-+iz8eJzSsU+2n7gjPhZ3/518PSxaGqZql8Kzpmp5BwU='; style-src 'self' 'unsafe-inline' https://ntayjobqhpbozamoxgad.supabase.co; img-src 'self' data: https: blob:; font-src 'self' data:; connect-src 'self' https://ntayjobqhpbozamoxgad.supabase.co https://api.supabase.co https://mtusmms.me https://api.emailjs.com wss://ntayjobqhpbozamoxgad.supabase.co ws://ntayjobqhpbozamoxgad.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests; object-src 'none'; media-src 'self'; worker-src 'self' blob:;",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload'
    }
  }
  ,

  // Build Configuration for Optimization
  build: {
    chunkSizeWarningLimit: 1000, // Increased limit to 1MB to reduce noise for inevitably large chunks
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-ui': ['lucide-react', 'class-variance-authority', 'clsx', 'tailwind-merge'],
          'vendor-charts': ['recharts'],
          'vendor-pdf': ['jspdf', 'jspdf-autotable'],
          'vendor-supabase': ['@supabase/supabase-js']
        }
      }
    }
  }
})
