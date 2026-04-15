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
    // ALWAYS prevent default to defer the browser's native banner.
    // The React component is responsible for deciding when to show the UI
    // and calling .prompt(). Skipping this causes "Banner not shown" errors.
    e.preventDefault();

    // Store the deferred prompt for later use
    window.__SMMS_DEFERRED_PROMPT__ = e;

    // Dispatch custom event so the React component knows the prompt is ready.
    // The component checks __SMMS_INSTALL_DISMISSED__ itself before showing UI.
    window.dispatchEvent(new CustomEvent('smms:installable'));
});

// Listen for app installed event
window.addEventListener('appinstalled', () => {
    window.__SMMS_DEFERRED_PROMPT__ = null;
    localStorage.removeItem('smms-install-dismissed');
});
