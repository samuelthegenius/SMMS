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
import React from 'react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import './index.css'
import App from './App.jsx'

// Hide skeleton loader immediately when script runs
const hideLoader = () => {
  const loader = document.getElementById('initial-loader')
  if (loader) {
    loader.style.opacity = '0'
    loader.style.transition = 'opacity 0.3s ease-out'
    setTimeout(() => loader.remove(), 300)
  }
}

// React 18 Concurrency Model - create root immediately
const root = createRoot(document.getElementById('root'))

// Mark start of React render
performance.mark('react-render-start')

// Hide loader as soon as React starts mounting (before actual render)
hideLoader()

root.render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

// Mark end of render and measure
requestIdleCallback(() => {
  performance.mark('react-render-end')
  performance.measure('react-render', 'react-render-start', 'react-render-end')
  
  const measure = performance.getEntriesByName('react-render')[0]
  console.log(`⚛️ React render time: ${Math.round(measure.duration)}ms`)
})
