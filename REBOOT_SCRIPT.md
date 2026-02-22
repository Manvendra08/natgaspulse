# REBOOT_SCRIPT.md

## Project
- Name: Natural Gas Dashboard
- Workspace: `C:\Users\manve\Downloads\Natural Gas Dashboard`
- Last Updated: 2026-02-19

## Tech Stack
- Framework: Next.js 16 (App Router), React 19, TypeScript
- Styling: Tailwind CSS
- Charts: `lightweight-charts`, `recharts`
- Auth/DB: Supabase (`@supabase/supabase-js`, `@supabase/ssr`)
- Icons/UI: `lucide-react`
- Runtime APIs: Next.js route handlers under `src/app/api/*`

## Database Schema Summary
- Source: `supabase/migrations/001_user_profiles.sql`
- Main table: `public.user_profiles`
- Key columns:
  - `id` (uuid, pk)
  - `user_id` (uuid, unique, fk -> `auth.users(id)`, cascade delete)
  - `email`, `full_name`, `subscription_status`
  - `zerodha_credentials` (encrypted blob)
  - `zerodha_access_token` (encrypted)
  - `other_api_keys` (jsonb encrypted values)
  - `created_at`, `updated_at`
- Security:
  - RLS enabled
  - Per-user select/insert/update/delete policies (`auth.uid() = user_id`)
- Triggers/functions:
  - `set_updated_at()` + update trigger
  - `handle_new_user()` + `auth.users` insert trigger to auto-create profile row

## Environment Variables
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `APP_ENCRYPTION_KEY`
- `EIA_API_KEY`

## Run Commands
- Install: `npm install`
- Dev server: `npm run dev`
- Build: `npm run build`
- Start prod server: `npm run start`
- Lint: `npm run lint`
- Type check: `npx tsc --noEmit`

## Completed Features
- Auth-aware navbar and protected premium-route flow.
- Dashboard modules: storage, weather, analytics, alerts, forecasting, charts.
- Signals page with multi-timeframe signal bot + futures/options advisory.
- Trading Zone with Zerodha profile-backed session flow + positions + option chain diagnostics.
- Nat Gas MCX page with public feed, advanced charting, spread/seasonality tooling.

### Completed Today (2026-02-19)
- Premium block moved from dashboard to home and placed above plans section.
- Premium cards no longer show per-card unlock CTA.
- Added single `Unlock with Pro →` button at section bottom with smooth scroll to plans.
- MCX expiry calendar now emits and displays two rows per month:
  - `FUT` expiry row
  - `OPT` expiry row
- Trading Zone refresh logic replaced:
  - Prices auto-refresh every 5s
  - Positions auto-refresh every 15s
  - Live pulsing indicator + per-stream last-updated timestamps
  - Manual refresh button removed
- Futures neutral/no-signal visuals updated to gray hyphen (`–`, `#888`, weight `400`).
- Market Analytics widget switched from NYMEX parity view to MCX futures month view:
  - `MCX Active Month`
  - `MCX Next Month`
  - Data path now sourced from `/api/mcx/public` MCX proxy route fields.
- X Social Stream now shows per-post timestamp below each post in IST format:
  - `DD MMM YYYY, HH:MM IST`
  - UTC ISO inputs converted to `Asia/Kolkata`.
- Mobile responsiveness upgrades:
  - Shared navbar replaced with hamburger + full-screen mobile drawer
  - Home top-nav now has hamburger + full-screen mobile drawer
  - Increased touch target sizing on key navigation/CTA controls
  - Trading-zone option-chain table has mobile card view fallback
  - Signal heatmap has mobile card view fallback
  - MCX settlement/OI table has mobile card view fallback
  - Global smooth scroll enabled

## Pending Tasks
- Run full lint/type/build validation and resolve any regressions.
- Normalize legacy text encoding artifacts (`â€¢`, `â€”`, `â‚¹`) across UI files.
- Review all remaining pages for strict 44px touch targets on every interactive control.
- Add automated tests for:
  - Trading-zone refresh cadence behavior
  - MCX active/next month fallback logic
  - IST timestamp formatting in social stream
- Consider websocket migration for Trading Zone if broker/websocket source is available.

## Known Bugs / Risks
- Multiple files still contain mojibake character artifacts from prior encoding issues.
- Trading-zone polling is interval-based and may overlap during slow API responses.
- MCX next-month quote depends on unofficial data availability; may be null and show fallback.
- Some legacy components may still be tuned for desktop-first spacing.

## Last Session Summary
- Session date: 2026-02-19
- Core objective: multi-part UX/data refresh across home/dashboard/trading/mcx/social/mobile + reboot doc regeneration.
- Major files touched:
  - `src/app/page.tsx`
  - `src/app/dashboard/page.tsx`
  - `src/components/home/PremiumFeaturesSection.tsx`
  - `src/app/trading-zone/page.tsx`
  - `src/components/widgets/TradingSignalBot.tsx`
  - `src/components/widgets/MarketOverviewWidget.tsx`
  - `src/app/api/mcx/public/route.ts`
  - `src/lib/types/mcx.ts`
  - `src/components/mcx/MCXPublicDataPanel.tsx`
  - `src/components/widgets/AlertsWidget.tsx`
  - `src/components/layout/Navbar.tsx`
  - `src/components/home/HomeTopNav.tsx`
  - `src/components/home/HomeAuthActions.tsx`
  - `src/styles/globals.css`
  - `REBOOT_SCRIPT.md`

## Quick Resume Prompt
```text
Open C:\Users\manve\Downloads\Natural Gas Dashboard.
Read REBOOT_SCRIPT.md first.
Continue from uncommitted working tree.
Priority:
1) run lint + typecheck + build and fix breakages,
2) clean encoding artifacts,
3) verify mobile behavior end-to-end,
4) add regression tests for trading-zone refresh + MCX month source + IST timestamp formatting.
Do not revert unrelated local changes.
```
