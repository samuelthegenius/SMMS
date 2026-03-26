// PWA Registration Script
// Register custom service worker for PWA functionality

const registerSW = async () => {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });
      
      // Registration successful
      // Optional: Show a non-intrusive notification instead of forcing reload
      
      // Handle updates silently without forcing reload
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New content is available - notify user without forcing reload
            // Optional: Show a non-intrusive notification instead of forcing reload
          }
        });
      });
      
    } catch (error) {
      // SW registration failed - will be handled gracefully
      console.warn('Service worker registration failed:', error.message);
    }
  }
};

// Register service worker
registerSW();
