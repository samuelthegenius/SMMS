-- Add hostel column to tickets for specific hostel selection
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS hostel TEXT;
