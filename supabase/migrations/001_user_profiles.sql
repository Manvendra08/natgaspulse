-- ============================================================
-- Migration: 001_user_profiles
-- Creates user_profiles table with per-user API key storage,
-- Zerodha credentials (encrypted blob), and RLS policies.
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- ============================================================

-- 1. Create table (idempotent)
create table if not exists public.user_profiles (
  -- Primary key tied to Supabase auth user
  id                      uuid primary key default gen_random_uuid(),
  -- Foreign key to auth.users; cascade delete cleans up on account removal
  user_id                 uuid not null unique references auth.users(id) on delete cascade,
  email                   text,
  full_name               text,
  subscription_status     text not null default 'PROMO',

  -- Zerodha credentials stored as AES-256-GCM encrypted JSON blob (server-side only)
  -- Schema of decrypted value: { apiKey, apiSecret, accessToken }
  zerodha_credentials     text,

  -- Convenience columns for quick access-token lookup without full decrypt
  -- Stored encrypted; decrypted only in server-side API routes
  zerodha_access_token    text,

  -- Generic JSONB bucket for any future per-user service keys
  -- Each value should be an encrypted string produced by encryptJson()
  other_api_keys          jsonb not null default '{}'::jsonb,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- 2. Add columns to existing table if upgrading from older schema
alter table public.user_profiles add column if not exists id uuid default gen_random_uuid();
alter table public.user_profiles add column if not exists email text;
alter table public.user_profiles add column if not exists full_name text;
alter table public.user_profiles add column if not exists subscription_status text not null default 'PROMO';
alter table public.user_profiles add column if not exists zerodha_credentials text;
alter table public.user_profiles add column if not exists zerodha_access_token text;
alter table public.user_profiles add column if not exists other_api_keys jsonb not null default '{}'::jsonb;
alter table public.user_profiles add column if not exists created_at timestamptz not null default now();
alter table public.user_profiles add column if not exists updated_at timestamptz not null default now();

-- 3. Enable Row Level Security
alter table public.user_profiles enable row level security;

-- 4. Drop old policies if they exist (safe re-run)
drop policy if exists "user can read own profile"    on public.user_profiles;
drop policy if exists "user can upsert own profile"  on public.user_profiles;
drop policy if exists "user can update own profile"  on public.user_profiles;
drop policy if exists "user can insert own profile"  on public.user_profiles;
drop policy if exists "user can delete own profile"  on public.user_profiles;

-- 5. RLS: authenticated users can only touch their own row
create policy "user can read own profile"
  on public.user_profiles
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "user can insert own profile"
  on public.user_profiles
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "user can update own profile"
  on public.user_profiles
  for update
  to authenticated
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user can delete own profile"
  on public.user_profiles
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- 6. Auto-update updated_at on every row change
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();

-- 7. Auto-create a profile row when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_profiles (user_id, email, full_name, subscription_status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', null),
    'PROMO'
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
