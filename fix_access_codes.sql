-- ============================================================================
-- FIX ROLE ACCESS CODES TABLE
-- Run this in Supabase SQL Editor
-- ============================================================================

-- First, check what's in the table
SELECT * FROM role_access_codes;

-- Insert correct role access codes if missing
INSERT INTO role_access_codes (role, code) VALUES
    ('staff', 'MTU-STAFF-2025'),
    ('technician', 'MTU-TECH-2025')
ON CONFLICT (role) DO UPDATE SET code = EXCLUDED.code;

-- Verify
SELECT '✅ Role access codes updated!' as status;
SELECT * FROM role_access_codes;
