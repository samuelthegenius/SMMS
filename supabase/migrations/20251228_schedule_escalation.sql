-- Enable necessary extensions for scheduling and network requests
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Schedule the escalation monitor to run every hour
-- Note: Replace <YOUR_PROJECT_REF> and <YOUR_ANON_KEY> with your actual Supabase project details
select
  cron.schedule(
    'escalation-monitor-hourly', -- Unique name for the job
    '0 * * * *',                 -- Cron expression: Every hour at minute 0
    $$
    select
      net.http_post(
          url:='https://ntayjobqhpbozamoxgad.supabase.co/functions/v1/escalation-monitor',
          headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_gqIz6f5QxUbP7rjpeoWXPg_bfParJJu"}'::jsonb,
          body:='{}'::jsonb
      ) as request_id;
    $$
  );
