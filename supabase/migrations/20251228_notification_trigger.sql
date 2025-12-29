-- Function to handle ticket status updates and generate notifications
create or replace function handle_ticket_updates()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Check if status has changed
  if new.status is distinct from old.status then
    
    -- Case 1: Status changed to 'Pending Verification'
    if new.status = 'Pending Verification' then
      insert into notifications (user_id, message, created_at)
      values (new.user_id, 'Technician marked ticket #' || new.id || ' as done. Please verify.', now());
    
    -- Case 2: Status changed to 'Completed'
    elsif new.status = 'Completed' then
      insert into notifications (user_id, message, created_at)
      values (new.user_id, 'Ticket #' || new.id || ' has been closed.', now());
    
    -- Case 3: Status changed to 'In Progress'
    elsif new.status = 'In Progress' then
      insert into notifications (user_id, message, created_at)
      values (new.user_id, 'Technician has started working on Ticket #' || new.id || '.', now());
      
    end if;
    
  end if;
  return new;
end;
$$;

-- Create the trigger
-- Drop if exists to avoid errors on potential re-runs
drop trigger if exists on_ticket_status_change on tickets;

create trigger on_ticket_status_change
  after update on tickets
  for each row
  execute procedure handle_ticket_updates();
