/**
 * Security Validation Utilities
 * Additional security checks and validations
 */

import { VALIDATION_PATTERNS, sanitizeInput } from '../config/security.js';

/**
 * Comprehensive security validation for user inputs
 */
export const validateSecurity = {
  /**
   * Validate and sanitize text input
   */
  validateText(input, fieldName = 'input', maxLength = 1000) {
    if (!input || typeof input !== 'string') {
      throw new Error(`${fieldName} is required`);
    }

    if (input.length > maxLength) {
      throw new Error(`${fieldName} exceeds maximum length`);
    }

    // Check for malicious patterns
    if (VALIDATION_PATTERNS.xssPattern.test(input)) {
      throw new Error(`Invalid ${fieldName} format`);
    }

    if (VALIDATION_PATTERNS.sqlPattern.test(input)) {
      throw new Error(`Invalid ${fieldName} format`);
    }

    if (VALIDATION_PATTERNS.pathTraversal.test(input)) {
      throw new Error(`Invalid ${fieldName} format`);
    }

    return sanitizeInput(input);
  },

  /**
   * Validate email with additional security checks
   */
  validateEmail(email) {
    const cleanEmail = this.validateText(email, 'email', 254);
    
    if (!VALIDATION_PATTERNS.email.test(cleanEmail)) {
      throw new Error('Invalid email format');
    }

    // Check for suspicious email patterns
    const suspiciousPatterns = [
      /^[a-z]+\.[a-z]+@/, // firstname.lastname pattern (potential enumeration)
      /test.*@/, // test emails
      /admin.*@/, // admin-related emails
      /.*@.*\.(tk|ml|ga|cf)$/ // suspicious TLDs
    ];

    if (suspiciousPatterns.some(pattern => pattern.test(cleanEmail.toLowerCase()))) {
      // Log suspicious email attempt but don't block
      console.warn('Suspicious email pattern detected:', cleanEmail);
    }

    return cleanEmail.toLowerCase();
  },

  /**
   * Validate ID number with security checks
   */
  validateIdNumber(id) {
    const cleanId = this.validateText(id, 'ID number', 50);
    
    if (!VALIDATION_PATTERNS.idNumber.test(cleanId)) {
      throw new Error('Invalid ID number format');
    }

    // Check for sequential or repeated patterns
    if (/^(.)\1+$/.test(cleanId) || /^0123/.test(cleanId)) {
      throw new Error('Invalid ID number format');
    }

    return cleanId;
  },

  /**
   * Validate file upload with comprehensive security
   */
  validateFile(file, allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']) {
    if (!file || !(file instanceof File)) {
      throw new Error('Invalid file');
    }

    // Check file size (5MB limit)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new Error('File size exceeds 5MB limit');
    }

    // Check MIME type
    if (!allowedTypes.includes(file.type)) {
      throw new Error('File type not allowed');
    }

    // Check file extension
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
    
    if (!allowedExtensions.includes(fileExtension)) {
      throw new Error('File extension not allowed');
    }

    // Check for dangerous file names
    const fileName = file.name.toLowerCase();
    const dangerousPatterns = [
      /\.\./, // Path traversal
      /[<>:"|?*]/, // Invalid characters
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])/, // Reserved names
      /\.exe$/i, /\.bat$/i, /\.cmd$/i, /\.scr$/i, // Executables
      /\.php$/i, /\.asp$/i, /\.jsp$/i, /\.sh$/i, // Scripts
    ];

    if (dangerousPatterns.some(pattern => pattern.test(fileName))) {
      throw new Error('Invalid file name');
    }

    return true;
  },

  /**
   * Validate URL to prevent SSRF
   */
  validateUrl(url, allowedDomains = []) {
    if (!url || typeof url !== 'string') {
      throw new Error('Invalid URL');
    }

    try {
      const urlObj = new URL(url);
      
      // Only allow HTTP/HTTPS
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        throw new Error('Invalid URL protocol');
      }

      // Block localhost and private IPs
      const hostname = urlObj.hostname;
      const blockedHosts = [
        'localhost', '127.0.0.1', '0.0.0.0',
        '::1', '2001:db8::', 'fc00::',
        '10.', '192.168.', '172.16.', '172.17.', '172.18.', '172.19.',
        '172.20.', '172.21.', '172.22.', '172.23.', '172.24.', '172.25.',
        '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.'
      ];

      if (blockedHosts.some(blocked => hostname.startsWith(blocked))) {
        throw new Error('Invalid URL host');
      }

      // Check against allowed domains if specified
      if (allowedDomains.length > 0) {
        const isAllowed = allowedDomains.some(domain => 
          hostname === domain || hostname.endsWith(`.${domain}`)
        );
        
        if (!isAllowed) {
          throw new Error('URL not in allowed domains');
        }
      }

      return urlObj.href;
    } catch {
      throw new Error('Invalid URL format');
    }
  },

  /**
   * Rate limit validation helper
   */
  checkRateLimit(action, maxAttempts = 5, windowMs = 300000) {
    const storageKey = `rate_limit_${action}`;
    const now = Date.now();
    
    try {
      const stored = localStorage.getItem(storageKey);
      const data = stored ? JSON.parse(stored) : { attempts: 0, resetTime: now + windowMs };
      
      // Reset if window expired
      if (now > data.resetTime) {
        data.attempts = 0;
        data.resetTime = now + windowMs;
      }
      
      if (data.attempts >= maxAttempts) {
        const resetIn = Math.ceil((data.resetTime - now) / 1000 / 60);
        throw new Error(`Rate limit exceeded. Try again in ${resetIn} minutes.`);
      }
      
      // Increment and store
      data.attempts++;
      localStorage.setItem(storageKey, JSON.stringify(data));
      
      return {
        attempts: data.attempts,
        remaining: maxAttempts - data.attempts,
        resetTime: data.resetTime
      };
    } catch (error) {
      // If localStorage fails, allow the request but log it
      console.warn('Rate limit check failed:', error);
      return { attempts: 0, remaining: maxAttempts, resetTime: now + windowMs };
    }
  },

  /**
   * Clear rate limit for an action
   */
  clearRateLimit(action) {
    const storageKey = `rate_limit_${action}`;
    localStorage.removeItem(storageKey);
  }
};

