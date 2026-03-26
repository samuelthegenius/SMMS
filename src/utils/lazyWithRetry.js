import { lazy } from 'react';

/**
 * lazyWithRetry
 * 
 * A wrapper around React.lazy that handles "ChunkLoadError" or 404s when loading dynamic imports.
 * This commonly happens after a new deployment when the user is still on an old version of the app
 * and tries to navigate to a route whose chunk hash has changed.
 * 
 * Behavior:
 * 1. Tries to import the component.
 * 2. If it fails, checks if we've already reloaded once (to prevent loops).
 * 3. If not reloaded yet, forces a window.location.reload() to fetch the new functionality.
 * 
 * @param {Function} importFunction - The dynamic import function, e.g., () => import('./Page')
 * @param {string} name - Optional name for debugging logs.
 */
export const lazyWithRetry = (importFunction, name = 'Component') => {
    return lazy(async () => {
        const pageHasAlreadyBeenForceRefreshed = JSON.parse(
            window.sessionStorage.getItem('page-has-been-force-refreshed') || 'false'
        );

        try {
            const component = await importFunction();
            // If successful, reset the flag so future errors can trigger a reload if needed
            window.sessionStorage.setItem('page-has-been-force-refreshed', 'false');
            return component;
        } catch (error) {
            // Error loading component, will attempt recovery
            console.warn(`Failed to load ${name}:`, error.message);

            if (!pageHasAlreadyBeenForceRefreshed) {
                // Force refreshing page to recover from chunk error...
                // Set flag to prevent infinite loops
                window.sessionStorage.setItem('page-has-been-force-refreshed', 'true');
                // Reload the page to get fresh assets
                window.location.reload();
                // Return a never-resolving promise to pause rendering while reloading
                return new Promise(() => { });
            }

            // If we already reloaded and it still fails, bubble the error up (to be caught by an ErrorBoundary)
            throw error;
        }
    });
};
