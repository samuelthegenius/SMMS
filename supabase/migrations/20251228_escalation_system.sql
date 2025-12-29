-- Function to get stale high-priority tickets
-- Returns tickets that are 'High' priority, 'Open', and older than 4 hours
create or replace function get_stale_tickets()
returns setof tickets
language sql
security definer
as $$
  select *
  from tickets
  where priority = 'High'
    and status = 'Open'
    and created_at < (now() - interval '4 hours');
$$;
