# PRD: Dhan Integration and Option Analysis Upgrade

## Context
The project needs to move beyond simulated data and single-provider dependency. The intent is to integrate Dhan as a primary data source for MCX option chains and refine Greeks to show real-world INR impact (P&L sensitivity).

## Goals
- Stable integration with Dhan API for live option chains.
- Multi-provider support (Rupeezy fallback, Dhan primary, Simulation for off-market).
- UI implementation of Net Delta (INR/point) and Decay (INR/day) for option positions.
- Specialized UI for exploring the full Option Chain with Greek columns.

## Current State (Feb 2026)
- **Position Source**: Zerodha (via Kite API).
- **Data Source**: `src/lib/utils/option-chain-provider.ts` currently uses Rupeezy public endpoints as primary, with a deterministic simulation fallback.
- **Dhan Utility**: `dhan.ts` and `dhan-option-chain.ts` exist but are not integrated into the main `getOptionChainAnalysis` flow used by the Signal Bot.
- **Greeks Calculation**: 
    - `Net Delta (INR)`: `Delta * Lots * LotSize`. Currently used in `position-analyzer.ts`.
    - `Decay (INR)`: `Theta * Lots * LotSize * DaysToOpen`. Currently used in `position-analyzer.ts`.
- **Baseline**: Signal Bot percent change is computed from the previous day's close (from Rupeezy snapshot) when available.

## Technical Requirements
- **Net Delta (INR)**: `Delta * Lots * LotSize`. Represents INR change for 1 point move.
- **Decay (INR)**: `Theta * Lots * LotSize * DaysToOpen`. Represents total Theta loss until next market open.
- **Provider Switching**: Implement a strategy in `option-chain-provider.ts` to try Dhan (if token provided) -> Rupeezy (public) -> Simulation.
- **Token Management**: Dhan "policeToken" is stored in browser local storage. The `/api/signals` and `/api/option-chain` endpoints must support receiving this token from the frontend.

## Tasks
- [ ] [id:verify_dhan_client] **Verify Dhan API Client**: Ensure `src/lib/api-clients/dhan.ts` correctly handles authentication and requests.
- [ ] [id:integrate_dhan_provider] **Integrate Dhan Provider**: Update `src/lib/utils/option-chain-provider.ts` to support fetching from Dhan when a token is provided.
- [ ] [id:dhan_auth_bridge] **Dhan Auth Bridge**: Fix the `/api/auth/dhan` route to handle "policeToken" extraction from local storage properly as a fallback.
- [ ] [id:refine_greeks_calc] **Refine Greeks Calculation**: Ensure `OptionChainAnalysis` response includes Delta, Theta, and IV for each strike.
- [ ] [id:create_option_chain_widget] **Create Option Chain Explorer**: Build a new component `OptionChainExplorer.tsx` that displays a professional table with columns for: Strike, Call (LTP, OI, Delta, Theta), and Put (LTP, OI, Delta, Theta).
- [ ] [id:ui_source_selector] **Source Selector UI**: Add a selector in the dashboard to switch between data providers and input/paste the Dhan token if needed.
- [ ] [id:validate_pnl_sensitivity] **Validate P&L Sensitivity**: Ensure that Net Delta and Decay in the Trading Zone reflect "INR impact" exactly as requested.
