-- The 2026-06-25 migration (20260625_enable_realtime_replica_identity.sql) set
-- REPLICA IDENTITY FULL on `tickets` and added `ticket_messages` to the
-- supabase_realtime publication, but never actually added `tickets` itself
-- to the publication. Without that, the frontend's postgres_changes
-- subscriptions on `tickets` (UserDashboard, TechnicianDashboard,
-- ManagerDashboard, AdminDashboard) receive no events at all, regardless of
-- REPLICA IDENTITY — clients only see live updates after a manual refresh.
--
-- `notifications` (subscribed to in NotificationBell.jsx) has the same gap.
--
-- ALTER PUBLICATION ... ADD TABLE errors if the table is already a member,
-- so guard each addition with a check against pg_publication_tables to keep
-- this migration safe to run regardless of how the publication was set up
-- previously (e.g. manually via the Supabase dashboard).

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'tickets'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE tickets;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'notifications'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
    END IF;
END $$;
