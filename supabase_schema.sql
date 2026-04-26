-- ============================================================================
-- SMMS MASTER DATABASE SCHEMA - Based on LIVE production database
-- ============================================================================
-- This schema matches your actual live database exactly
-- Run this to recreate the database from scratch
-- ============================================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- ============================================================================
-- 1. CLEANUP (if tables exist)
-- ============================================================================
DROP TRIGGER IF EXISTS on_ticket_created ON tickets;
DROP TRIGGER IF EXISTS on_ticket_change ON tickets;
DROP FUNCTION IF EXISTS auto_assign_logic();
DROP FUNCTION IF EXISTS handle_ticket_notifications();
DROP FUNCTION IF EXISTS get_email_by_id(TEXT);
DROP FUNCTION IF EXISTS register_secure_user(uuid, text, text, text, text, text, text[], text);
DROP FUNCTION IF EXISTS register_secure_user(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS check_rate_limit(TEXT, INTEGER, INTEGER);

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS tickets CASCADE;
DROP TABLE IF EXISTS technician_skills CASCADE;
DROP TABLE IF EXISTS role_access_codes CASCADE;
DROP TABLE IF EXISTS maintenance_categories CASCADE;
DROP TABLE IF EXISTS facility_types CASCADE;
DROP TABLE IF EXISTS departments CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS rate_limits CASCADE;

-- ============================================================================
-- 2. ENUMS (from your live database)
-- ============================================================================
-- Note: These already exist in Supabase from auth schema
-- We reference them but don't recreate if they exist

-- ============================================================================
-- 3. TABLE DEFINITIONS (exactly as in your live database)
-- ============================================================================

-- PROFILES: User profiles extending auth.users
CREATE TABLE profiles (
    id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email text NOT NULL,
    full_name text,
    role text NOT NULL CHECK (role IN ('student', 'staff', 'technician', 'admin')),
    identification_number text,
    department text,
    is_on_duty boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT profiles_pkey PRIMARY KEY (id),
    CONSTRAINT profiles_email_key UNIQUE (email)
);

-- DEPARTMENTS: Reference table
CREATE TABLE departments (
    name text NOT NULL,
    CONSTRAINT departments_pkey PRIMARY KEY (name)
);

-- FACILITY_TYPES: Reference table
CREATE TABLE facility_types (
    name text NOT NULL,
    CONSTRAINT facility_types_pkey PRIMARY KEY (name)
);

-- MAINTENANCE_CATEGORIES: Reference table
CREATE TABLE maintenance_categories (
    name text NOT NULL,
    CONSTRAINT maintenance_categories_pkey PRIMARY KEY (name)
);

-- ROLE_ACCESS_CODES: Security codes for role-based access
CREATE TABLE role_access_codes (
    role text NOT NULL,
    code text NOT NULL,
    CONSTRAINT role_access_codes_pkey PRIMARY KEY (role)
);

-- TECHNICIAN_SKILLS: Junction table for technician skills
CREATE TABLE technician_skills (
    profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    skill text NOT NULL,
    CONSTRAINT technician_skills_pkey PRIMARY KEY (profile_id, skill)
);

-- TICKETS: Core maintenance tickets
CREATE TABLE tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_by uuid NOT NULL REFERENCES profiles(id),
    title text NOT NULL,
    description text,
    category text,
    facility_type text,
    specific_location text,
    department text REFERENCES departments(name) ON DELETE SET NULL, -- AI-derived department assignment
    priority text DEFAULT 'Medium'::text CHECK (priority IN ('Low', 'Medium', 'High')),
    status text DEFAULT 'Open'::text CHECK (status IN ('Open', 'In Progress', 'Resolved', 'Closed', 'Escalated', 'Pending Verification')),
    assigned_to uuid REFERENCES profiles(id),
    rejection_reason text,
    image_url text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT tickets_pkey PRIMARY KEY (id)
);

-- NOTIFICATIONS: User notifications
CREATE TABLE notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    ticket_id uuid REFERENCES tickets(id) ON DELETE CASCADE,
    message text NOT NULL,
    is_read boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT notifications_pkey PRIMARY KEY (id)
);

-- RATE_LIMITS: For brute force protection
CREATE TABLE IF NOT EXISTS rate_limits (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    identifier text NOT NULL,
    action text NOT NULL,
    count integer DEFAULT 1,
    first_attempt timestamptz DEFAULT now(),
    last_attempt timestamptz DEFAULT now(),
    CONSTRAINT rate_limits_identifier_action_key UNIQUE (identifier, action)
);