/**
 * Security monitoring for suspicious activities
 */
export const securityMonitor = {
  /**
   * Check for suspicious user agent
   */
  checkUserAgent(userAgent) {
    const suspiciousPatterns = [
      /bot/i, /crawler/i, /spider/i, /scraper/i,
      /curl/i, /wget/i, /python/i, /java/i,
      /sqlmap/i, /nmap/i, /metasploit/i
    ];

    const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(userAgent));
    
    if (isSuspicious) {
      console.warn('Suspicious user agent detected:', userAgent);
      // Could trigger additional security measures
    }

    return !isSuspicious;
  },

  /**
   * Monitor for rapid requests
   */
  detectRapidRequests(threshold = 10, windowMs = 60000) {
    const storageKey = 'request_timestamps';
    const now = Date.now();
    
    try {
      const timestamps = JSON.parse(localStorage.getItem(storageKey) || '[]');
      
      // Filter old timestamps
      const recent = timestamps.filter(timestamp => now - timestamp < windowMs);
      
      if (recent.length >= threshold) {
        console.warn('Rapid requests detected:', recent.length);
        return true;
      }
      
      // Add current timestamp
      recent.push(now);
      localStorage.setItem(storageKey, JSON.stringify(recent.slice(-100))); // Keep last 100
      
      return false;
    } catch (error) {
      console.warn('Request monitoring failed:', error);
      return false;
    }
  }
};

/**
 * Initialize security monitoring
 */
export const initializeSecurity = () => {
  // Check user agent
  securityMonitor.checkUserAgent(navigator.userAgent);
  
  // Monitor for rapid requests
  setInterval(() => {
    if (securityMonitor.detectRapidRequests()) {
      // Could implement additional security measures
      console.warn('Security: Rapid request pattern detected');
    }
  }, 5000);
};
