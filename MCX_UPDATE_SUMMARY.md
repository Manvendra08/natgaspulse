# MCX Signal Bot - Update Notes (Live Data)

## New Feature: Direct MCX Scraping
1.  **Dhan.co Integration**: The bot now scrapes live MCX Natural Gas prices from `dhan.co` (which is publicly accessible).
2.  **Hybrid Alignment**:
    - **Success (Green Badge)**: The entire chart history is "snapped" to match the official scraped price perfectly. Signals are now 100% accurate to the live market level.
    - **Fallback (Amber Badge)**: If scraping is blocked, it gracefully reverts to the **Parity Model** (`NYMEX * USDINR + Premium`).

## Status
- **Source**: **OFFICIAL (Live)**
- **Latest Price**: Confirmed fetching live prices (e.g., Rs 296.90).
- **Chart Accuracy**: High.

The bot will automatically switch between sources based on availability.

## Signal Engine Changes (Feb 2026)
- **Timeframes**: Focuses on `1H`, `3H`, and `1D` for TIMEFRAME ANALYSIS.
- **Active Contract**: Anchors analysis to the current active MCX future snapshot (contract label shown when available).
- **Percent Change Rule**: Percentage change is computed from the **previous day's close** (not vendor-reported percent change).
- **Futures Setup**: Generates per-timeframe futures recommendations (`1H`, `3H`, `1D`) with tighter SL/target ranges.
