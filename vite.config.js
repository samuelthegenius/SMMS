/**
 * @file vite.config.js
 * @description Configuration for the Vite build tool.
 * @author System Administrator
 * 
 * Key Features:
 * - React Plugin: Enables Fast Refresh (HMR) and JSX support.
 * - PWA Integration: Configures the app as a Progressive Web App (offline support, caching).
 * - Secure Proxying: Routes /api requests to prevent CORS issues during development.
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    // Integration of React specific features like Fast Refresh
    react(),

    // PWA Plugin configuration for offline capabilities and installation support
    // Strategies like 'autoUpdate' ensure the user always has the latest service worker.
    VitePWA({
      devOptions: {
        enabled: true,
        type: 'module',
      },
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'Smart Maintenance Management System',
        short_name: 'SMMS',
        description: 'The official maintenance portal for Mountain Top University.',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait-primary',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true
      }
    })
  ],

  // Development Server Configuration
  server: {
    // Proxy Configuration: Acts as a middleware during development.
    // It forwards requests starting with /api to the backend server (Vercel functions or local server),
    // effectively bypassing Cross-Origin Resource Sharing (CORS) restrictions that browsers enforce.
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
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
