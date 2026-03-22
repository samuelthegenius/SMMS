-- Enable necessary extensions for scheduling and network requests
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- IMPORTANT: Replace <YOUR_SUPABASE_URL> and <YOUR_SERVICE_ROLE_KEY> with actual values
-- Better yet, use Supabase Secrets management for the API key

-- Schedule the escalation monitor to run every hour
select
  cron.schedule(
    'escalation-monitor-hourly', -- Unique name for the job
    '0 * * * *',                 -- Cron expression: Every hour at minute 0
    $$
    select
      net.http_post(
          url:='https://ntayjobqhpbozamoxgad.supabase.co/functions/v1/escalation-monitor',
          headers:='{"Content-Type": "application/json", "Authorization": "Bearer <YOUR_SERVICE_ROLE_KEY>"}'::jsonb,
          body:='{}'::jsonb
      ) as request_id;
    $$
  );

-- SECURITY NOTE: The service role key should be stored in Supabase Secrets
-- and accessed via environment variables, not hardcoded in SQL.
-- See SECURITY.md for proper setup instructions.

