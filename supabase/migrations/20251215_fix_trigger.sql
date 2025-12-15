-- Fix: Drop existing objects to ensure clean slate
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

-- Re-create the function with explicit public schema references
create or replace function public.handle_new_user()
returns trigger as $$
declare
  user_role public.app_role;
begin
  -- Attempt to cast the role, defaulting to 'student' if null or invalid
  begin
    user_role := (new.raw_user_meta_data->>'role')::public.app_role;
  exception when others then
    user_role := 'student'::public.app_role;
  end;

  insert into public.profiles (
    id,
    email,
    full_name,
    role,
    identification_number,
    department
  )
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    user_role,
    new.raw_user_meta_data->>'identification_number',
    new.raw_user_meta_data->>'department'
  );

  return new;
end;
$$ language plpgsql security definer;

-- Re-create the trigger
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
