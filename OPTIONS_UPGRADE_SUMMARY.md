# Options Advisor Upgrade: Live & Simulated Chain Analysis

## New Capabilities
1.  **Real-Time Option Chain Analysis**:
    - The bot calculates **PCR (Put-Call Ratio)** to gauge market sentiment (Overbought/Oversold).
    - Identifies **Max Pain Strike** (where option writers make the most profit).
    - Detects **Open Interest (OI) Support & Resistance** levels dynamically.

2.  **Hybrid Data Source**:
    - **Primary**: Pulls a live option chain from **Rupeezy public endpoints** (with LTP/OI enrichment when available).
    - **Fallback**: If live chain fetch is blocked/unavailable, it generates a **deterministic simulated chain** centered on the current futures price.
    - This ensures you always have actionable data, centered on the same price reference used by the Signal Bot.

3.  **Enhanced Recommendations**:
    - "Buy/Sell" advice now explicitly references OI levels (e.g., "Sell Call at Rs 310 due to High OI Resistance").
    - Visual indicators for PCR and Max Pain added to the Options Advisor card.

## Status
- **Analysis**: Active.
- **Data Source**: Auto-switching (Live / Simulated).
- **Dashboard**: Updated with new metrics.

## Notes
- The Signal Bot's percent change baseline uses the previous day's close when available.
