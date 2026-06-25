-- Enable REPLICA IDENTITY FULL so Supabase realtime can filter UPDATE events
-- by column values. Without this, UPDATE subscriptions with column filters
-- (e.g. created_by=eq.X, ticket_id=eq.X) silently receive no events.

ALTER TABLE tickets REPLICA IDENTITY FULL;

-- ticket_messages UPDATE events (edits, soft-deletes) are filtered by ticket_id
-- in TicketChat — needs FULL identity for the same reason.
ALTER TABLE ticket_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE ticket_messages;
