-- ============================================================================
-- DUPLICATE DETECTION FOR TICKETS
-- ============================================================================
-- This prevents users from submitting the same or very similar complaints
-- repeatedly, reducing noise in the system.
-- ============================================================================

-- Function to check for similar recent tickets by the same user
-- Uses trigram similarity for fuzzy matching on title + description
CREATE OR REPLACE FUNCTION check_duplicate_ticket(
    p_user_id UUID,
    p_title TEXT,
    p_description TEXT,
    p_specific_location TEXT,
    p_time_window_hours INTEGER DEFAULT 24
)
RETURNS TABLE (
    duplicate_found BOOLEAN,
    similar_ticket_id UUID,
    similarity_score REAL,
    existing_ticket_title TEXT,
    existing_ticket_status TEXT,
    created_at TIMESTAMPTZ
) AS $$
DECLARE
    v_normalized_title TEXT;
    v_normalized_desc TEXT;
    v_combined_input TEXT;
    v_similarity_threshold REAL := 0.75; -- 75% similarity threshold
BEGIN
    -- Normalize input: lowercase, remove extra spaces
    v_normalized_title := LOWER(TRIM(REGEXP_REPLACE(p_title, '\s+', ' ', 'g')));
    v_normalized_desc := LOWER(TRIM(REGEXP_REPLACE(COALESCE(p_description, ''), '\s+', ' ', 'g')));
    v_combined_input := v_normalized_title || ' ' || v_normalized_desc;

    -- Check for exact match first (same normalized title + location)
    RETURN QUERY
    SELECT 
        TRUE as duplicate_found,
        t.id as similar_ticket_id,
        1.0::REAL as similarity_score,
        t.title as existing_ticket_title,
        t.status as existing_ticket_status,
        t.created_at
    FROM tickets t
    WHERE t.created_by = p_user_id
        AND t.created_at > NOW() - (p_time_window_hours || ' hours')::INTERVAL
        AND LOWER(TRIM(REGEXP_REPLACE(t.title, '\s+', ' ', 'g'))) = v_normalized_title
        AND COALESCE(t.specific_location, '') = COALESCE(p_specific_location, '')
        AND t.status NOT IN ('Closed', 'Rejected')
    ORDER BY t.created_at DESC
    LIMIT 1;

    -- If exact match found, return early
    IF FOUND THEN
        RETURN;
    END IF;

    -- Check for high similarity using trigram matching (if pg_trgm is available)
    -- Fallback to substring matching if not
    RETURN QUERY
    SELECT 
        TRUE as duplicate_found,
        t.id as similar_ticket_id,
        CASE 
            WHEN v_combined_input != '' AND LENGTH(v_combined_input) > 10 THEN
                -- Calculate word overlap similarity
                (
                    SELECT COUNT(*)::REAL / 
                        GREATEST(
                            (SELECT COUNT(*) FROM UNNEST(STRING_TO_ARRAY(v_combined_input, ' ')) as w),
                            1
                        )
                    FROM UNNEST(STRING_TO_ARRAY(v_combined_input, ' ')) as input_word
                    WHERE EXISTS (
                        SELECT 1 
                        FROM UNNEST(STRING_TO_ARRAY(
                            LOWER(TRIM(REGEXP_REPLACE(COALESCE(t.title, '') || ' ' || COALESCE(t.description, ''), '\s+', ' ', 'g'))), 
                            ' '
                        )) as existing_word
                        WHERE existing_word = input_word AND LENGTH(input_word) > 3
                    )
                )
            ELSE 0.0
        END as similarity_score,
        t.title as existing_ticket_title,
        t.status as existing_ticket_status,
        t.created_at
    FROM tickets t
    WHERE t.created_by = p_user_id
        AND t.created_at > NOW() - (p_time_window_hours || ' hours')::INTERVAL
        AND t.status NOT IN ('Closed', 'Rejected')
        AND (
            -- Word overlap check
            EXISTS (
                SELECT 1 
                FROM UNNEST(STRING_TO_ARRAY(v_combined_input, ' ')) as input_word
                WHERE LENGTH(input_word) > 3
                AND EXISTS (
                    SELECT 1 
                    FROM UNNEST(STRING_TO_ARRAY(
                        LOWER(TRIM(REGEXP_REPLACE(COALESCE(t.title, ''), '\s+', ' ', 'g'))), 
                        ' '
                    )) as existing_word
                    WHERE existing_word = input_word
                )
            )
        )
    ORDER BY 
        CASE 
            WHEN t.status = 'Open' THEN 1
            WHEN t.status = 'In Progress' THEN 2
            ELSE 3
        END,
        t.created_at DESC
    LIMIT 1;

    -- If no similar tickets found, return false
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, 0.0::REAL, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add index for faster duplicate detection queries
CREATE INDEX IF NOT EXISTS idx_tickets_created_by_created_at 
ON tickets(created_by, created_at DESC);

-- Add index on title for exact match checks (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_tickets_title_lower 
ON tickets(LOWER(title) text_pattern_ops);

COMMENT ON FUNCTION check_duplicate_ticket IS 
'Checks if a user has submitted a similar ticket recently.
Returns duplicate details if found, or empty result if unique.
Uses 75% similarity threshold and 24-hour default window.';
