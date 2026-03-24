// PWA Registration Script
// Register custom service worker for PWA functionality

const registerSW = async () => {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });
      
      console.log('SW registered: ', registration);
      
      // Handle updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New content is available
            if (confirm('New version available. Reload to update?')) {
              window.location.reload();
            }
          }
        });
      });
      
    } catch (error) {
      console.log('SW registration failed: ', error);
    }
  }
};

// Register service worker
registerSW();
