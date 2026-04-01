/**
 * Security Configuration for SMMS
 * This file contains security-related configurations and utilities
 */

// Input validation patterns
export const VALIDATION_PATTERNS = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  idNumber: /^[a-zA-Z0-9]{5,20}$/,
  title: /^.{3,100}$/,
  description: /^.{10,2000}$/,
  location: /^.{0,200}$/,
  // Security patterns to detect malicious input
  xssPattern: /<script|javascript:|on\w+\s*=|expression\(/gi,
  sqlPattern: /union\s+select|drop\s+table|insert\s+into|delete\s+from|'|"|;|--|\/\*/gi,
  pathTraversal: /\.\.\/|\.\.\\|%2e%2e%2f/gi
};

// Sanitization utilities
export const sanitizeInput = (input, type = 'text') => {
  if (!input) return '';
  
  let sanitized = input.toString().trim();
  
  // Check for malicious patterns first
  if (VALIDATION_PATTERNS.xssPattern.test(sanitized)) {
    throw new Error('Invalid input format detected');
  }
  if (VALIDATION_PATTERNS.sqlPattern.test(sanitized)) {
    throw new Error('Invalid input format detected');
  }
  if (VALIDATION_PATTERNS.pathTraversal.test(sanitized)) {
    throw new Error('Invalid input format detected');
  }
  
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
    'rate_limit': 'Too many requests. Please try again later.',
    'database': 'Database operation failed',
    'storage': 'File operation failed'
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
  if (message.includes('permission') || message.includes('access') || message.includes('unauthorized')) {
    return genericMessages.permission;
  }
  if (message.includes('rate') || message.includes('limit')) {
    return genericMessages.rate_limit;
  }
  if (message.includes('database') || message.includes('sql') || message.includes('constraint')) {
    return genericMessages.database;
  }
  if (message.includes('storage') || message.includes('upload') || message.includes('file')) {
    return genericMessages.storage;
  }
  
  return genericMessages.server;
};
