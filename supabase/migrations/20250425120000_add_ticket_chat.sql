-- ============================================================================
-- TICKET CHAT SYSTEM WITH AI ASSISTANT
-- ============================================================================

-- 1. Create ticket_messages table for per-ticket chat
CREATE TABLE IF NOT EXISTS ticket_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    sender_id uuid REFERENCES profiles(id) ON DELETE SET NULL, -- NULL for AI/system messages
    sender_type text NOT NULL CHECK (sender_type IN ('user', 'technician', 'admin', 'ai', 'system')),
    message text NOT NULL,
    message_type text DEFAULT 'text' CHECK (message_type IN ('text', 'ai_suggestion', 'status_update', 'image', 'file', 'system')),
    ai_context jsonb DEFAULT NULL, -- Stores AI context: { prompt, response_time, model_used, etc. }
    is_internal boolean DEFAULT false, -- Internal notes visible only to staff
    parent_message_id uuid REFERENCES ticket_messages(id) ON DELETE SET NULL, -- For threaded replies
    edited_at timestamptz,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT ticket_messages_pkey PRIMARY KEY (id)
);

-- 2. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_id ON ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_created_at ON ticket_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_sender ON ticket_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_internal ON ticket_messages(is_internal) WHERE is_internal = true;

-- 3. Enable RLS
ALTER TABLE ticket_messages ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies

-- Users can view messages on their own tickets
DROP POLICY IF EXISTS "Users can view messages on their tickets" ON ticket_messages;
CREATE POLICY "Users can view messages on their tickets"
    ON ticket_messages FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM tickets t
            WHERE t.id = ticket_messages.ticket_id
            AND t.created_by = auth.uid()
        )
        AND NOT is_internal -- Users cannot see internal notes
    );

-- Technicians can view messages on assigned tickets
DROP POLICY IF EXISTS "Technicians can view messages on assigned tickets" ON ticket_messages;
CREATE POLICY "Technicians can view messages on assigned tickets"
    ON ticket_messages FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM tickets t
            WHERE t.id = ticket_messages.ticket_id
            AND t.assigned_to = auth.uid()
        )
    );

-- Admins can view all messages
DROP POLICY IF EXISTS "Admins can view all messages" ON ticket_messages;
CREATE POLICY "Admins can view all messages"
    ON ticket_messages FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Users can send messages to their tickets
DROP POLICY IF EXISTS "Users can send messages to their tickets" ON ticket_messages;
CREATE POLICY "Users can send messages to their tickets"
    ON ticket_messages FOR INSERT
    TO authenticated
    WITH CHECK (
        sender_id = auth.uid()
        AND sender_type = 'user'
        AND EXISTS (
            SELECT 1 FROM tickets t
            WHERE t.id = ticket_messages.ticket_id
            AND t.created_by = auth.uid()
        )
        AND NOT is_internal -- Users cannot create internal notes
    );

-- Technicians can send messages to assigned tickets
DROP POLICY IF EXISTS "Technicians can send messages to assigned tickets" ON ticket_messages;
CREATE POLICY "Technicians can send messages to assigned tickets"
    ON ticket_messages FOR INSERT
    TO authenticated
    WITH CHECK (
        sender_id = auth.uid()
        AND sender_type = 'technician'
        AND EXISTS (
            SELECT 1 FROM tickets t
            WHERE t.id = ticket_messages.ticket_id
            AND t.assigned_to = auth.uid()
        )
    );

-- Admins can send messages to any ticket
DROP POLICY IF EXISTS "Admins can send messages to any ticket" ON ticket_messages;
CREATE POLICY "Admins can send messages to any ticket"
    ON ticket_messages FOR INSERT
    TO authenticated
    WITH CHECK (
        sender_id = auth.uid()
        AND sender_type IN ('admin', 'technician')
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Users can edit their own messages (within 5 minutes)
DROP POLICY IF EXISTS "Users can edit own messages" ON ticket_messages;
CREATE POLICY "Users can edit own messages"
    ON ticket_messages FOR UPDATE
    TO authenticated
    USING (
        sender_id = auth.uid()
        AND sender_type = 'user'
        AND created_at > now() - interval '5 minutes'
    )
    WITH CHECK (
        sender_id = auth.uid()
        AND message_type IN ('text', 'system')  -- Allow soft delete (system) or text edits
    );

-- Technicians can edit their own messages (within 5 minutes)
DROP POLICY IF EXISTS "Technicians can edit own messages" ON ticket_messages;
CREATE POLICY "Technicians can edit own messages"
    ON ticket_messages FOR UPDATE
    TO authenticated
    USING (
        sender_id = auth.uid()
        AND sender_type = 'technician'
        AND created_at > now() - interval '5 minutes'
    )
    WITH CHECK (
        sender_id = auth.uid()
        AND message_type IN ('text', 'system')
    );

-- Admins can edit/delete any message (no time limit)
DROP POLICY IF EXISTS "Admins can edit any messages" ON ticket_messages;
CREATE POLICY "Admins can edit any messages"
    ON ticket_messages FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    )
    WITH CHECK (
        message_type IN ('text', 'system')
    );

