-- ============================================================================
-- SOFT DELETE SUPPORT FOR TICKET MESSAGES
-- ============================================================================

-- 1. Add soft delete columns to ticket_messages table
ALTER TABLE ticket_messages 
    ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);

-- 2. Add index for querying deleted messages efficiently
CREATE INDEX IF NOT EXISTS idx_ticket_messages_deleted ON ticket_messages(is_deleted) WHERE is_deleted = TRUE;
CREATE INDEX IF NOT EXISTS idx_ticket_messages_deleted_at ON ticket_messages(deleted_at);

-- 3. Update the get_ticket_chat function to include soft-delete info
-- Drop first to allow return type change
DROP FUNCTION IF EXISTS get_ticket_chat(uuid, boolean);

CREATE OR REPLACE FUNCTION get_ticket_chat(
    p_ticket_id uuid,
    p_include_internal boolean DEFAULT false
)
RETURNS TABLE (
    id uuid,
    ticket_id uuid,
    sender_id uuid,
    sender_type text,
    sender_name text,
    sender_role text,
    message text,
    message_type text,
    ai_context jsonb,
    is_internal boolean,
    is_deleted boolean,
    deleted_at timestamptz,
    deleted_by uuid,
    created_at timestamptz,
    edited_at timestamptz
) AS $$
DECLARE
    v_user_role text;
    v_user_id uuid := auth.uid();
BEGIN
    -- Get current user's role
    SELECT role INTO v_user_role FROM profiles WHERE profiles.id = v_user_id;
    
    -- Only admins and technicians can see internal messages
    IF NOT p_include_internal AND v_user_role NOT IN ('admin', 'technician') THEN
        p_include_internal := false;
    END IF;

    RETURN QUERY
    SELECT 
        tm.id,
        tm.ticket_id,
        tm.sender_id,
        tm.sender_type,
        COALESCE(p.full_name, 
            CASE tm.sender_type 
                WHEN 'ai' THEN 'AI Assistant'
                WHEN 'system' THEN 'System'
                ELSE 'Unknown'
            END
        ) as sender_name,
        COALESCE(p.role, tm.sender_type) as sender_role,
        tm.message,
        tm.message_type,
        tm.ai_context,
        tm.is_internal,
        tm.is_deleted,
        tm.deleted_at,
        tm.deleted_by,
        tm.created_at,
        tm.edited_at
    FROM ticket_messages tm
    LEFT JOIN profiles p ON tm.sender_id = p.id
    WHERE tm.ticket_id = p_ticket_id
        AND (NOT tm.is_internal OR p_include_internal OR v_user_role IN ('admin', 'technician'))
    ORDER BY tm.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Update summarize_ticket_chat to exclude deleted messages
CREATE OR REPLACE FUNCTION summarize_ticket_chat(p_ticket_id uuid)
RETURNS jsonb AS $$
DECLARE
    v_chat_history text;
    v_summary jsonb;
BEGIN
    -- Concatenate all non-deleted, non-internal messages for summarization
    SELECT string_agg(
        sender_type || ': ' || message,
        E'\n' ORDER BY created_at
    )
    INTO v_chat_history
    FROM ticket_messages
    WHERE ticket_id = p_ticket_id
    AND NOT is_internal
    AND NOT is_deleted;
    
    -- Return chat history for AI processing
    RETURN jsonb_build_object(
        'ticket_id', p_ticket_id,
        'chat_history', v_chat_history,
        'message_count', (
            SELECT count(*) FROM ticket_messages 
            WHERE ticket_id = p_ticket_id AND NOT is_internal AND NOT is_deleted
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Grant execute permissions
GRANT EXECUTE ON FUNCTION get_ticket_chat(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION summarize_ticket_chat(uuid) TO authenticated;
