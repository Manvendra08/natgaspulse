# Supabase Setup (Free Tier)

This app uses Supabase Auth (Google + email/password) and a small `user_profiles` table to persist Trading Zone credentials per user.

## Environment Variables (Vercel + local)

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `APP_ENCRYPTION_KEY`

`APP_ENCRYPTION_KEY` should be a base64-encoded 32-byte key. You can generate one with:

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
[Convert]::ToBase64String($bytes)
```

## Google OAuth Setup (fixes "Unable to exchange external code")

In Supabase Dashboard:

1. Go to `Authentication -> Providers -> Google`.
2. Enable Google provider.
3. Paste the Google OAuth **Web client** ID and secret.

In Google Cloud Console (same client used above):

1. Create OAuth client type: `Web application` (not Android/iOS/Desktop).
2. Add this authorized redirect URI exactly:
   - `https://<your-project-ref>.supabase.co/auth/v1/callback`
3. Add authorized JavaScript origins:
   - Local: `http://localhost:3000` (or your local port)
   - Prod: your Vercel domain (for example `https://your-app.vercel.app`)
4. Keep OAuth consent screen in `Testing` with your Gmail as a test user, or publish to production.

Supabase URL allow list:

1. Go to `Authentication -> URL Configuration`.
2. Set `Site URL` to your deployed app URL.
3. Add redirect URLs:
   - `http://localhost:3000/auth/callback`
   - `https://<your-domain>/auth/callback`

## Email/Password Verification Setup

If signup works but no verification email arrives:

1. `Authentication -> Providers -> Email`:
   - Enable Email provider.
   - Enable `Confirm email` if you require verification before login.
2. `Authentication -> Email Templates`:
   - Keep default confirmation template or customize safely.
3. Check `Authentication -> Logs` after signup:
   - confirm message delivery attempts and errors.
4. Check inbox + spam/promotions for the recipient email.

## SQL (run in Supabase SQL Editor)

Create the profile table and enable RLS so users can only read/write their own row.

```sql
-- If you created the table earlier, add the new columns:
alter table public.user_profiles add column if not exists full_name text;
alter table public.user_profiles add column if not exists subscription_status text not null default 'PROMO';

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  subscription_status text not null default 'PROMO',
  zerodha_credentials text,
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

create policy "user can read own profile"
on public.user_profiles
for select
to authenticated
using (auth.uid() = user_id);

create policy "user can upsert own profile"
on public.user_profiles
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "user can update own profile"
on public.user_profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
```