-- 5. Function to get chat messages for a ticket with user details
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
        tm.created_at,
        tm.edited_at
    FROM ticket_messages tm
    LEFT JOIN profiles p ON tm.sender_id = p.id
    WHERE tm.ticket_id = p_ticket_id
        AND (NOT tm.is_internal OR p_include_internal OR v_user_role IN ('admin', 'technician'))
    ORDER BY tm.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Function to add AI message to chat
CREATE OR REPLACE FUNCTION add_ai_message(
    p_ticket_id uuid,
    p_message text,
    p_ai_context jsonb DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
    v_message_id uuid;
BEGIN
    INSERT INTO ticket_messages (
        ticket_id,
        sender_id,
        sender_type,
        message,
        message_type,
        ai_context
    ) VALUES (
        p_ticket_id,
        NULL, -- AI has no user ID
        'ai',
        p_message,
        'ai_suggestion',
        p_ai_context
    )
    RETURNING id INTO v_message_id;
    
    RETURN v_message_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Function to notify on new chat message
CREATE OR REPLACE FUNCTION handle_chat_notifications()
RETURNS trigger AS $$
DECLARE
    v_ticket_creator uuid;
    v_ticket_assignee uuid;
    v_sender_name text;
BEGIN
    -- Get ticket participants
    SELECT created_by, assigned_to 
    INTO v_ticket_creator, v_ticket_assignee
    FROM tickets WHERE tickets.id = NEW.ticket_id;
    
    -- Get sender name
    SELECT full_name INTO v_sender_name
    FROM profiles WHERE profiles.id = NEW.sender_id;
    
    -- Notify ticket creator (if not the sender)
    IF v_ticket_creator IS NOT NULL 
       AND v_ticket_creator != NEW.sender_id 
       AND NEW.sender_type != 'ai' THEN
        INSERT INTO notifications (user_id, ticket_id, message)
        VALUES (
            v_ticket_creator,
            NEW.ticket_id,
            COALESCE(v_sender_name, 'Someone') || ' sent a message in ticket chat'
        );
    END IF;
    
    -- Notify assignee (if not the sender)
    IF v_ticket_assignee IS NOT NULL 
       AND v_ticket_assignee != NEW.sender_id 
       AND NEW.sender_type != 'ai' THEN
        INSERT INTO notifications (user_id, ticket_id, message)
        VALUES (
            v_ticket_assignee,
            NEW.ticket_id,
            COALESCE(v_sender_name, 'Someone') || ' sent a message in assigned ticket'
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Create trigger for chat notifications
DROP TRIGGER IF EXISTS on_chat_message_created ON ticket_messages;
CREATE TRIGGER on_chat_message_created
    AFTER INSERT ON ticket_messages
    FOR EACH ROW
    EXECUTE FUNCTION handle_chat_notifications();

-- 9. Function to summarize chat with AI
CREATE OR REPLACE FUNCTION summarize_ticket_chat(p_ticket_id uuid)
RETURNS jsonb AS $$
DECLARE
    v_chat_history text;
    v_summary jsonb;
BEGIN
    -- Concatenate all messages for summarization
    SELECT string_agg(
        sender_type || ': ' || message,
        E'\n' ORDER BY created_at
    )
    INTO v_chat_history
    FROM ticket_messages
    WHERE ticket_id = p_ticket_id
    AND NOT is_internal;
    
    -- Return chat history for AI processing
    RETURN jsonb_build_object(
        'ticket_id', p_ticket_id,
        'chat_history', v_chat_history,
        'message_count', (
            SELECT count(*) FROM ticket_messages 
            WHERE ticket_id = p_ticket_id AND NOT is_internal
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Update check constraint for existing tables (if 'system' not already allowed)
ALTER TABLE ticket_messages DROP CONSTRAINT IF EXISTS ticket_messages_message_type_check;
ALTER TABLE ticket_messages ADD CONSTRAINT ticket_messages_message_type_check 
    CHECK (message_type IN ('text', 'ai_suggestion', 'status_update', 'image', 'file', 'system'));

-- 11. Grant necessary permissions
GRANT EXECUTE ON FUNCTION get_ticket_chat(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION add_ai_message(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION summarize_ticket_chat(uuid) TO authenticated;
