-- ============================================================================
-- MASTER BUGFIXES: Duplicate Detection & Auto-Assign 409 Conflict
-- ============================================================================

-- 1. FIX 400 BAD REQUEST in check_duplicate_ticket
-- The division returned double precision instead of real, causing a type mismatch.
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
BEGIN
    v_normalized_title := LOWER(TRIM(REGEXP_REPLACE(p_title, '\s+', ' ', 'g')));
    v_normalized_desc := LOWER(TRIM(REGEXP_REPLACE(COALESCE(p_description, ''), '\s+', ' ', 'g')));
    v_combined_input := v_normalized_title || ' ' || v_normalized_desc;

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

    IF FOUND THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT 
        TRUE as duplicate_found,
        t.id as similar_ticket_id,
        (CASE 
            WHEN v_combined_input != '' AND LENGTH(v_combined_input) > 10 THEN
                (
                    SELECT COUNT(*)::REAL / 
                        GREATEST(
                            (SELECT COUNT(*) FROM UNNEST(STRING_TO_ARRAY(v_combined_input, ' ')) as w),
                            1
                        )::REAL
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
        END)::REAL as similarity_score,
        t.title as existing_ticket_title,
        t.status as existing_ticket_status,
        t.created_at
    FROM tickets t
    WHERE t.created_by = p_user_id
        AND t.created_at > NOW() - (p_time_window_hours || ' hours')::INTERVAL
        AND t.status NOT IN ('Closed', 'Rejected')
        AND (
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

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, 0.0::REAL, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. FIX 409 CONFLICT in ticket creation
-- Remove notification insertions from BEFORE triggers to avoid FK violations.
CREATE OR REPLACE FUNCTION auto_assign_logic()
RETURNS trigger AS $$
DECLARE
    selected_tech_id uuid;
BEGIN
    IF NEW.assigned_to IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT id INTO selected_tech_id
    FROM profiles p
    WHERE p.role = 'technician'
      AND p.is_on_duty = true
      AND (NEW.category = ANY(SELECT skill FROM technician_skills WHERE profile_id = p.id))
      AND (NEW.department IS NULL OR p.department = NEW.department OR p.department IS NULL)
    ORDER BY (
        SELECT COUNT(*) FROM tickets t
        WHERE t.assigned_to = p.id AND t.status IN ('Open', 'In Progress', 'Pending Verification')
    ) ASC LIMIT 1;

    IF selected_tech_id IS NULL THEN
        SELECT id INTO selected_tech_id
        FROM profiles p
        WHERE p.role = 'technician' AND p.is_on_duty = true
          AND (NEW.category = ANY(SELECT skill FROM technician_skills WHERE profile_id = p.id))
        ORDER BY (
            SELECT COUNT(*) FROM tickets t
            WHERE t.assigned_to = p.id AND t.status IN ('Open', 'In Progress', 'Pending Verification')
        ) ASC LIMIT 1;
    END IF;

    IF selected_tech_id IS NOT NULL THEN
        NEW.assigned_to := selected_tech_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION auto_assign_on_verification()
RETURNS trigger AS $$
DECLARE
    selected_tech_id uuid;
BEGIN
    IF OLD.status = 'Open' AND NEW.status = 'In Progress' AND NEW.assigned_to IS NULL THEN
        SELECT id INTO selected_tech_id
        FROM profiles p
        WHERE p.role = 'technician'
          AND (NEW.category = ANY(SELECT skill FROM technician_skills WHERE profile_id = p.id))
        ORDER BY (
            SELECT COUNT(*) FROM tickets t
            WHERE t.assigned_to = p.id AND t.status IN ('Open', 'In Progress', 'Pending Verification')
        ) ASC LIMIT 1;

        IF selected_tech_id IS NOT NULL THEN
            NEW.assigned_to := selected_tech_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION handle_ticket_notifications()
RETURNS trigger AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO notifications (user_id, ticket_id, message)
        VALUES (NEW.created_by, NEW.id, 'Ticket Received: ' || NEW.title);

        IF NEW.assigned_to IS NOT NULL THEN
            INSERT INTO notifications (user_id, ticket_id, message)
            VALUES (
                NEW.assigned_to, NEW.id,
                'New Task Assigned: ' || NEW.title || ' at ' || COALESCE(NEW.specific_location, 'Unknown') || 
                CASE WHEN NEW.department IS NOT NULL THEN ' [' || NEW.department || ']' ELSE '' END
            );
        END IF;

    ELSIF (TG_OP = 'UPDATE') THEN
        IF (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) AND NEW.assigned_to IS NOT NULL THEN
            INSERT INTO notifications (user_id, ticket_id, message)
            VALUES (
                NEW.assigned_to, NEW.id,
                'New Assignment: ' || NEW.title || ' at ' || COALESCE(NEW.specific_location, 'Unknown') || 
                CASE WHEN NEW.department IS NOT NULL THEN ' [' || NEW.department || ']' ELSE '' END
            );
            INSERT INTO notifications (user_id, ticket_id, message)
            VALUES (NEW.created_by, NEW.id, 'Technician assigned to your ticket');
        END IF;

        IF OLD.status IS DISTINCT FROM NEW.status THEN
            INSERT INTO notifications (user_id, ticket_id, message)
            VALUES (NEW.created_by, NEW.id, 'Status Update: ' || NEW.status);
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
