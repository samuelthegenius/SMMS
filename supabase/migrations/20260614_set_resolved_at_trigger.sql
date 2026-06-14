-- ============================================================================
-- AUTO-SET resolved_at WHEN TICKET STATUS TRANSITIONS TO RESOLVED/CLOSED
-- ============================================================================
-- resolved_at is read by AnalyticsPage for resolution time calculations
-- but was never populated. This trigger handles it at the DB level so
-- every code path (frontend, edge functions, direct updates) is covered.
-- ============================================================================

CREATE OR REPLACE FUNCTION set_resolved_at()
RETURNS trigger AS $$
BEGIN
    -- Set resolved_at when transitioning into a terminal state
    IF NEW.status IN ('Resolved', 'Closed') AND OLD.status NOT IN ('Resolved', 'Closed') THEN
        NEW.resolved_at := NOW();
    END IF;

    -- Clear resolved_at if a ticket is re-opened (e.g., rejection sends it back to In Progress)
    IF NEW.status NOT IN ('Resolved', 'Closed') AND OLD.status IN ('Resolved', 'Closed') THEN
        NEW.resolved_at := NULL;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_resolved_at ON tickets;

CREATE TRIGGER trg_set_resolved_at
BEFORE UPDATE ON tickets
FOR EACH ROW
EXECUTE FUNCTION set_resolved_at();

COMMENT ON FUNCTION set_resolved_at IS
'Automatically sets resolved_at when a ticket reaches Resolved or Closed status,
and clears it if the ticket is re-opened. This ensures analytics resolution time
calculations are always accurate regardless of which code path updates the ticket.';
