/**
 * Global PWA Install Handler
 * Captures beforeinstallprompt immediately on page load, before React mounts.
 * This ensures we never miss the event in production builds.
 */

// Store the deferred prompt globally
window.__SMMS_DEFERRED_PROMPT__ = null;
window.__SMMS_INSTALL_DISMISSED__ = localStorage.getItem('smms-install-dismissed') === 'true';

// Capture the event immediately when it fires
window.addEventListener('beforeinstallprompt', (e) => {
    // Store it first
    window.__SMMS_DEFERRED_PROMPT__ = e;
    
    // Only prevent default if user hasn't dismissed before
    if (!window.__SMMS_INSTALL_DISMISSED__) {
        e.preventDefault();
        // Dispatch custom event so React component knows it's ready
        window.dispatchEvent(new CustomEvent('smms:installable'));
    }
});

// Listen for app installed event
window.addEventListener('appinstalled', () => {
    window.__SMMS_DEFERRED_PROMPT__ = null;
    localStorage.removeItem('smms-install-dismissed');
});
