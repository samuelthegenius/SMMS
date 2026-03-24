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
    const event = {
      type: eventType,
      severity,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      ip: await this.getClientIP(),
      userId: await this.getCurrentUserId(),
      sessionId: this.getSessionId(),
      details
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
      const { error } = await supabase.rpc('log_security_events', { events });
      
      if (error) {
        console.error('Failed to log security events:', error);
        // Re-queue events on failure
        this.eventQueue.unshift(...events);
      }
    } catch (error) {
      console.error('Security logging error:', error);
      // Re-queue events on failure
      this.eventQueue.unshift(...events);
    }
  }

  /**
   * Get recent security events for dashboard
   */
  async getRecentEvents(limit = 50) {
    try {
      const { data, error } = await supabase
        .from('security_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(limit);

      return data || [];
    } catch (error) {
      console.error('Failed to fetch security events:', error);
      return [];
    }
  }

  /**
   * Get security statistics
   */
  async getSecurityStats(timeframe = '24h') {
    try {
      const { data, error } = await supabase.rpc('get_security_stats', { timeframe });
      
      if (error) throw error;
      
      return {
        totalEvents: data.total_events || 0,
        criticalEvents: data.critical_events || 0,
        uniqueIPs: data.unique_ips || 0,
        topEventTypes: data.top_event_types || [],
        hourlyDistribution: data.hourly_distribution || []
      };
    } catch (error) {
      console.error('Failed to fetch security stats:', error);
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
      .filter(([_, count]) => count >= threshold)
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
      .filter(([_, count]) => count > avgRequests * 3)
      .map(([endpoint, count]) => ({ endpoint, count }));

    return analysis;
  },

  /**
   * Create security alert
   */
  async createAlert(type, message, severity, details = {}) {
    try {
      const { error } = await supabase
        .from('security_alerts')
        .insert({
          type,
          message,
          severity,
          details,
          created_at: new Date().toISOString(),
          resolved: false
        });

      if (error) throw error;

      // Log the alert
      await securityLogger.logEvent(
        SECURITY_EVENTS.ANOMALOUS_BEHAVIOR,
        { alertType: type, message, ...details },
        severity
      );
    } catch (error) {
      console.error('Failed to create security alert:', error);
    }
  }
};

/**
 * Initialize security monitoring
 */
export const initializeSecurityMonitoring = () => {
  // Monitor failed login attempts
  const originalConsoleError = console.error;
  console.error = (...args) => {
    // Check for login-related errors
    const message = args.join(' ');
    if (message.includes('login') || message.includes('auth')) {
      securityLogger.logEvent(
        SECURITY_EVENTS.LOGIN_FAILURE,
        { error: message },
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
        { error: event.reason.message },
        SEVERITY_LEVELS.HIGH
      );
    }
  });

  // Initialize CSRF protection
  import('./csrfProtection.js').then(({ initializeCSRFProtection }) => {
    initializeCSRFProtection();
  });
};
