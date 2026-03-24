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
      'Content-Security-Policy': "default-src 'self'; script-src 'self' https://ntayjobqhpbozamoxgad.supabase.co; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://ntayjobqhpbozamoxgad.supabase.co https://api.supabase.co https://mtusmms.me https://api.emailjs.com wss://ntayjobqhpbozamoxgad.supabase.co ws://ntayjobqhpbozamoxgad.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self';",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()'
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