-- SECURITY_EVENTS: For security monitoring and logging
CREATE TABLE IF NOT EXISTS security_events (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    event_type text NOT NULL,
    severity text DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    ip_address text,
    user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
    details jsonb DEFAULT '{}',
    event_timestamp timestamptz DEFAULT now(),
    user_agent text,
    resolved_at timestamptz,
    created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- 4. INDEXES
-- ============================================================================
CREATE INDEX idx_tickets_created_by ON tickets(created_by);
CREATE INDEX idx_tickets_assigned_to ON tickets(assigned_to);
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_department ON tickets(department);
CREATE INDEX idx_tickets_created_at ON tickets(created_at DESC);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_technician_skills_profile ON technician_skills(profile_id);
CREATE INDEX idx_security_events_timestamp ON security_events(event_timestamp DESC);
CREATE INDEX idx_security_events_type ON security_events(event_type);
CREATE INDEX idx_security_events_severity ON security_events(severity);

-- ============================================================================
-- 5. FUNCTIONS
-- ============================================================================

-- Rate limit checker
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION check_rate_limit(
    p_identifier text,
    p_action text,
    p_max_attempts integer DEFAULT 5,
    p_window_seconds integer DEFAULT 300
)
RETURNS boolean AS $$
DECLARE
    v_count integer;
BEGIN
    SELECT count INTO v_count
    FROM rate_limits
    WHERE identifier = p_identifier 
      AND action = p_action
      AND last_attempt > now() - (p_window_seconds || ' seconds')::interval;

    IF v_count IS NULL THEN
        INSERT INTO rate_limits (identifier, action, count)
        VALUES (p_identifier, p_action, 1);
        RETURN true;
    END IF;

    IF v_count >= p_max_attempts THEN
        RETURN false;
    END IF;

    UPDATE rate_limits
    SET count = count + 1, last_attempt = now()
    WHERE identifier = p_identifier AND action = p_action;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get email by ID number (for login)
CREATE OR REPLACE FUNCTION get_email_by_id(lookup_id text)
RETURNS text AS $$
DECLARE
    found_email text;
BEGIN
    IF NOT check_rate_limit('id_lookup_' || lookup_id, 'email_lookup', 10, 300) THEN
        RAISE EXCEPTION 'Too many attempts. Please try again later.';
    END IF;

    SELECT email INTO found_email
    FROM profiles
    WHERE identification_number = lookup_id
    LIMIT 1;

    RETURN found_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Validate access code publicly without exposing the code table
CREATE OR REPLACE FUNCTION validate_access_code(
    p_role text,
    p_code text
)
RETURNS boolean AS $$
DECLARE
    expected_code text;
BEGIN
    IF p_role NOT IN ('student', 'staff', 'technician', 'src', 'porter') THEN
        RETURN false;
    END IF;

    SELECT code INTO expected_code
    FROM role_access_codes
    WHERE role = p_role;

    IF expected_code IS NULL THEN RETURN false; END IF;
    RETURN p_code = expected_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup orphaned auth users
CREATE OR REPLACE FUNCTION cleanup_orphaned_auth_user(
    p_email text
)
RETURNS void AS $$
BEGIN
    DELETE FROM auth.users
    WHERE email = p_email
    AND NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.users.id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Secure user registration
CREATE OR REPLACE FUNCTION register_secure_user(
    p_id uuid,
    p_email text,
    p_full_name text,
    p_role text,
    p_id_number text,
    p_department text,
    p_skills text[],
    p_access_code text
)
RETURNS boolean AS $$
DECLARE
    expected_code text;
BEGIN
    -- Rate limit
    IF NOT check_rate_limit('signup_' || p_email, 'signup', 3, 900) THEN
        RAISE EXCEPTION 'Too many signup attempts. Please try again later.';
    END IF;

    -- Validate role (explicitly prevent admin registration through public API)
    IF p_role NOT IN ('student', 'staff', 'technician', 'src', 'porter') THEN
        RAISE EXCEPTION 'Role % registration is not permitted', p_role;
    END IF;

    -- Check access code for ALL allowed roles
    SELECT code INTO expected_code
    FROM role_access_codes
    WHERE role = p_role;

    IF expected_code IS NULL OR p_access_code IS NULL OR p_access_code <> expected_code THEN
        RAISE EXCEPTION 'Invalid access code';
    END IF;

    -- Check for duplicate ID number
    IF EXISTS (SELECT 1 FROM profiles WHERE identification_number = p_id_number) THEN
        RAISE EXCEPTION 'Identification number already registered';
    END IF;

    -- Insert or update profile
    INSERT INTO profiles (id, email, full_name, role, identification_number, department)
    VALUES (p_id, p_email, p_full_name, p_role, p_id_number, p_department)
    ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        identification_number = EXCLUDED.identification_number,
        department = EXCLUDED.department;

    -- Insert skills if provided
    IF p_skills IS NOT NULL AND array_length(p_skills, 1) > 0 THEN
        INSERT INTO technician_skills (profile_id, skill)
        SELECT p_id, unnest(p_skills)
        ON CONFLICT (profile_id, skill) DO NOTHING;
    END IF;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-assign technician to ticket
CREATE OR REPLACE FUNCTION auto_assign_logic()
RETURNS trigger AS $$
DECLARE
    selected_tech_id uuid;
BEGIN
    IF NEW.assigned_to IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Find technician with matching skill and lowest workload
    SELECT id INTO selected_tech_id
    FROM profiles p
    WHERE p.role = 'technician'
      AND (NEW.category = ANY(
            SELECT skill FROM technician_skills WHERE profile_id = p.id
          ))
    ORDER BY (
        SELECT COUNT(*)
        FROM tickets t
        WHERE t.assigned_to = p.id
          AND t.status IN ('Open', 'Assigned', 'In Progress', 'Pending Verification')
    ) ASC
    LIMIT 1;

    IF selected_tech_id IS NOT NULL THEN
        NEW.assigned_to := selected_tech_id;
        NEW.status := 'Assigned';

        INSERT INTO notifications (user_id, ticket_id, message)
        VALUES (
            selected_tech_id,
            NEW.id,
            'New Task Assigned: ' || NEW.title || ' at ' || COALESCE(NEW.specific_location, 'Unknown')
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Handle ticket notifications
CREATE OR REPLACE FUNCTION handle_ticket_notifications()
RETURNS trigger AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        -- Notify creator
        INSERT INTO notifications (user_id, ticket_id, message)
        VALUES (NEW.created_by, NEW.id, 'Ticket Received: ' || NEW.title);

    ELSIF (TG_OP = 'UPDATE') THEN
        -- Technician assigned
        IF (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) AND NEW.assigned_to IS NOT NULL THEN
            INSERT INTO notifications (user_id, ticket_id, message)
            VALUES (
                NEW.assigned_to,
                NEW.id,
                'New Assignment: ' || NEW.title
            );
            INSERT INTO notifications (user_id, ticket_id, message)
            VALUES (
                NEW.created_by,
                NEW.id,
                'Technician assigned to your ticket'
            );
        END IF;

        -- Status changed
        IF OLD.status IS DISTINCT FROM NEW.status THEN
            INSERT INTO notifications (user_id, ticket_id, message)
            VALUES (
                NEW.created_by,
                NEW.id,
                'Status Update: ' || NEW.status
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get security metrics for dashboard
CREATE OR REPLACE FUNCTION get_security_metrics()
RETURNS TABLE (
    total_events bigint,
    failed_logins bigint,
    suspicious_activities bigint,
    unique_ips bigint,
    active_alerts bigint
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (SELECT COUNT(*)::bigint 
         FROM security_events 
         WHERE event_timestamp > NOW() - INTERVAL '24 hours') as total_events,
        (SELECT COUNT(*)::bigint 
         FROM security_events 
         WHERE event_type = 'login_failure' 
           AND event_timestamp > NOW() - INTERVAL '24 hours') as failed_logins,
        (SELECT COUNT(*)::bigint 
         FROM security_events 
         WHERE severity IN ('high', 'critical')
           AND event_timestamp > NOW() - INTERVAL '24 hours') as suspicious_activities,
        (SELECT COUNT(DISTINCT ip_address)::bigint 
         FROM security_events 
         WHERE event_timestamp > NOW() - INTERVAL '24 hours') as unique_ips,
        (SELECT COUNT(*)::bigint 
         FROM security_events 
         WHERE severity IN ('high', 'critical')
           AND (resolved_at IS NULL OR resolved_at > NOW() - INTERVAL '24 hours')) as active_alerts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get security events for dashboard
CREATE OR REPLACE FUNCTION get_security_events_dashboard(limit_count integer DEFAULT 20)
RETURNS TABLE (
    id uuid,
    event_type text,
    severity text,
    ip_address text,
    details jsonb,
    event_timestamp timestamptz,
    user_agent text
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        se.id,
        se.event_type,
        se.severity,
        se.ip_address,
        se.details,
        se.event_timestamp,
        se.user_agent
    FROM security_events se
    WHERE se.event_timestamp > NOW() - INTERVAL '24 hours'
    ORDER BY se.event_timestamp DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 6. TRIGGERS
-- ============================================================================
CREATE TRIGGER on_ticket_created
    BEFORE INSERT ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION auto_assign_logic();

CREATE TRIGGER on_ticket_change
    AFTER INSERT OR UPDATE ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION handle_ticket_notifications();

-- Auto-assign technician when porter verifies a ticket (updates from Open to In Progress)
CREATE OR REPLACE FUNCTION auto_assign_on_verification()
RETURNS trigger AS $$
DECLARE
    selected_tech_id uuid;
BEGIN
    -- Only run when status changes from Open to In Progress and no technician assigned
    IF OLD.status = 'Open' AND NEW.status = 'In Progress' AND NEW.assigned_to IS NULL THEN
        -- Find technician with matching skill and lowest workload
        SELECT id INTO selected_tech_id
        FROM profiles p
        WHERE p.role = 'technician'
          AND (NEW.category = ANY(
                SELECT skill FROM technician_skills WHERE profile_id = p.id
              ))
        ORDER BY (
            SELECT COUNT(*)
            FROM tickets t
            WHERE t.assigned_to = p.id
              AND t.status IN ('Open', 'Assigned', 'In Progress', 'Pending Verification')
        ) ASC
        LIMIT 1;

        IF selected_tech_id IS NOT NULL THEN
            NEW.assigned_to := selected_tech_id;
            NEW.status := 'Assigned';

            INSERT INTO notifications (user_id, ticket_id, message)
            VALUES (
                selected_tech_id,
                NEW.id,
                'New Task Assigned: ' || NEW.title || ' at ' || COALESCE(NEW.specific_location, 'Unknown')
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_ticket_verified
    BEFORE UPDATE ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION auto_assign_on_verification();

CREATE OR REPLACE FUNCTION enforce_ticket_update_rules()
RETURNS trigger AS $$
DECLARE
    v_user_role text;
    v_uid uuid := auth.uid();
BEGIN
    IF v_uid IS NULL THEN RETURN NEW; END IF;
    SELECT role INTO v_user_role FROM profiles WHERE id = v_uid;
    IF v_user_role = 'admin' THEN RETURN NEW; END IF;

    IF OLD.created_by = v_uid AND v_user_role IN ('student', 'staff') THEN
        IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
            RAISE EXCEPTION 'Creators cannot reassign tickets.';
        END IF;
        IF NEW.status IS DISTINCT FROM OLD.status THEN
            IF NOT (OLD.status = 'Pending Verification' AND NEW.status IN ('Resolved', 'In Progress', 'Open')) THEN
                RAISE EXCEPTION 'Creators cannot arbitrarily change ticket status.';
            END IF;
        END IF;
    END IF;

    IF OLD.assigned_to = v_uid AND v_user_role = 'technician' THEN
        IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
            RAISE EXCEPTION 'Technicians cannot change the ticket creator.';
        END IF;
        IF NEW.title IS DISTINCT FROM OLD.title THEN
            RAISE EXCEPTION 'Technicians cannot change the ticket title.';
        END IF;
        IF NEW.description IS DISTINCT FROM OLD.description THEN
            RAISE EXCEPTION 'Technicians cannot change the ticket description.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER enforce_ticket_rules
    BEFORE UPDATE ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION enforce_ticket_update_rules();

-- ============================================================================
-- 7. ROW LEVEL SECURITY (RLS)
-- ============================================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE facility_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_access_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE technician_skills ENABLE ROW LEVEL SECURITY;

-- PROFILES policies
CREATE POLICY "Strict profile visibility"
    ON profiles FOR SELECT
    TO authenticated
    USING (
        id = auth.uid() 
        OR is_admin()
        OR id IN (
            SELECT assigned_to FROM tickets 
            WHERE created_by = auth.uid() AND assigned_to IS NOT NULL
        )
        OR id IN (
            SELECT created_by FROM tickets 
            WHERE assigned_to = auth.uid()
        )
    );

CREATE POLICY "Users can insert own profile"
    ON profiles FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (
        auth.uid() = id AND
        email = OLD.email AND
        role = OLD.role AND
        identification_number = OLD.identification_number
    );

CREATE POLICY "Admins can update all profiles"
    ON profiles FOR UPDATE
    TO authenticated
    USING (is_admin());

-- TICKETS policies
CREATE POLICY "Users can view own tickets"
    ON tickets FOR SELECT
    TO authenticated
    USING (created_by = auth.uid());

CREATE POLICY "Technicians can view assigned tickets"
    ON tickets FOR SELECT
    TO authenticated
    USING (assigned_to = auth.uid());

CREATE POLICY "Admins can view all tickets"
    ON tickets FOR SELECT
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'admin'
    ));

CREATE POLICY "Users can create tickets"
    ON tickets FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Creators can update own tickets"
    ON tickets FOR UPDATE
    TO authenticated
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());

CREATE POLICY "Technicians can update assigned tickets"
    ON tickets FOR UPDATE
    TO authenticated
    USING (assigned_to = auth.uid())
    WITH CHECK (assigned_to = auth.uid());

CREATE POLICY "Admins have full access to tickets"
    ON tickets FOR ALL
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'admin'
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'admin'
    ));

-- SRC can view all tickets (to identify patterns and escalate issues)
CREATE POLICY "SRC can view all tickets"
    ON tickets FOR SELECT
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'src'
    ));

