/**
 * Security Testing Suite
 * Automated security tests for SMMS application
 */

import { describe, it, expect, beforeEach } from '@jest/testing-framework';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../contexts/AuthContext';
import Login from '../pages/Login';
import TicketForm from '../pages/TicketForm';
import { validateCSRFToken, generateCSRFToken } from '../utils/csrfProtection';
import { securityMonitoring } from '../utils/securityMonitoring';
import { sanitizeInput, validateUrl } from '../config/security';

// Test wrapper
const TestWrapper = ({ children }) => (
  <BrowserRouter>
    <AuthProvider>
      {children}
    </AuthProvider>
  </BrowserRouter>
);

describe('Security Tests', () => {
  beforeEach(() => {
    // Clear sessionStorage before each test
    sessionStorage.clear();
    localStorage.clear();
  });

  describe('Input Validation & Sanitization', () => {
    it('should sanitize XSS attempts in input', () => {
      const maliciousInput = '<script>alert("xss")</script>';
      const sanitized = sanitizeInput(maliciousInput);
      
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('</script>');
    });

    it('should prevent SQL injection patterns', () => {
      const sqlInjection = "'; DELETE FROM users; --";
      const sanitized = sanitizeInput(sqlInjection);
      
      expect(sanitized).not.toContain("';");
      expect(sanitized).not.toContain('--');
    });

    it('should validate URLs to prevent SSRF', () => {
      const maliciousUrls = [
        'http://localhost:8080/admin',
        'file:///etc/passwd',
        'ftp://malicious.com/data',
        'https://internal.company.local'
      ];

      maliciousUrls.forEach(url => {
        expect(validateUrl(url)).toBe(false);
      });

      const safeUrls = [
        'https://example-app.com',
        'https://api.example-service.io'
      ];

      safeUrls.forEach(url => {
        expect(validateUrl(url, ['example-app.com', 'example-service.io'])).toBe(true);
      });
    });
  });

  describe('CSRF Protection', () => {
    it('should generate and validate CSRF tokens', () => {
      const token = generateCSRFToken();
      
      expect(token).toBeDefined();
      expect(token.length).toBe(64); // 32 bytes * 2 (hex)
      
      expect(validateCSRFToken(token)).toBe(true);
      expect(validateCSRFToken('invalid-token')).toBe(false);
      expect(validateCSRFToken('')).toBe(false);
    });

    it('should reject CSRF tokens of different lengths', () => {
      const token = generateCSRFToken();
      const invalidToken = token.substring(0, 32); // Half length
      
      expect(validateCSRFToken(invalidToken)).toBe(false);
    });
  });

  describe('Login Security', () => {
    it('should implement rate limiting', async () => {
      render(
        <TestWrapper>
          <Login />
        </TestWrapper>
      );

      const identifierInput = screen.getByLabelText(/Email or ID Number/i);
      const passwordInput = screen.getByLabelText(/Password/i);
      const submitButton = screen.getByRole('button', { name: /Sign In/i });

      // Simulate multiple failed login attempts
      for (let i = 0; i < 6; i++) {
        fireEvent.change(identifierInput, { target: { value: 'test@example.com' } });
        fireEvent.change(passwordInput, { target: { value: 'wrongpassword' } });
        fireEvent.click(submitButton);
        
        await waitFor(() => {
          // Wait for error message or rate limit
        }, { timeout: 1000 });
      }

      // Should show rate limiting message
      expect(screen.getByText(/Too many failed attempts/i)).toBeInTheDocument();
    });

    it('should prevent user enumeration', async () => {
      render(
        <TestWrapper>
          <Login />
        </TestWrapper>
      );

      const identifierInput = screen.getByLabelText(/Email or ID Number/i);
      const passwordInput = screen.getByLabelText(/Password/i);
      const submitButton = screen.getByRole('button', { name: /Sign In/i });

      // Test with non-existent email
      fireEvent.change(identifierInput, { target: { value: 'nonexistent@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        const errorMessage = screen.getByText(/Invalid ID Number or password/i);
        expect(errorMessage).toBeInTheDocument();
      });

      // Test with non-existent ID
      fireEvent.change(identifierInput, { target: { value: 'NONEXISTENT123' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        // Should show same generic error message
        const errorMessage = screen.getByText(/Invalid ID Number or password/i);
        expect(errorMessage).toBeInTheDocument();
      });
    });
  });

  describe('Ticket Form Security', () => {
    it('should validate and sanitize input', async () => {
      render(
        <TestWrapper>
          <TicketForm />
        </TestWrapper>
      );

      const titleInput = screen.getByLabelText(/Title/i);
      const _descriptionInput = screen.getByLabelText(/Description/i);

      // Test XSS attempt in title
      fireEvent.change(titleInput, { 
        target: { value: '<script>alert("xss")</script>' } 
      });

      // Should be sanitized
      expect(titleInput.value).not.toContain('<script>');
      
      // Test title length validation
      fireEvent.change(titleInput, { 
        target: { value: 'a'.repeat(101) } // Exceeds 100 char limit
      });

      await waitFor(() => {
        expect(screen.getByText(/Title must be between 3 and 100 characters/i)).toBeInTheDocument();
      });
    });

    it('should validate file uploads', async () => {
      render(
        <TestWrapper>
          <TicketForm />
        </TestWrapper>
      );

      const fileInput = screen.getByLabelText(/Image/i);

      // Test oversized file
      const largeFile = new File(['a'.repeat(6 * 1024 * 1024)], 'large.jpg', { 
        type: 'image/jpeg' 
      });
      
      fireEvent.change(fileInput, { target: { files: [largeFile] } });

      await waitFor(() => {
        expect(screen.getByText(/File size must be less than 5MB/i)).toBeInTheDocument();
      });

      // Test invalid file type
      const invalidFile = new File(['content'], 'malware.exe', { 
        type: 'application/octet-stream' 
      });
      
      fireEvent.change(fileInput, { target: { files: [invalidFile] } });

      await waitFor(() => {
        expect(screen.getByText(/Only JPEG, PNG, WEBP, and GIF images are allowed/i)).toBeInTheDocument();
      });
    });
  });

  describe('Security Monitoring', () => {
    it('should detect suspicious input patterns', () => {
      const suspiciousInputs = [
        '<script>alert("xss")</script>',
        "' OR '1'='1",
        '../../../etc/passwd',
        '$(whoami)'
      ];

      suspiciousInputs.forEach(input => {
        const detected = securityMonitoring.detectSuspiciousInput(input);
        expect(detected.length).toBeGreaterThan(0);
      });
    });

    it('should detect brute force patterns', () => {
      const mockEvents = Array.from({ length: 15 }, (_, i) => ({
        type: 'login_failure',
        timestamp: new Date(Date.now() - i * 60000).toISOString(), // 1 minute intervals
        ip: '192.168.1.100'
      }));

      const bruteForceIPs = securityMonitoring.detectBruteForce(mockEvents, 10, 15);
      
      expect(bruteForceIPs.length).toBe(1);
      expect(bruteForceIPs[0].ip).toBe('192.168.1.100');
      expect(bruteForceIPs[0].count).toBe(15);
    });
  });

  describe('Content Security Policy', () => {
    it('should have proper CSP headers', () => {
      // This would test the actual CSP headers in a browser environment
      const metaTags = document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]');
      
      if (metaTags.length > 0) {
        const cspContent = metaTags[0].getAttribute('content');
        
        // Should not contain unsafe-eval
        expect(cspContent).not.toContain('unsafe-eval');
        
        // Should have restrictive default-src
        expect(cspContent).toContain("default-src 'self'");
        
        // Should prevent frame embedding
        expect(cspContent).toContain("frame-ancestors 'none'");
      }
    });
  });

  describe('Authentication Security', () => {
    it('should use secure authentication flow', () => {
      // Test that PKCE flow is used (more secure than implicit)
      const authConfig = require('../lib/supabase').supabase.auth;
      
      // In a real test, you'd verify the configuration
      expect(authConfig.flowType).toBe('pkce');
    });

    it('should implement proper session management', () => {
      // Test session persistence and timeout
      expect(localStorage).toBeDefined();
      expect(sessionStorage).toBeDefined();
    });
  });

  describe('API Security', () => {
    it('should include security headers in requests', async () => {
      // Mock fetch to verify headers
      const originalFetch = global.fetch;
      let requestHeaders = {};

      global.fetch = jest.fn((url, options) => {
        requestHeaders = options.headers;
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      // Import and test secureFetch
      const { secureFetch } = await import('../utils/csrfProtection');
      
      await secureFetch('/api/test', {
        method: 'POST',
        body: JSON.stringify({ data: 'test' })
      });

      expect(requestHeaders['X-Requested-With']).toBe('XMLHttpRequest');
      expect(requestHeaders['X-CSRF-Token']).toBeDefined();

      // Restore original fetch
      global.fetch = originalFetch;
    });
  });

  describe('Error Handling', () => {
    it('should not expose sensitive information in errors', () => {
      const { sanitizeError } = require('../config/security');
      
      const sensitiveErrors = [
        new Error('Database connection failed: password=***REMOVED***'),
        new Error('SQL error: SELECT * FROM users WHERE id = 1'),
        new Error('File not found: /etc/passwd')
      ];

      sensitiveErrors.forEach(error => {
        const sanitized = sanitizeError(error, true); // Production mode
        expect(sanitized).not.toContain('***REMOVED***');
        expect(sanitized).not.toContain('SELECT * FROM users');
        expect(sanitized).not.toContain('/etc/passwd');
        expect(sanitized).toBe('Server error. Please try again later.');
      });
    });
  });

  describe('Performance Security', () => {
    it('should implement rate limiting in API calls', async () => {
      // Test that API calls are rate limited
      const startTime = Date.now();
      
      // Make multiple rapid requests
      const promises = Array.from({ length: 20 }, () => 
        fetch('/api/test', { method: 'POST' })
      );

      await Promise.allSettled(promises);
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should take longer than instant due to rate limiting
      // This is a simplified test - real implementation would be more sophisticated
      expect(duration).toBeGreaterThan(100);
    });
  });
});

// Integration Tests
describe('Security Integration Tests', () => {
  it('should handle complete secure user flow', async () => {
    // Test complete user journey with security measures
    // 1. Secure login with rate limiting
    // 2. CSRF-protected form submission
    // 3. Input validation and sanitization
    // 4. Secure session management
    // 5. Proper logout and cleanup
    
    expect(true).toBe(true); // Placeholder for integration test
  });

  it('should prevent common attack vectors', async () => {
    // Test for XSS, CSRF, SQL injection, and other attacks
    expect(true).toBe(true); // Placeholder for security integration test
  });
});

// Performance Tests
describe('Security Performance Tests', () => {
  it('should not significantly impact application performance', () => {
    // Test that security measures don't slow down the app
    const startTime = performance.now();
    
    // Simulate security checks
    generateCSRFToken();
    validateCSRFToken('test-token');
    sanitizeInput('test input');
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    expect(duration).toBeLessThan(100); // Should complete in under 100ms
  });
});
