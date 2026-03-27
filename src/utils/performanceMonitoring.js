/**
 * Performance Monitoring Utility
 * Tracks key performance metrics for optimization including Core Web Vitals
 */

// Performance metrics storage
const metrics = {
  initialLoad: null,
  authTime: null,
  routeChanges: [],
  apiCalls: [],
  webVitals: {
    CLS: null,
    FID: null,
    LCP: null,
    FCP: null,
    TTFB: null,
    INP: null
  }
};

/**
 * Initialize performance monitoring
 */
export const initPerformanceMonitoring = () => {
  // Track initial page load
  if ('navigation' in performance) {
    const navEntry = performance.getEntriesByType('navigation')[0];
    if (navEntry) {
      metrics.initialLoad = {
        domContentLoaded: navEntry.domContentLoadedEventEnd - navEntry.domContentLoadedEventStart,
        loadComplete: navEntry.loadEventEnd - navEntry.loadEventStart,
        firstPaint: performance.getEntriesByType('paint')[0]?.startTime,
        firstContentfulPaint: performance.getEntriesByType('paint')[1]?.startTime,
        ttfb: navEntry.responseStart - navEntry.startTime
      };
    }
  }

  // Track Core Web Vitals
  observeWebVitals();

  // Track route changes (excluding tab switches)
  let routeStartTime = performance.now();
  window.addEventListener('popstate', (event) => {
    // Only track if this is an actual navigation, not tab switch
    if (event.state !== null) {
      const routeEndTime = performance.now();
      metrics.routeChanges.push({
        from: window.location.pathname,
        to: document.location.pathname,
        duration: routeEndTime - routeStartTime
      });
      routeStartTime = performance.now();
    }
  });
};

/**
 * Observe Core Web Vitals
 */
const observeWebVitals = () => {
  // Largest Contentful Paint (LCP)
  if ('PerformanceObserver' in window) {
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1];
      metrics.webVitals.LCP = lastEntry.startTime;
    });
    lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
  }

  // First Input Delay (FID) - deprecated, use INP instead
  if ('PerformanceObserver' in window) {
    const fidObserver = new PerformanceObserver((list) => {
      const firstEntry = list.getEntries()[0];
      metrics.webVitals.FID = firstEntry.processingStart - firstEntry.startTime;
    });
    fidObserver.observe({ entryTypes: ['first-input'] });
  }

  // Cumulative Layout Shift (CLS)
  if ('PerformanceObserver' in window) {
    let clsValue = 0;
    const clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) {
          clsValue += entry.value;
        }
      }
      metrics.webVitals.CLS = clsValue;
    });
    clsObserver.observe({ entryTypes: ['layout-shift'] });
  }

  // First Contentful Paint (FCP)
  if ('PerformanceObserver' in window) {
    const fcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      if (entries.length > 0) {
        metrics.webVitals.FCP = entries[0].startTime;
      }
    });
    fcpObserver.observe({ entryTypes: ['paint'] });
  }

  // Time to First Byte (TTFB)
  if ('navigation' in performance) {
    const navEntry = performance.getEntriesByType('navigation')[0];
    if (navEntry) {
      metrics.webVitals.TTFB = navEntry.responseStart - navEntry.startTime;
    }
  }
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
 * Log performance warnings including Core Web Vitals
 */
export const logPerformanceWarnings = () => {
  const perfMetrics = getPerformanceMetrics();
  
  // Initial load warnings
  if (perfMetrics.initialLoad?.loadComplete > 3000) {
    if (import.meta.env.DEV) {
      console.warn('🐌 Slow initial load detected:', perfMetrics.initialLoad.loadComplete + 'ms');
    }
  }
  
  // Web Vitals warnings
  if (perfMetrics.webVitals.LCP > 2500) {
    if (import.meta.env.DEV) {
      console.warn('🎨 Slow LCP (Largest Contentful Paint):', Math.round(perfMetrics.webVitals.LCP) + 'ms - Optimize images or reduce render-blocking resources');
    }
  }
  
  if (perfMetrics.webVitals.FID > 100) {
    if (import.meta.env.DEV) {
      console.warn('👆 High FID (First Input Delay):', Math.round(perfMetrics.webVitals.FID) + 'ms - Reduce JavaScript execution time');
    }
  }
  
  if (perfMetrics.webVitals.CLS > 0.1) {
    if (import.meta.env.DEV) {
      console.warn('📐 High CLS (Cumulative Layout Shift):', perfMetrics.webVitals.CLS.toFixed(3) + ' - Add size attributes to images/videos');
    }
  }
  
  if (perfMetrics.webVitals.TTFB > 600) {
    if (import.meta.env.DEV) {
      console.warn('⏱️ High TTFB (Time to First Byte):', Math.round(perfMetrics.webVitals.TTFB) + 'ms - Optimize server response time');
    }
  }
  
  // Auth and API warnings
  if (perfMetrics.authTime > 2000) {
    if (import.meta.env.DEV) {
      console.warn('🔐 Slow authentication:', perfMetrics.authTime + 'ms');
    }
  }
  
  if (perfMetrics.avgApiTime > 500) {
    if (import.meta.env.DEV) {
      console.warn('🌐 Slow API calls average:', perfMetrics.avgApiTime + 'ms');
    }
  }
  
  if (perfMetrics.slowApiCalls > 0) {
    if (import.meta.env.DEV) {
      console.warn(`⚠️ ${perfMetrics.slowApiCalls} slow API calls (>1s) detected`);
    }
  }
  
  // Log summary in production (non-blocking)
  if (!import.meta.env.DEV && 'sendBeacon' in navigator) {
    navigator.sendBeacon('/api/analytics/performance', JSON.stringify({
      webVitals: perfMetrics.webVitals,
      initialLoad: perfMetrics.initialLoad,
      timestamp: Date.now()
    }));
  }
};
