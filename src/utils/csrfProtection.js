/**
 * CSRF Protection Utilities
 * Implements CSRF token generation and validation for state-changing operations
 */

import { supabase } from '../lib/supabase';

// CSRF token storage key
const CSRF_TOKEN_KEY = 'csrf_token';
const CSRF_TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Generate a secure random CSRF token
 */
export const generateCSRFToken = () => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
};

/**
 * Store CSRF token with timestamp
 */
export const storeCSRFToken = (token) => {
  const tokenData = {
    token,
    timestamp: Date.now()
  };
  sessionStorage.setItem(CSRF_TOKEN_KEY, JSON.stringify(tokenData));
  return token;
};

/**
 * Get stored CSRF token if valid
 */
export const getCSRFToken = () => {
  try {
    const stored = sessionStorage.getItem(CSRF_TOKEN_KEY);
    if (!stored) return null;

    const tokenData = JSON.parse(stored);
    
    // Check if token is expired
    if (Date.now() - tokenData.timestamp > CSRF_TOKEN_EXPIRY) {
      sessionStorage.removeItem(CSRF_TOKEN_KEY);
      return null;
    }

    return tokenData.token;
  } catch {
    return null;
  }
};

/**
 * Get or create CSRF token
 */
export const getOrCreateCSRFToken = () => {
  let token = getCSRFToken();
  if (!token) {
    token = generateCSRFToken();
    storeCSRFToken(token);
  }
  return token;
};

/**
 * Validate CSRF token for API requests
 */
export const validateCSRFToken = (requestToken) => {
  const storedToken = getCSRFToken();
  if (!storedToken || !requestToken) {
    return false;
  }
  
  // Use constant-time comparison to prevent timing attacks
  if (storedToken.length !== requestToken.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < storedToken.length; i++) {
    result |= storedToken.charCodeAt(i) ^ requestToken.charCodeAt(i);
  }
  
  return result === 0;
};

/**
 * Enhanced fetch wrapper with CSRF protection
 */
export const secureFetch = async (url, options = {}) => {
  const method = (options.method || 'GET').toUpperCase();
  
  // Only add CSRF token to state-changing methods
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    const token = getOrCreateCSRFToken();
    
    // Add token to headers or body based on content type
    if (options.headers?.['Content-Type']?.includes('application/json')) {
      options.body = JSON.stringify({
        ...JSON.parse(options.body || '{}'),
        _csrf: token
      });
    } else {
      options.headers = {
        ...options.headers,
        'X-CSRF-Token': token
      };
    }
  }

  // Add security headers
  options.headers = {
    ...options.headers,
    'X-Requested-With': 'XMLHttpRequest'
  };

  try {
    const response = await fetch(url, options);
    
    // Check for CSRF validation errors
    if (response.status === 403) {
      const error = await response.json().catch(() => ({}));
      if (error.error?.includes('CSRF')) {
        // Clear invalid token and regenerate
        sessionStorage.removeItem(CSRF_TOKEN_KEY);
        throw new Error('CSRF token validation failed. Please try again.');
      }
    }
    
    return response;
  } catch (error) {
    console.error('Secure fetch error:', error);
    throw error;
  }
};

/**
 * CSRF token validation middleware for Supabase Edge Functions
 */
export const validateCSRFMiddleware = (req) => {
  const method = req.method;
  
  // Skip validation for safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return true;
  }

  // Get token from header or body
  let token = req.headers.get('X-CSRF-Token');
  
  if (!token && req.body) {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      token = body._csrf;
    } catch {
      // Invalid JSON body
      return false;
    }
  }

  // For Edge Functions, we'll validate against a session-based token
  // This is a simplified version - in production, store tokens in Redis/database
  return token && token.length === 64; // Basic length check
};

/**
 * Initialize CSRF protection on app load
 */
export const initializeCSRFProtection = () => {
  // Generate token if none exists
  getOrCreateCSRFToken();
  
  // Clear token on tab close (sessionStorage automatically handles this)
  // Regenerate token on focus after 30 minutes of inactivity
  let lastActivity = Date.now();
  
  const updateActivity = () => {
    lastActivity = Date.now();
  };
  
  document.addEventListener('click', updateActivity);
  document.addEventListener('keypress', updateActivity);
  
  // Check for inactivity and regenerate token if needed
  setInterval(() => {
    if (Date.now() - lastActivity > 30 * 60 * 1000) { // 30 minutes
      const newToken = generateCSRFToken();
      storeCSRFToken(newToken);
    }
  }, 5 * 60 * 1000); // Check every 5 minutes
};
