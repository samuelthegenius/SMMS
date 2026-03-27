/**
 * Performance Audit Script
 * Run this in the browser console to identify loading bottlenecks
 */

export const runPerformanceAudit = () => {
  const results = {
    timing: {},
    resources: [],
    bundleSize: 0,
    slowResources: []
  };

  // Navigation Timing
  if (performance.getEntriesByType('navigation').length > 0) {
    const nav = performance.getEntriesByType('navigation')[0];
    results.timing = {
      dnsLookup: Math.round(nav.domainLookupEnd - nav.domainLookupStart),
      connection: Math.round(nav.connectEnd - nav.connectStart),
      ttfb: Math.round(nav.responseStart - nav.startTime),
      download: Math.round(nav.responseEnd - nav.responseStart),
      domProcessing: Math.round(nav.domComplete - nav.domInteractive),
      totalLoad: Math.round(nav.loadEventEnd - nav.startTime)
    };
  }

  // Resource Timing
  const resources = performance.getEntriesByType('resource');
  let totalSize = 0;
  
  resources.forEach(r => {
    const duration = Math.round(r.duration);
    const size = r.transferSize || 0;
    totalSize += size;
    
    if (duration > 500 || size > 100000) {
      results.slowResources.push({
        name: r.name.split('/').pop(),
        duration: duration + 'ms',
        size: Math.round(size / 1024) + 'KB',
        type: r.initiatorType
      });
    }
  });

  results.bundleSize = Math.round(totalSize / 1024) + 'KB';
  results.slowResources.sort((a, b) => parseInt(b.duration) - parseInt(a.duration));

  // Paint Timing
  const paints = performance.getEntriesByType('paint');
  paints.forEach(p => {
    results.timing[p.name] = Math.round(p.startTime) + 'ms';
  });

  console.log('🚀 PERFORMANCE AUDIT RESULTS');
  console.log('============================');
  console.log('⏱️ Timing Breakdown:');
  Object.entries(results.timing).forEach(([key, val]) => {
    const status = key === 'totalLoad' && val > 3000 ? '⚠️ SLOW' : 
                   key === 'ttfb' && val > 600 ? '⚠️ SLOW' : '✓';
    console.log(`  ${key}: ${val} ${status}`);
  });
  
  console.log(`\n📦 Total Transfer Size: ${results.bundleSize}`);
  
  if (results.slowResources.length > 0) {
    console.log('\n🐌 Slow/Large Resources:');
    results.slowResources.slice(0, 10).forEach(r => {
      console.log(`  • ${r.name} (${r.duration}, ${r.size}, ${r.type})`);
    });
  }

  // Recommendations
  console.log('\n💡 Quick Fixes:');
  if (results.timing.ttfb > 600) {
    console.log('  • TTFB is high - check server response time or enable Vercel Edge');
  }
  if (results.timing.domProcessing > 1000) {
    console.log('  • DOM processing slow - reduce JavaScript execution');
  }
  if (parseInt(results.bundleSize) > 500) {
    console.log('  • Bundle is large - check for duplicate dependencies');
  }
  if (results.slowResources.some(r => r.name.includes('framer-motion'))) {
    console.log('  • Framer Motion is loading - verify it\'s lazy-loaded');
  }
  if (results.slowResources.some(r => r.name.includes('recharts'))) {
    console.log('  • Recharts is loading - should only load on Analytics page');
  }

  return results;
};

// Auto-run after page load
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    setTimeout(() => {
      console.log('%c🔍 Run runPerformanceAudit() for detailed metrics', 'color: #f59e0b; font-size: 14px; font-weight: bold;');
    }, 1000);
  });
}
