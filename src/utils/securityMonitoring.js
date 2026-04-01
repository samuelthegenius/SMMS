/**
 * Security Monitoring and Logging System
 * Tracks security events, anomalies, and potential threats
 */

import { supabase } from '../lib/supabase';

// Security event types
export const SECURITY_EVENTS = {
  LOGIN_FAILURE: 'login_failure',
  LOGIN_SUCCESS: 'login_success',
  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
  SUSPICIOUS_INPUT: 'suspicious_input',
  XSS_ATTEMPT: 'xss_attempt',
  SQL_INJECTION_ATTEMPT: 'sql_injection_attempt',
  CSRF_FAILURE: 'csrf_failure',
  UNAUTHORIZED_ACCESS: 'unauthorized_access',
  BRUTE_FORCE_DETECTED: 'brute_force_detected',
  ANOMALOUS_BEHAVIOR: 'anomalous_behavior'
};

// Event severity levels
export const SEVERITY_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * Security event logger
 */
class SecurityLogger {
  constructor() {
    this.eventQueue = [];
    this.batchSize = 10;
    this.flushInterval = 30000; // 30 seconds
    this.isOnline = navigator.onLine;
    
    // Setup online/offline detection
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.flushQueue();
    });
    
    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
    
    // Start periodic flush
    setInterval(() => this.flushQueue(), this.flushInterval);
  }

  /**
   * Log a security event
   */
  async logEvent(eventType, details, severity = SEVERITY_LEVELS.MEDIUM) {
    // Sanitize details to prevent log injection
    const sanitizedDetails = this.sanitizeLogData(details);
    
    const event = {
      type: eventType,
      severity,
      timestamp: new Date().toISOString(),
      userAgent: this.sanitizeString(navigator.userAgent),
      url: this.sanitizeString(window.location.href),
      ip: await this.getClientIP(),
      userId: await this.getCurrentUserId(),
      sessionId: this.getSessionId(),
      details: sanitizedDetails
    };

    // Add to queue
    this.eventQueue.push(event);
    
    // Immediate flush for critical events
    if (severity === SEVERITY_LEVELS.CRITICAL) {
      await this.flushQueue();
    }
    
    // Auto-flush if queue is full
    if (this.eventQueue.length >= this.batchSize) {
      await this.flushQueue();
    }
  }

  /**
   * Sanitize log data to prevent log injection
   */
  sanitizeLogData(data) {
    if (typeof data !== 'object' || data === null) {
      return this.sanitizeString(String(data));
    }
    
    const sanitized = {};
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        sanitized[key] = this.sanitizeString(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeLogData(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  /**
   * Sanitize string for logging
   */
  sanitizeString(str) {
    if (!str) return '';
    return str
      .replace(/[\r\n]/g, '') // Remove line breaks
      .replace(/[<>]/g, '') // Remove HTML tags
      .replace(/["'\\]/g, '') // Remove quotes and backslashes
      .substring(0, 500); // Limit length
  }

  /**
   * Get client IP (using Supabase function)
   */
  async getClientIP() {
    try {
      const { data } = await supabase.rpc('get_client_ip');
      return data || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Get current user ID
   */
  async getCurrentUserId() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      return user?.id || 'anonymous';
    } catch {
      return 'anonymous';
    }
  }

  /**
   * Get or create session ID
   */
  getSessionId() {
    let sessionId = sessionStorage.getItem('security_session_id');
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      sessionStorage.setItem('security_session_id', sessionId);
    }
    return sessionId;
  }

  /**
   * Flush event queue to server
   */
  async flushQueue() {
    if (!this.isOnline || this.eventQueue.length === 0) {
      return;
    }

    const events = [...this.eventQueue];
    this.eventQueue = [];

    try {
      const { error: _error } = await supabase.rpc('log_security_events', { events });
      
      if (_error) {
        if (import.meta.env.DEV) {
          console.error('Failed to log security events:', _error);
        }
        // Re-queue events on failure
        this.eventQueue.unshift(...events);
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Security logging error:', error);
      }
      // Re-queue events on failure
      this.eventQueue.unshift(...events);
    }
  }

  /**
   * Get recent security events for dashboard
   */
  async getRecentEvents(limit = 50) {
    try {
      const { data, error: _error } = await supabase
        .from('security_logs')
        .select('*')
        .order('logged_at', { ascending: false })
        .limit(limit);

      if (_error) {
        if (import.meta.env.DEV) {
          console.error('Failed to fetch security events:', _error);
        }
      }
      return data || [];
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Failed to fetch security events:', error);
      }
      return [];
    }
  }

  /**
   * Get security statistics
   */
  async getSecurityStats(timeframe = '24h') {
    try {
      const { data, error: _error } = await supabase.rpc('get_security_stats', { timeframe });
      
      if (_error) throw _error;
      
      return {
        totalEvents: data.total_events || 0,
        criticalEvents: data.critical_events || 0,
        uniqueIPs: data.unique_ips || 0,
        topEventTypes: data.top_event_types || [],
        hourlyDistribution: data.hourly_distribution || []
      };
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Failed to fetch security stats:', error);
      }
      return {
        totalEvents: 0,
        criticalEvents: 0,
        uniqueIPs: 0,
        topEventTypes: [],
        hourlyDistribution: []
      };
    }
  }
}

// Global security logger instance
export const securityLogger = new SecurityLogger();

/**
 * Security monitoring utilities
 */
export const securityMonitoring = {
  /**
   * Detect suspicious patterns in input
   */
  detectSuspiciousInput(input) {
    const patterns = {
      xss: /<script|javascript:|on\w+\s*=|expression\(/gi,
      sql: /union\s+select|drop\s+table|insert\s+into|delete\s+from|'|"|;|--|\/\*/gi,
      path: /\.\.\/|\.\.\\|%2e%2e%2f/gi,
      command: /\$\(.*\)|`.*`|\|\|.*&&/gi
    };

    const detected = [];
    
    for (const [type, pattern] of Object.entries(patterns)) {
      if (pattern.test(input)) {
        detected.push(type);
      }
    }

    return detected;
  },

  /**
   * Monitor for brute force patterns
   */
  detectBruteForce(events, threshold = 10, windowMinutes = 15) {
    const now = new Date();
    const windowStart = new Date(now.getTime() - windowMinutes * 60 * 1000);
    
    const recentEvents = events.filter(event => 
      event.type === SECURITY_EVENTS.LOGIN_FAILURE &&
      new Date(event.timestamp) > windowStart
    );

    const ipCounts = {};
    recentEvents.forEach(event => {
      const ip = event.ip || 'unknown';
      ipCounts[ip] = (ipCounts[ip] || 0) + 1;
    });

    const suspiciousIPs = Object.entries(ipCounts)
      .filter(([count]) => count >= threshold)
      .map(([ip, count]) => ({ ip, count }));

    return suspiciousIPs;
  },

  /**
   * Analyze user behavior patterns
   */
  analyzeBehavior(events) {
    const analysis = {
      avgRequestsPerMinute: 0,
      unusualEndpoints: [],
      timeBasedAnomalies: []
    };

    if (events.length === 0) return analysis;

    // Calculate request rate
    const timeSpan = new Date(events[0].timestamp) - new Date(events[events.length - 1].timestamp);
    analysis.avgRequestsPerMinute = (events.length / timeSpan) * 60000;

    // Detect unusual endpoints
    const endpointCounts = {};
    events.forEach(event => {
      const endpoint = new URL(event.url).pathname;
      endpointCounts[endpoint] = (endpointCounts[endpoint] || 0) + 1;
    });

    const avgRequests = Object.values(endpointCounts).reduce((a, b) => a + b, 0) / Object.keys(endpointCounts).length;
    analysis.unusualEndpoints = Object.entries(endpointCounts)
      .filter(([, endpoint]) => endpoint > avgRequests * 3)
      .map(([endpoint, count]) => ({ endpoint, count }));

    return analysis;
  },

  /**
   * Create security alert
   */
  async createAlert(type, message, severity, details = {}) {
    try {
      const { error: _error } = await supabase
        .from('security_alerts')
        .insert({
          type,
          message,
          severity,
          details,
          timestamp: new Date().toISOString(),
          resolved: false
        });

      if (_error) {
        if (import.meta.env.DEV) {
          console.error('Failed to create security alert:', _error);
        }
      }

      // Log the alert
      await securityLogger.logEvent(
        SECURITY_EVENTS.ANOMALOUS_BEHAVIOR,
        { alertType: type, message, ...details },
        severity
      );
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Failed to create security alert:', error);
      }
    }
  }
};

/**
 * Initialize security monitoring
 */
/**
 * Returns true if the error message represents a transient network failure
 * (Supabase server unreachable, paused project, etc.) rather than a real
 * security event. These should never be logged as login failures.
 */
const isNetworkError = (message) => {
  const NETWORK_PATTERNS = [
    'AuthRetryableFetchError',
    'Failed to fetch',
    'ERR_CONNECTION_TIMED_OUT',
    'ERR_NETWORK_CHANGED',
    'ERR_QUIC_PROTOCOL_ERROR',
    'net::ERR_',
    'Lock "lock:', // navigator lock timeout warnings
    'was not released within',
  ];
  return NETWORK_PATTERNS.some(p => message.includes(p));
};

export const initializeSecurityMonitoring = () => {
  // Monitor failed login attempts — skip pure network/infrastructure errors
  const originalConsoleError = console.error;
  console.error = (...args) => {
    const message = args.join(' ');

    // Only log genuine auth security events, not network failures
    if (
      (message.includes('login') || message.includes('auth')) &&
      !isNetworkError(message)
    ) {
      securityLogger.logEvent(
        SECURITY_EVENTS.LOGIN_FAILURE,
        { error: message.substring(0, 200) },
        SEVERITY_LEVELS.MEDIUM
      );
    }
    
    originalConsoleError.apply(console, args);
  };

  // Monitor network failures
  window.addEventListener('unhandledrejection', (event) => {
    if (event.reason?.message?.includes('403') || event.reason?.message?.includes('unauthorized')) {
      securityLogger.logEvent(
        SECURITY_EVENTS.UNAUTHORIZED_ACCESS,
        { error: event.reason.message.substring(0, 200) },
        SEVERITY_LEVELS.HIGH
      );
    }
  });

  // Monitor for suspicious DOM manipulation (reduced sensitivity)
  const observer = new MutationObserver((mutations) => {
    const suspiciousChanges = mutations.filter(mutation => 
      mutation.type === 'childList' && 
      mutation.addedNodes.length > 50 // Increased threshold to reduce false positives
    );
    
    if (suspiciousChanges.length > 0) {
      securityLogger.logEvent(
        SECURITY_EVENTS.ANOMALOUS_BEHAVIOR,
        { 
          type: 'rapid_dom_manipulation',
          mutations: suspiciousChanges.length 
        },
        SEVERITY_LEVELS.MEDIUM // Reduced severity
      );
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    // Debounce to reduce sensitivity
    attributeFilter: ['id', 'class'] // Only monitor specific attributes
  });

  // Monitor for XSS attempts in URL
  const urlParams = new URLSearchParams(window.location.search);
  urlParams.forEach((value, key) => {
    const suspiciousPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /expression\(/i
    ];
    
    if (suspiciousPatterns.some(pattern => pattern.test(value))) {
      securityLogger.logEvent(
        SECURITY_EVENTS.XSS_ATTEMPT,
        { 
          type: 'url_parameter',
          parameter: key,
          value: value.substring(0, 100)
        },
        SEVERITY_LEVELS.CRITICAL
      );
    }
  });

  // Initialize CSRF protection
  import('./csrfProtection.js').then(({ initializeCSRFProtection }) => {
    initializeCSRFProtection();
  });
};
