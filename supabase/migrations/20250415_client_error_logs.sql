-- ============================================================
-- Migration: client_error_logs
-- Purpose  : Store client-side React errors (from ErrorBoundary)
--            so production bugs can be diagnosed without a browser.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.client_error_logs (
    id              BIGSERIAL PRIMARY KEY,
    message         TEXT        NOT NULL,
    stack           TEXT,
    component_stack TEXT,
    page_url        TEXT,
    user_agent      TEXT,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only admins (service role) can read/write — block public access
ALTER TABLE public.client_error_logs ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS so the API function can insert without auth.
-- Add a policy so admins can query logs from the dashboard if desired.
CREATE POLICY "admins_can_read_error_logs"
    ON public.client_error_logs
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin'
        )
    );

-- Auto-delete logs older than 30 days to prevent unbounded growth
-- (run this as a Supabase scheduled task / pg_cron if available)
-- SELECT cron.schedule('delete-old-error-logs', '0 3 * * *',
--   $$DELETE FROM public.client_error_logs WHERE created_at < now() - INTERVAL '30 days'$$);

-- Index for time-based queries (most recent errors first)
CREATE INDEX IF NOT EXISTS idx_client_error_logs_occurred_at
    ON public.client_error_logs (occurred_at DESC);
