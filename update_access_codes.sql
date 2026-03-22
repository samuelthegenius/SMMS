-- Update access codes to practical secure values
-- Run this in Supabase SQL Editor

-- Use shorter, memorable but secure codes (8-12 characters)
UPDATE role_access_codes SET code = 'MTUSTAFF2025' WHERE role = 'staff_member';
UPDATE role_access_codes SET code = 'MTUTECH2025' WHERE role = 'technician';

-- Alternative: Use department codes + year
-- UPDATE role_access_codes SET code = 'WORKS2025' WHERE role = 'staff_member';
-- UPDATE role_access_codes SET code = 'TECH2025' WHERE role = 'technician';

-- Alternative: Simple random but short codes
-- UPDATE role_access_codes SET code = 'K7X9M2P4' WHERE role = 'staff_member';
-- UPDATE role_access_codes SET code = 'Q5W8R3T6' WHERE role = 'technician';

-- Verify the update
SELECT role, code FROM role_access_codes;