-- SRC can escalate tickets (update priority/status)
CREATE POLICY "SRC can escalate tickets"
    ON tickets FOR UPDATE
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'src'
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'src'
    ));

-- Porters can view all hostel-related tickets
CREATE POLICY "Porters can view hostel tickets"
    ON tickets FOR SELECT
    TO authenticated
    USING (
        facility_type = 'Hostel'
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'porter'
        )
    );

-- Porters can self-assign and update hostel tickets
CREATE POLICY "Porters can update hostel tickets"
    ON tickets FOR UPDATE
    TO authenticated
    USING (
        facility_type = 'Hostel'
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'porter'
        )
    )
    WITH CHECK (
        facility_type = 'Hostel'
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'porter'
        )
    );

-- NOTIFICATIONS policies
CREATE POLICY "Users can view own notifications"
    ON notifications FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
    ON notifications FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- RATE LIMITS: No user access (system only)

-- DEPARTMENTS: Public read, admin write
CREATE POLICY "Departments viewable by all"
    ON departments FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Departments manageable by admins"
    ON departments FOR ALL
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'admin'
    ));

-- FACILITY_TYPES: Public read, admin write
CREATE POLICY "Facility types viewable by all"
    ON facility_types FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Facility types manageable by admins"
    ON facility_types FOR ALL
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'admin'
    ));

