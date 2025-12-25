-- ==========================================
-- Real-Time Notification System Logic
-- ==========================================

-- 1. Create the Notifications Table
-- Stores all system alerts for users.
create table if not exists public.notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) not null,
  ticket_id bigint references public.tickets(id), -- Optional link to source ticket
  message text not null,
  is_read boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security
alter table public.notifications enable row level security;

-- Policy: Users can only see their own notifications
create policy "Users can view their own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

-- ==========================================
-- Master Trigger Function
-- Handles logic for INSERT (New Ticket) and UPDATE (Assignment/Status Change)
-- ==========================================
create or replace function public.handle_ticket_notifications()
returns trigger as $$
begin
  -- SCENARIO A: New Ticket Created (INSERT)
  if (TG_OP = 'INSERT') then
    -- Notify the Reporter (Student or Staff)
    insert into public.notifications (user_id, ticket_id, message)
    values (
      NEW.user_id, 
      NEW.id, 
      'Ticket Received: We have logged your report for "' || NEW.title || '".'
    );

    -- TODO: Notify Admins
    -- Logic: Insert into notifications for all users where role = 'admin'
  end if;

  -- SCENARIO B: Technician Assigned (UPDATE)
  if (TG_OP = 'UPDATE') then
    -- Condition: Assigned Technician changed from NULL (or other) to a specific user
    if (OLD.assigned_to is distinct from NEW.assigned_to) and (NEW.assigned_to is not null) then
      
      -- Notify the Technician
      insert into public.notifications (user_id, ticket_id, message)
      values (
        NEW.assigned_to, 
        NEW.id, 
        'New Assignment: You have been assigned to fix "' || NEW.title || '" at ' || NEW.specific_location || '.'
      );

      -- Notify the Reporter (Student or Staff)
      insert into public.notifications (user_id, ticket_id, message)
      values (
        NEW.user_id, 
        NEW.id, 
        'Update: A technician has been dispatched for your ticket "' || NEW.title || '".'
      );
    end if;

    -- SCENARIO C: Status Change (UPDATE)
    if (OLD.status is distinct from NEW.status) then
       insert into public.notifications (user_id, ticket_id, message)
       values (
         NEW.user_id, 
         NEW.id, 
         'Status Update: Your ticket "' || NEW.title || '" is now ' || NEW.status || '.'
       );
    end if;
  end if;

  return NEW;
end;
$$ language plpgsql security definer;

-- ==========================================
-- Trigger Definition
-- Hooks the function to the 'tickets' table
-- ==========================================
drop trigger if exists on_ticket_change on public.tickets;
create trigger on_ticket_change
  after insert or update on public.tickets
  for each row execute procedure public.handle_ticket_notifications();
