# Trading Zone - Position Monitor & Adjustment Advisor

## Overview
The Trading Zone is an intelligent position monitoring system that connects to your Zerodha account and provides real-time adjustment recommendations based on market conditions and technical analysis.

## Features

### 1. **Zerodha Integration**
- Connects via Kite Connect API
- Fetches live positions every 30 minutes
- Secure credential storage (browser localStorage)

### 2. **Position Analysis**
- **Risk Assessment**: Categorizes positions as LOW, MEDIUM, HIGH, or CRITICAL risk
- **P&L Tracking**: Real-time profit/loss calculation with percentage metrics
- **Market Context**: Integrates with Signal Bot for trend and volatility analysis

### 3. **Adjustment Recommendations**
The bot suggests 5 types of actions:
- **HOLD**: Position is stable, continue monitoring
- **ADD**: Favorable conditions to increase position size
- **REDUCE**: Partial profit booking or risk reduction
- **EXIT**: Critical loss, immediate exit recommended
- **HEDGE**: Suggest protective options or strategies

### 4. **Recommendation Logic**

#### Exit Triggers
- Loss > 15% → Immediate exit
- Loss > 10% + Adverse trend → Hedge or reduce

#### Profit Taking
- Profit > 20% → Book 50% profits
- Profit > 10% → Trail stop-loss at breakeven

#### Trend Analysis
- Long position + Bearish trend → Reduce exposure
- Short position + Bullish trend → Cover shorts
- Favorable trend + 5-15% profit → Add to winners

#### Technical Indicators
- RSI > 75 (Long) → Reduce 30%
- RSI < 25 (Short) → Cover 30%
- High volatility → Tighten stops or hedge

### 5. **Auto-Refresh**
- Reviews positions every **30 minutes**
- Countdown timer shows next refresh
- Manual refresh button available

## Setup Instructions

### Step 1: Get Zerodha API Credentials
1. Visit [kite.trade](https://kite.trade)
2. Create a Kite Connect app
3. Note your **API Key** and **API Secret**

### Step 2: Generate Access Token
You need to complete the OAuth flow to get an access token:

```bash
# Login URL format
https://kite.zerodha.com/connect/login?api_key=YOUR_API_KEY&redirect_params=http://localhost:3000/trading-zone
```

After login, Zerodha will redirect with a `request_token`. Exchange it for an `access_token`:

```javascript
// Use the /api/auth/zerodha endpoint (to be implemented)
POST /api/auth/zerodha
{
  "request_token": "...",
  "api_key": "...",
  "api_secret": "..."
}
```

### Step 3: Configure Trading Zone
1. Navigate to `/trading-zone`
2. Enter your **API Key** and **Access Token**
3. Click "Start Monitoring"

## Security Notes
- Credentials are stored in browser localStorage (client-side only)
- Access tokens expire daily - you'll need to re-authenticate
- Never commit API secrets to version control
- Consider implementing server-side token refresh for production

## API Endpoints

### `POST /api/positions`
Fetches and analyzes Zerodha positions.

**Request:**
```json
{
  "apiKey": "your_api_key",
  "accessToken": "your_access_token"
}
```

**Response:**
```json
{
  "timestamp": "2026-02-15T10:30:00Z",
  "positionCount": 3,
  "totalPnL": 1250.50,
  "marketCondition": {
    "trend": "BULLISH",
    "volatility": "MEDIUM",
    "rsi": 62.5,
    "atr": 8.2
  },
  "positions": [
    {
      "symbol": "NATURALGAS26FEBFUT",
      "quantity": 1200,
      "avgPrice": 295.50,
      "ltp": 298.20,
      "pnl": 3240,
      "pnlPercent": 0.91,
      "riskLevel": "LOW",
      "recommendations": [
        {
          "action": "HOLD",
          "reason": "Position is stable. Continue monitoring. P&L: 0.91%",
          "urgency": "LOW"
        }
      ]
    }
  ]
}
```

## Future Enhancements
- [ ] Automated stop-loss placement (with user confirmation)
- [ ] WhatsApp/Email alerts for critical positions
- [ ] Historical P&L tracking and analytics
- [ ] Multi-broker support (Upstox, Angel One)
- [ ] Options Greeks analysis for option positions
- [ ] Portfolio-level risk metrics (VaR, Sharpe ratio)

## Troubleshooting

### "Failed to fetch positions"
- Check if your access token is valid (tokens expire daily)
- Verify API key is correct
- Ensure Zerodha API is not rate-limited

### "No positions found"
- Confirm you have open positions in your Zerodha account
- Check if positions are in the correct segment (NFO/MCX)

### Recommendations seem incorrect
- The bot uses the Signal API for market context
- Ensure the Signal API is running and returning valid data
- Market condition defaults to NEUTRAL if Signal API fails

## Technical Architecture

```
Trading Zone Page (Client)
    ↓
POST /api/positions
    ↓
Zerodha API Client → Fetch Positions
    ↓
Signal API → Fetch Market Condition
    ↓
Position Analyzer → Generate Recommendations
    ↓
Response to Client
```

## Dependencies
- `@/lib/api-clients/zerodha.ts` - Zerodha Kite Connect wrapper
- `@/lib/utils/position-analyzer.ts` - Recommendation engine
- `/api/signals` - Market condition provider
