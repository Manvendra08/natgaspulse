# Reboot Script (Compact) - Natural Gas Dashboard

Repo: `C:\Users\manve\Downloads\Natural Gas Dashboard`

## What’s Implemented

### Signal Bot (MCX)
- Focus timeframes: `1H`, `3H`, `1D`
- `% change` baseline: **previous day close** (not vendor percent)
- Futures setups: tighter SL/targets per timeframe (`1H/3H/1D`)
- API response additions: `activeContract`, `previousClose`, `futuresSetups[]` (keeps legacy `futuresSetup`)

Files:
- `src/lib/utils/signal-engine.ts`
- `src/app/api/signals/route.ts`
- `src/app/api/mcx/public/route.ts`
- `src/components/widgets/TradingSignalBot.tsx`
- `src/lib/utils/rupeezy-option-chain.ts`
- `src/lib/types/signals.ts`

### Trading Zone
- Compact cards: removed per-position “Alerts”
- Top strip above positions: replaced FUT price with counts (Open / In Profit / In Loss)
- Zerodha connect/login: added Cancel button(s) to abort operation
- Zerodha credentials storage: moved from `localStorage` to per-user profile via encrypted API

Files:
- `src/app/trading-zone/page.tsx`
- `src/app/api/profile/zerodha/route.ts`
- `src/lib/utils/encryption.ts`

### Auth Paywall (Vercel + Free)
- Supabase Auth: Google OAuth + email/password
- Only `/` is public; all other routes require auth (middleware redirect to `/login`)
- Added auth UI + OAuth callback handler

Files:
- `middleware.ts`
- `src/app/login/page.tsx`
- `src/app/signup/page.tsx`
- `src/app/auth/callback/route.ts`
- `src/lib/supabase/browser.ts`
- `src/lib/supabase/server.ts`
- `src/components/layout/Navbar.tsx`
- `src/components/Header.tsx`

## Setup Required (Do This First)

### Env (Vercel + `.env.local`)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `APP_ENCRYPTION_KEY` (base64 32 bytes recommended)

### Supabase
- Enable Google provider
- Redirect URLs:
  - Local: `http://localhost:3001/auth/callback`
  - Prod: `https://<domain>/auth/callback`

### SQL (Supabase SQL editor)
```sql
create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
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

## Current Repo State
- There are many uncommitted changes + several untracked files (including `PRD.md` and `progress.txt`). Decide whether to commit or delete those.

## Quick Commands
```powershell
npx tsc --noEmit --pretty false
npm run dev
```

## Paste Into New Chat
"""
We are in `C:\\Users\\manve\\Downloads\\Natural Gas Dashboard`.
Implemented: Signal Bot fixes (active MCX anchoring, prev-close % change, 1H/3H/1D focus, per-TF futures setups), Trading Zone compact UI changes, Supabase auth paywall (only `/` public), encrypted per-user Zerodha profile storage, and Cancel buttons for the Zerodha connect flow.
Need help validating Supabase setup (env + providers + redirect URLs + SQL/RLS) and then sanity-checking the app (`npx tsc --noEmit`, `npm run dev`). Also decide whether to commit/remove untracked `PRD.md` and `progress.txt`.
"""

