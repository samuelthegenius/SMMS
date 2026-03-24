/**
 * Security Configuration for SMMS
 * This file contains security-related configurations and utilities
 */

// Content Security Policy configuration
export const CSP_POLICY = {
  development: "default-src 'self'; script-src 'self' 'unsafe-eval' https://ntayjobqhpbozamoxgad.supabase.co; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://ntayjobqhpbozamoxgad.supabase.co https://api.supabase.co https://mtusmms.me https://api.emailjs.com wss://ntayjobqhpbozamoxgad.supabase.co ws://ntayjobqhpbozamoxgad.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self';",
  production: "default-src 'self'; script-src 'self' https://ntayjobqhpbozamoxgad.supabase.co; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://ntayjobqhpbozamoxgad.supabase.co https://api.supabase.co https://mtusmms.me https://api.emailjs.com wss://ntayjobqhpbozamoxgad.supabase.co ws://ntayjobqhpbozamoxgad.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self';"
};

// Security headers for production
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
};

// Input validation patterns
export const VALIDATION_PATTERNS = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  idNumber: /^[a-zA-Z0-9]{5,20}$/,
  title: /^.{3,100}$/,
  description: /^.{10,2000}$/,
  location: /^.{0,200}$/
};

// File upload constraints
export const FILE_CONSTRAINTS = {
  maxSize: 5 * 1024 * 1024, // 5MB
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp', '.gif']
};

// Rate limiting configurations
export const RATE_LIMITS = {
  login: {
    maxAttempts: 5,
    windowMs: 5 * 60 * 1000, // 5 minutes
    lockoutMs: 5 * 60 * 1000  // 5 minutes
  },
  signup: {
    maxAttempts: 3,
    windowMs: 15 * 60 * 1000 // 15 minutes
  },
  emailLookup: {
    maxAttempts: 10,
    windowMs: 5 * 60 * 1000 // 5 minutes
  }
};

// Sanitization utilities
export const sanitizeInput = (input, type = 'text') => {
  if (!input) return '';
  
  let sanitized = input.toString().trim();
  
  // Remove potential XSS characters
  sanitized = sanitized.replace(/[<>]/g, '');
  
  // Remove potential SQL injection patterns
  sanitized = sanitized.replace(/['"\\;]/g, '');
  
  // Type-specific sanitization
  switch (type) {
    case 'number':
      return sanitized.replace(/[^0-9]/g, '');
    case 'email':
      return sanitized.toLowerCase();
    case 'alphanumeric':
      return sanitized.replace(/[^a-zA-Z0-9]/g, '');
    default:
      return sanitized;
  }
};

// URL validation to prevent SSRF
export const validateUrl = (url, allowedDomains = []) => {
  try {
    const urlObj = new URL(url);
    
    // Only allow HTTPS
    if (urlObj.protocol !== 'https:') {
      return false;
    }
    
    // Check against allowed domains
    if (allowedDomains.length > 0) {
      return allowedDomains.some(domain => 
        urlObj.hostname === domain || urlObj.hostname.endsWith(`.${domain}`)
      );
    }
    
    return true;
  } catch {
    return false;
  }
};

// Error message sanitization to prevent information disclosure
export const sanitizeError = (error, isProduction = true) => {
  if (!isProduction) {
    return error?.message || 'Unknown error';
  }
  
  // Generic error messages for production
  const genericMessages = {
    'auth': 'Invalid credentials',
    'network': 'Network error. Please try again.',
    'server': 'Server error. Please try again later.',
    'validation': 'Invalid input provided',
    'permission': 'Access denied',
    'rate_limit': 'Too many requests. Please try again later.'
  };
  
  // Determine error type and return appropriate generic message
  const message = error?.message?.toLowerCase() || '';
  
  if (message.includes('auth') || message.includes('login') || message.includes('password')) {
    return genericMessages.auth;
  }
  if (message.includes('network') || message.includes('fetch')) {
    return genericMessages.network;
  }
  if (message.includes('server') || message.includes('internal')) {
    return genericMessages.server;
  }
  if (message.includes('valid') || message.includes('required')) {
    return genericMessages.validation;
  }
  if (message.includes('permission') || message.includes('access')) {
    return genericMessages.permission;
  }
  if (message.includes('rate') || message.includes('limit')) {
    return genericMessages.rate_limit;
  }
  
  return genericMessages.server;
};
