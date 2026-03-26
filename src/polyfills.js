/**
 * Polyfills for CommonJS compatibility in ES modules
 * Only add polyfills if they don't already exist
 */

// Polyfill for CommonJS exports (only if undefined)
if (typeof window.exports === 'undefined') {
  window.exports = {};
}

// Polyfill for CommonJS module (only if undefined)
if (typeof window.module === 'undefined') {
  window.module = { exports: {} };
}

// Polyfill for global (only if undefined)
if (typeof window.global === 'undefined') {
  window.global = window.globalThis || window;
}

// Don't polyfill require as it can interfere with module loading
export {};
