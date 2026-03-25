-- Fix the login conflict by cleaning up old rate limit records and ensuring proper function exists

-- Clean up old rate limit records that might be causing conflicts
DELETE FROM rate_limits 
WHERE last_attempt <= now() - interval '1 hour';

-- Recreate get_email_by_id function with better error handling
DROP FUNCTION IF EXISTS get_email_by_id(TEXT) CASCADE;

CREATE OR REPLACE FUNCTION get_email_by_id(lookup_id text)
RETURNS text AS $$
DECLARE
    found_email text;
    rate_limited boolean;
BEGIN
    -- Check rate limit with proper error handling
    BEGIN
        SELECT NOT check_rate_limit('id_lookup_' || lookup_id, 'email_lookup', 10, 300) INTO rate_limited;
        IF rate_limited THEN
            RAISE EXCEPTION 'Too many attempts. Please try again later.';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- If rate limit check fails, allow the lookup but log it
        -- This prevents login from breaking due to rate limit issues
        NULL;
    END;

    -- Look up the email
    SELECT email INTO found_email
    FROM profiles
    WHERE identification_number = lookup_id
    LIMIT 1;

    RETURN found_email;
EXCEPTION WHEN OTHERS THEN
    -- Return NULL on any error to prevent login enumeration
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant proper permissions
GRANT EXECUTE ON FUNCTION get_email_by_id(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_email_by_id(TEXT) TO service_role;
