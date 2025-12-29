-- ============================================================================
-- SMMS MASTER DATABASE SCRIPT
-- ============================================================================
-- 1. CLEANUP (Destructive: Be Careful!)
-- ============================================================================
DROP TRIGGER IF EXISTS on_ticket_created ON tickets;
DROP FUNCTION IF EXISTS auto_assign_logic();
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS tickets;
DROP TABLE IF EXISTS profiles;

-- ============================================================================
-- 2. TABLE DEFINITIONS
-- ============================================================================

-- PROFILES: Extends the built-in auth.users
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) NOT NULL PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT CHECK (role IN ('student', 'staff_member', 'technician', 'admin')),
  identification_number TEXT,
  department TEXT,
  skills TEXT[], -- Array of strings (e.g., ['Electrical', 'Plumbing'])
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraint: Ensure ID is unique (PK handles this, but explicit unique doesn't hurt)
  CONSTRAINT profiles_email_key UNIQUE (email)
);

-- TICKETS: The core unit of work
CREATE TABLE tickets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID REFERENCES profiles(id) NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  facility_type TEXT,
  specific_location TEXT,
  priority TEXT DEFAULT 'Medium',
  
  -- Status flow
  status TEXT DEFAULT 'Open' CHECK (status IN ('Open', 'In Progress', 'Resolved', 'Closed')),
  
  -- Assignment (Nullable until assigned)
  assigned_to UUID REFERENCES profiles(id),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- NOTIFICATIONS: For in-app alerts (The "Bell")
CREATE TABLE notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 3. AUTO-ASSIGNMENT LOGIC (The "Fairness" Algorithm)
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_assign_logic()
RETURNS TRIGGER AS $$
DECLARE
  selected_tech_id UUID;
BEGIN
  -- A. Find the "Best" Technician
  -- Logic: Matches category AND has the lowest current workload
  SELECT id INTO selected_tech_id
  FROM profiles
  WHERE role = 'technician'
    AND NEW.category = ANY(skills) -- Checks if ticket category is in technician's skill list
  ORDER BY (
    -- Correlated Subquery: Count active tickets for this specific tech
    SELECT COUNT(*)
    FROM tickets
    WHERE assigned_to = profiles.id
      AND status = 'In Progress' -- Only count active work, not resolved/closed
  ) ASC,
  created_at ASC -- Tie-breaker: Longest serving tech gets it first (or use Random)
  LIMIT 1;

  -- B. If a suitable technician is found...
  IF selected_tech_id IS NOT NULL THEN
    -- 1. Assign the ticket
    NEW.assigned_to := selected_tech_id;
    
    -- 2. Update status immediately
    NEW.status := 'In Progress';

    -- 3. Create Internal Notification (The Bell)
    INSERT INTO notifications (user_id, message)
    VALUES (
      selected_tech_id,
      'New Task Assigned: ' || NEW.title || ' at ' || COALESCE(NEW.specific_location, 'Unknown Location')
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4. TRIGGER CONFIGURATION
-- ============================================================================

CREATE TRIGGER on_ticket_created
BEFORE INSERT ON tickets
FOR EACH ROW
EXECUTE FUNCTION auto_assign_logic();

-- ============================================================================
-- 5. ROW LEVEL SECURITY (RLS) - Basic Setup to prevent "406/Permission Denied"
-- ============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Allow everything for now (Dev Mode Permission Model)
-- In production, replace 'true' with proper auth.uid() checks
CREATE POLICY "Enable all access for all users" ON profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for all users" ON tickets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for all users" ON notifications FOR ALL USING (true) WITH CHECK (true);

-- (Optional) Grant helper for the anon/authenticated roles if RLS causes issues
GRANT ALL ON profiles TO authenticated;
GRANT ALL ON tickets TO authenticated;
GRANT ALL ON notifications TO authenticated;
GRANT ALL ON profiles TO service_role;
GRANT ALL ON tickets TO service_role;
GRANT ALL ON notifications TO service_role;
