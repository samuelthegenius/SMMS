-- Migration to add proof of fix upload
ALTER TABLE tickets ADD COLUMN resolution_proof_url text;
