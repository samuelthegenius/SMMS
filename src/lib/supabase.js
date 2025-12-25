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

// Constructing the client with secure environment variables.
// VITE_ prefix exposes these variables safely to the browser bundle.
export const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY
);
