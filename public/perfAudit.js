/**
 * Performance Audit Script
 * Run this in the browser console: window.runPerformanceAudit()
 */

window.runPerformanceAudit = function() {
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

  console.log('%c🚀 PERFORMANCE AUDIT RESULTS', 'color: #f59e0b; font-size: 16px; font-weight: bold;');
  console.log('%c============================', 'color: #f59e0b;');
  console.log('%c⏱️ Timing Breakdown:', 'color: #3b82f6; font-weight: bold;');
  Object.entries(results.timing).forEach(([key, val]) => {
    const status = key === 'totalLoad' && parseInt(val) > 3000 ? '⚠️ SLOW' : 
                   key === 'ttfb' && parseInt(val) > 600 ? '⚠️ SLOW' : 
                   key === 'ttfb' && parseInt(val) < 200 ? '🚀 FAST' : '✓';
    console.log(`  ${key}: ${val} ${status}`);
  });
  
  console.log(`\n📦 Total Transfer Size: ${results.bundleSize}`);
  
  if (results.slowResources.length > 0) {
    console.log('\n%🐌 Slow/Large Resources:', 'color: #ef4444; font-weight: bold;');
    results.slowResources.slice(0, 10).forEach(r => {
      console.log(`  • ${r.name} (${r.duration}, ${r.size}, ${r.type})`);
    });
  }

  // Recommendations
  console.log('\n💡 Quick Fixes:');
  if (parseInt(results.timing.ttfb) > 600) {
    console.log('  • TTFB is high - check server response time or enable Vercel Edge');
  } else if (parseInt(results.timing.ttfb) < 300) {
    console.log('  • ✅ TTFB is good!');
  }
  if (parseInt(results.timing.domProcessing) > 1000) {
    console.log('  • DOM processing slow - reduce JavaScript execution');
  }
  if (parseInt(results.bundleSize) > 500) {
    console.log('  • Bundle is large - check for duplicate dependencies');
  } else {
    console.log('  • ✅ Bundle size is reasonable');
  }

  return results;
};

console.log('%c🔍 Performance audit ready! Run: window.runPerformanceAudit()', 'color: #10b981; font-size: 14px; font-weight: bold;');
