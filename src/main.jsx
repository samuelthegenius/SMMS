/**
 * @file src/main.jsx
 * @description Application Entry Point.
 *
 * Architecture:
 * - DOM Injection: Mounts the React component tree into the 'root' div defined in index.html.
 * - Strict Mode: Enforces best practices by double-invoking lifecycle methods during development to catch side effects.
 * - Global Styles: Injects the standard Tailwind CSS directives via 'index.css'.
 * - Error Boundary: Catches and handles React errors gracefully.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import './index.css'
import App from './App.jsx'
import './utils/registerSW.js' // Register PWA service worker
import { initializeSecurityMonitoring } from './utils/securityMonitoring.js' // Initialize security monitoring

// Initialize security monitoring
initializeSecurityMonitoring();

// React 18 Concurrency Model Initialization
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
