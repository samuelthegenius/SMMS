-- Migration to add QA Verification support to tickets table

-- 1. Update the status check constraint to include 'Pending Verification'
-- Note: If 'status' is an ENUM type, use: ALTER TYPE "ticket_status" ADD VALUE 'Pending Verification';
-- Assuming it's a text column with a check constraint (common in simple setups), we might need to drop and re-add the constraint.
-- Or if there's no constraint, we just document it.
-- Let's try to add the column first.

ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- If you have a check constraint on status:
-- ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
-- ALTER TABLE tickets ADD CONSTRAINT tickets_status_check 
--   CHECK (status IN ('Open', 'Assigned', 'In Progress', 'Pending Verification', 'Resolved', 'Completed', 'Closed'));

-- For this migration, we will assume standard text handling but ensuring the column exists is key.
-- We also add a comment to 'rejection_reason' for clarity.
COMMENT ON COLUMN tickets.rejection_reason IS 'Reason provided by student when rejecting a fix implementation';
