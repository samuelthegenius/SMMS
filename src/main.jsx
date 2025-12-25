/**
 * @file src/main.jsx
 * @description Application Entry Point.
 * 
 * Architecture:
 * - DOM Injection: Mounts the React component tree into the 'root' div defined in index.html.
 * - Strict Mode: Enforces best practices by double-invoking lifecycle methods during development to catch side effects.
 * - Global Styles: Injects the standard Tailwind CSS directives via 'index.css'.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// React 18 Concurrency Model Initialization
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
