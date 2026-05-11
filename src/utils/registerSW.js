// PWA Registration Script
// Register custom service worker for PWA functionality

let updateToastShown = false;

const registerSW = async () => {
  if ('serviceWorker' in navigator) {
    // Disable SW in development to prevent module caching conflicts
    if (import.meta.env.DEV) {
      navigator.serviceWorker.getRegistrations().then(regs => {
        for (let reg of regs) reg.unregister();
      });
      return;
    }
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });

      // Handle updates - show user-controlled update prompt instead of auto-reload
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          // New service worker installed and waiting
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            if (!updateToastShown) {
              updateToastShown = true;
              // Dispatch custom event for the app to show update toast
              window.dispatchEvent(new CustomEvent('sw:update-available', {
                detail: {
                  registration,
                  newWorker,
                  applyUpdate: () => {
                    newWorker.postMessage({ type: 'SKIP_WAITING' });
                  }
                }
              }));
            }
          }
        });
      });

    } catch {
      // SW registration failed - will be handled gracefully
    }
  }
};

// Register service worker
registerSW();
