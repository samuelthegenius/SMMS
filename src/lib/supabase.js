/**
 * @file src/lib/supabase.js
 * @description Centralized Supabase implementation.
 * @author System Administrator
 *
 * Architecture Note:
 * Implements the Singleton Pattern.
 * Establishes a single connection instance to the Supabase Backend-as-a-Service (BaaS).
 * This instance is reused across the entire application to maintain connection pooling efficiency.
 */
import { createClient } from '@supabase/supabase-js';

// Validate environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase configuration. Please check your .env file.');
}

// Custom fetch wrapper to handle rate limiting responses
const customFetch = async (url, options) => {
    try {
        const response = await fetch(url, options);
        
        // Check for rate limit headers (if Supabase returns them)
        const remaining = response.headers.get('X-RateLimit-Remaining');
        const reset = response.headers.get('X-RateLimit-Reset');
        
        if (response.status === 429) {
            console.warn('Rate limit exceeded. Please slow down.');
        }
        
        return response;
    } catch (error) {
        // Network errors
        if (error.message.includes('fetch')) {
            console.error('Network error: Please check your connection');
        }
        throw error;
    }
};

// Constructing the client with secure environment variables.
// VITE_ prefix exposes these variables safely to the browser bundle.
export const supabase = createClient(
    supabaseUrl,
    supabaseKey,
    {
        fetch: customFetch,
        auth: {
            // Auto-refresh tokens before expiry
            autoRefreshToken: true,
            // Persist session to localStorage
            persistSession: true,
            // Detect session changes in other tabs
            detectSessionInUrl: true,
            // Flow type for PKCE (more secure than implicit)
            flowType: 'pkce'
        },
        // Realtime options
        realtime: {
            params: {
                eventsPerSecond: 10 // Limit events to prevent abuse
            }
        }
    }
);
