/**
 * @file src/main.jsx
 * @description Application Entry Point.
 *
 * Architecture:
 * - DOM Injection: Mounts the React component tree into the 'root' div defined in index.html.
 * - Strict Mode: Enforces best practices by double-invoking components during development. This intentional
 *   re-render helps detect side effects but may appear like a "reload" - this is expected behavior, not a bug.
 * - Global Styles: Injects the standard Tailwind CSS directives via 'index.css'.
 * - Error Boundary: Catches and handles React errors gracefully.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import './index.css'
import App from './App.jsx'

// React 18 Concurrency Model - create root immediately
const root = createRoot(document.getElementById('root'))

// Mark start of React render
performance.mark('react-render-start')

root.render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

// Mark end of render and measure
setTimeout(() => {
  performance.mark('react-render-end')
  performance.measure('react-render', 'react-render-start', 'react-render-end')
  
}, 0)
