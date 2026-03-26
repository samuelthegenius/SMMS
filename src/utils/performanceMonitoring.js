/**
 * Performance Monitoring Utility
 * Tracks key performance metrics for optimization
 */

// Performance metrics storage
const metrics = {
  initialLoad: null,
  authTime: null,
  routeChanges: [],
  apiCalls: []
};

/**
 * Initialize performance monitoring
 */
export const initPerformanceMonitoring = () => {
  // Track initial page load
  if ('navigation' in performance) {
    const navEntry = performance.getEntriesByType('navigation')[0];
    metrics.initialLoad = {
      domContentLoaded: navEntry.domContentLoadedEventEnd - navEntry.domContentLoadedEventStart,
      loadComplete: navEntry.loadEventEnd - navEntry.loadEventStart,
      firstPaint: performance.getEntriesByType('paint')[0]?.startTime,
      firstContentfulPaint: performance.getEntriesByType('paint')[1]?.startTime
    };
  }

  // Track route changes
  let routeStartTime = performance.now();
  window.addEventListener('popstate', () => {
    const routeEndTime = performance.now();
    metrics.routeChanges.push({
      from: window.location.pathname,
      to: document.location.pathname,
      duration: routeEndTime - routeStartTime
    });
    routeStartTime = performance.now();
  });
};

/**
 * Track authentication performance
 */
export const trackAuthTime = (startTime, endTime) => {
  metrics.authTime = endTime - startTime;
};

/**
 * Track API call performance
 */
export const trackApiCall = (url, startTime, endTime, success) => {
  metrics.apiCalls.push({
    url,
    duration: endTime - startTime,
    success,
    timestamp: Date.now()
  });

  // Keep only last 50 API calls
  if (metrics.apiCalls.length > 50) {
    metrics.apiCalls = metrics.apiCalls.slice(-50);
  }
};

/**
 * Get performance metrics
 */
export const getPerformanceMetrics = () => {
  const avgApiTime = metrics.apiCalls.length > 0 
    ? metrics.apiCalls.reduce((sum, call) => sum + call.duration, 0) / metrics.apiCalls.length 
    : 0;

  const slowApiCalls = metrics.apiCalls.filter(call => call.duration > 1000);

  return {
    ...metrics,
    avgApiTime,
    slowApiCalls: slowApiCalls.length,
    totalApiCalls: metrics.apiCalls.length
  };
};

/**
 * Log performance warnings
 */
export const logPerformanceWarnings = () => {
  const metrics = getPerformanceMetrics();
  
  if (metrics.initialLoad?.loadComplete > 3000) {
    console.warn('🐌 Slow initial load detected:', metrics.initialLoad.loadComplete + 'ms');
  }
  
  if (metrics.authTime > 2000) {
    console.warn('🔐 Slow authentication:', metrics.authTime + 'ms');
  }
  
  if (metrics.avgApiTime > 500) {
    console.warn('🌐 Slow API calls average:', metrics.avgApiTime + 'ms');
  }
  
  if (metrics.slowApiCalls > 0) {
    console.warn(`⚠️ ${metrics.slowApiCalls} slow API calls (>1s) detected`);
  }
};