-- MAINTENANCE_CATEGORIES: Public read, admin write
CREATE POLICY "Categories viewable by all"
    ON maintenance_categories FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Categories manageable by admins"
    ON maintenance_categories FOR ALL
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'admin'
    ));

-- ROLE_ACCESS_CODES: Admin only (SECURITY CRITICAL)
CREATE POLICY "Access codes viewable by admins"
    ON role_access_codes FOR SELECT
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'admin'
    ));

CREATE POLICY "Access codes manageable by admins"
    ON role_access_codes FOR ALL
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'admin'
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'admin'
    ));

-- TECHNICIAN_SKILLS: View all, manage own
CREATE POLICY "Skills viewable by all"
    ON technician_skills FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Users can insert own skills"
    ON technician_skills FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = profile_id OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Users can delete own skills"
    ON technician_skills FOR DELETE
    TO authenticated
    USING (
        auth.uid() = profile_id OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- SECURITY_EVENTS: Admin only
CREATE POLICY "Security events viewable by admins only"
    ON security_events FOR SELECT
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'admin'
    ));

-- ============================================================================
-- 8. SEED DATA
-- ============================================================================
-- Insert default departments
INSERT INTO departments (name) VALUES
    ('Works Department'),
    ('Administration'),
    ('Academic'),
    ('Student Affairs')
ON CONFLICT (name) DO NOTHING;

-- Insert default facility types
INSERT INTO facility_types (name) VALUES
    ('Hostel'),
    ('Lecture Hall'),
    ('Laboratory'),
    ('Office'),
    ('Sports Complex'),
    ('Chapel'),
    ('Other')
ON CONFLICT (name) DO NOTHING;

-- Insert default maintenance categories
INSERT INTO maintenance_categories (name) VALUES
    ('Electrical'),
    ('Plumbing'),
    ('HVAC (Air Conditioning)'),
    ('Carpentry & Furniture'),
    ('IT & Networking'),
    ('General Maintenance'),
    ('Painting'),
    ('Civil Works'),
    ('Appliance Repair'),
    ('Cleaning Services')
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
