-- Create a table to securely track Telegram user authentication
create table if not exists public.telegram_users (
  id uuid primary key default uuid_generate_v4(),
  telegram_id text not null unique,
  user_id uuid references public.profiles(id),
  is_verified boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  verification_code text,
  verification_expires_at timestamp with time zone
);

-- Add RLS policies
alter table public.telegram_users enable row level security;

-- Allow users to read their own Telegram associations
create policy "Users can view their own Telegram associations"
  on public.telegram_users for select
  using (auth.uid() = user_id);

-- Allow the service role to manage all rows
create policy "Service role can manage all Telegram users"
  on public.telegram_users
  using (
    exists (
      select 1 from public.profiles 
      where id = auth.uid() and role = 'admin'
    )
  );

-- Add function to link Telegram user to existing account
create or replace function public.link_telegram_account(
  p_telegram_id text,
  p_user_id uuid,
  p_verification_required boolean default true
)
returns uuid
language plpgsql security definer
as $$
declare
  v_id uuid;
  v_verification_code text;
begin
  -- Generate verification code if required
  if p_verification_required then
    v_verification_code := floor(random() * 900000 + 100000)::text;
  end if;
  
  -- Insert or update the telegram user
  insert into public.telegram_users (
    telegram_id,
    user_id,
    is_verified,
    verification_code,
    verification_expires_at
  )
  values (
    p_telegram_id,
    p_user_id,
    not p_verification_required,
    v_verification_code,
    case when p_verification_required then now() + interval '1 hour' else null end
  )
  on conflict (telegram_id) do update
  set 
    user_id = excluded.user_id,
    is_verified = excluded.is_verified,
    verification_code = excluded.verification_code,
    verification_expires_at = excluded.verification_expires_at,
    updated_at = now()
  returning id into v_id;
  
  return v_id;
end;
$$;

-- Add function to verify a Telegram account with code
create or replace function public.verify_telegram_account(
  p_telegram_id text,
  p_verification_code text
)
returns boolean
language plpgsql security definer
as $$
declare
  v_success boolean := false;
begin
  update public.telegram_users
  set 
    is_verified = true,
    verification_code = null,
    verification_expires_at = null,
    updated_at = now()
  where 
    telegram_id = p_telegram_id and
    verification_code = p_verification_code and
    verification_expires_at > now();
    
  if found then
    v_success := true;
  end if;
  
  return v_success;
end;
$$;