# REBOOT SCRIPT - Natural Gas Dashboard
Updated: 2026-02-18
Workspace: `C:\Users\manve\Downloads\Natural Gas Dashboard`

Use this file as the single source of truth to resume the session in a new chat.

## 1) Where We Are (High-Level)
- Project is a Next.js dashboard for MCX Natural Gas with trading zone, signal bot, option chain, and auth paywall.
- Large batch of changes is in progress and mostly uncommitted.
- Build/typecheck had been passing after latest auth + routing patches, but runtime behavior still needs validation on key pages.

## 2) Key Decisions Taken
1. Option-chain source strategy shifted away from Zerodha quote API (403 permission issues) toward public/live alternatives (Rupeezy path currently integrated in code).
2. Signal analysis must anchor to active MCX Natural Gas future, not stale/reference spot values.
3. Percentage move should be calculated from previous day close for consistency.
4. Timeframes prioritized for actionable setup: `1H`, `3H`, `1D`.
5. Chart scroll trap fix: disable wheel-zoom behavior so page scroll is not hijacked by embedded charts.
6. Auth/paywall model: home is public; premium routes require authentication.
7. Trading zone UI was compacted and position cards simplified per user instructions.
8. Lot-size logic has been revised multiple times during discussion (125 -> 1250 requirement raised later); all Greeks/PnL formulas must consistently use current configured lot size.

## 3) Most Important Implemented Changes
### A) Signal engine + API
- `src/app/api/signals/route.ts`
- `src/lib/utils/signal-engine.ts`
- `src/lib/types/signals.ts`
- `src/components/widgets/TradingSignalBot.tsx`

What changed:
- Added active snapshot + previous close handling.
- Computes `liveChange` and `liveChangePercent` from previous close when available.
- Produces multi-timeframe futures setups (`futuresSetups`) and keeps backward-compatible `futuresSetup`.
- Market condition and scoring thresholds were tightened.

### B) MCX public data alignment
- `src/app/api/mcx/public/route.ts`
- `src/lib/utils/rupeezy-option-chain.ts`
- `src/components/mcx/MCXPublicDataPanel.tsx`

What changed:
- Active-month future reference integrated into MCX route.
- Source/provider labeling updated in UI.

### C) Chart scroll/zoom behavior
- `src/components/mcx/MCXAdvancedChart.tsx`
- `src/components/widgets/TechnicalChartWidget.tsx`

What changed:
- `mouseWheel` scaling disabled.
- container `touchAction: 'pan-y'` added.

### D) Auth + premium routing
- `middleware.ts` (root)
- `src/middleware.ts` (also present)
- `src/components/layout/Navbar.tsx`
- `src/app/access/page.tsx`
- `src/app/login/page.tsx`
- `src/app/signup/page.tsx`

What changed:
- Middleware-based route protection and auth-page redirects.
- Navbar now conditionally shows premium/public links by auth state.
- Login/signup/access query handling reworked to avoid CSR search-param issues.

## 4) Critical Code Snippets
### Active previous-close based move
```ts
const computedLiveChange = previousClose != null ? currentPrice - previousClose : null;
const computedLiveChangePercent = previousClose != null && previousClose > 0
  ? ((currentPrice - previousClose) / previousClose) * 100
  : null;
```

### Overall signal uses live move context
```ts
const { signal, score, confidence } = computeOverallSignal(timeframeSignals, liveChangePercent);
const marketCondition = determineMarketCondition(dailyTF, liveChangePercent);
```

### Multi-timeframe futures setup output
```ts
const futuresSetups = recommendedTfs
  .map((tf) => generateFuturesSetup(tf, timeframeSignals[tf], currentPrice))
  .filter(Boolean);
```

### Chart wheel hijack prevention
```ts
handleScale: { mouseWheel: false },
handleScroll: { mouseWheel: false }
```

### Unauth redirect for premium pages (root middleware)
```ts
if (!user) {
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = '/';
  redirectUrl.searchParams.set('redirect', pathname);
  return NextResponse.redirect(redirectUrl);
}
```

### Auth page redirect when already logged in
```ts
if (user && (pathname.startsWith('/login') || pathname.startsWith('/signup'))) {
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = '/dashboard';
  redirectUrl.search = '';
  return NextResponse.redirect(redirectUrl);
}
```

## 5) Current Git Snapshot (Important)
`git status --short` shows many modified/untracked files, including:
- Modified: `src/app/api/signals/route.ts`, `src/lib/utils/signal-engine.ts`, `src/app/api/mcx/public/route.ts`, `src/components/widgets/TradingSignalBot.tsx`, `src/components/layout/Navbar.tsx`, docs, and more.
- Untracked: `middleware.ts`, `src/middleware.ts`, full auth folders (`src/app/login`, `signup`, `profile`, etc.), `src/lib/supabase`, `src/lib/utils/encryption.ts`, `supabase/`, `PRD.md`, `progress.txt`.

## 6) Outstanding Tasks (Priority)
1. Resolve middleware duplication conflict:
- Both `middleware.ts` and `src/middleware.ts` exist with different behavior (`/` vs `/access` redirect policy).
- Keep one canonical middleware and delete/merge the other.

2. Verify premium page gating end-to-end:
- Re-test logged-out access to `/dashboard`, `/signals`, `/nat-gas-mcx`, `/forecaster`, `/trading-zone`, `/profile`.
- Confirm navbar never shows premium links when logged out.

3. Re-validate timeframe and futures setup logic against live active contract:
- Ensure trend bias reacts correctly on large down days.
- Recheck SL/target width calibration for `1H`, `3H`, `1D`.

4. Confirm lot-size consistency for Greeks/PnL:
- Ensure all formulas (delta/theta/decay/futures delta) use intended Natural Gas lot size consistently across APIs + UI.

5. Final cleanup and commit plan:
- Decide whether to keep `PRD.md`, `progress.txt`, and duplicate middleware file.
- Create staged commits by concern (auth, signal engine, chart behavior, docs).

## 7) Paste-Ready Prompt For New Chat
```text
Resume from: C:\Users\manve\Downloads\Natural Gas Dashboard
Read REBOOT_SCRIPT.md first, then continue from current working tree without discarding changes.

Current priorities:
1) Fix and unify middleware routing (both middleware.ts and src/middleware.ts currently exist with different redirect behavior).
2) Validate premium-page auth gating and navbar visibility behavior end-to-end.
3) Recheck Signal page logic on active MCX Natural Gas futures, with previous-close based % change and tighter 1H/3H/1D futures setups.
4) Verify lot-size consistency in Greeks/PnL formulas across trading-zone and option-chain logic.
5) Prepare clean, minimal commit sequence and run validation (`npx tsc --noEmit --pretty false`, then app smoke tests).

Constraints:
- Do not reset/revert unrelated files.
- Keep existing functionality unless explicitly replacing it.
- Document any behavior changes in README/summary docs.
```