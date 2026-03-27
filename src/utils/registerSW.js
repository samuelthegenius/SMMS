// PWA Registration Script
// Register custom service worker for PWA functionality

let isReloading = false;

const registerSW = async () => {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });
      
      // Registration successful
      // Optional: Show a non-intrusive notification instead of forcing reload
      
      // Handle updates - notify user and skip waiting to activate new SW immediately
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New content is available - skip waiting to activate immediately
            newWorker.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });
      
      // Listen for controller change (new SW activated) - reload once to use new assets
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!isReloading) {
          isReloading = true;
          window.location.reload();
        }
      });
      
    } catch (error) {
      // SW registration failed - will be handled gracefully
      if (import.meta.env.DEV) {
        console.warn('Service worker registration failed:', error.message);
      }
    }
  }
};

// Register service worker
registerSW();
