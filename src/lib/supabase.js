/**
 * @file src/lib/supabase.js
 * @description Centralized Supabase implementation with lazy initialization.
 */
import { createClient } from '@supabase/supabase-js';

// Validate environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

if (!supabaseUrl || !supabaseKey) {
    if (import.meta.env.DEV) {
        console.error('Missing Supabase configuration. Please check your .env file.');
    }
}

// Lazy initialization - client created only when first accessed
let supabaseInstance = null;

const getSupabaseClient = () => {
    if (supabaseInstance) return supabaseInstance;
    
    // Custom fetch wrapper to handle rate limiting
    const customFetch = async (url, options) => {
        try {
            const response = await fetch(url, options);
            if (response.status === 429 && import.meta.env.DEV) {
                console.warn('Rate limit exceeded. Please slow down.');
            }
            return response;
        } catch (error) {
            if (import.meta.env.DEV && error.message.includes('fetch')) {
                console.error('Network error: Please check your connection');
            }
            throw error;
        }
    };
    
    supabaseInstance = createClient(
        supabaseUrl,
        supabaseKey,
        {
            fetch: customFetch,
            auth: {
                autoRefreshToken: true,
                persistSession: true,
                detectSessionInUrl: true,
                flowType: 'pkce',
                // Storage key to avoid conflicts
                storageKey: 'smms-auth-token'
            },
            realtime: {
                params: { eventsPerSecond: 10 }
            },
            // Disable realtime by default - enable only when needed
            db: {
                schema: 'public'
            }
        }
    );
    
    return supabaseInstance;
};

// Export singleton instance
export const supabase = getSupabaseClient();
