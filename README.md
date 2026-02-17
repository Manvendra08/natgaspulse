# Natural Gas Trading Dashboard

Professional trading intelligence dashboard for natural gas markets using free government data sources.

## Features

### Module 1 - EIA Data Integration ✅
- **Weekly Storage Report**: Current, Year Ago, 5-Year Average, Deviation calculations
- **Henry Hub Prices**: Real-time spot prices with change indicators
- **Storage Trend Chart**: 52-week historical visualization

### Module 2 - Weather Analytics (NOAA) ✅
- **Regional Demand**: HDD/CDD forecasts for key consumption areas.
- **Temperature Maps**: Interactive 6-10 & 8-14 Day outlooks.

### Module 3 - Technical Analysis ✅
- **Interactive Charts**: Full trading terminal with Candlestick charts.
- **Indicators**: RSI (14), Bollinger Bands (20, 2), and MACD (12, 26, 9).
- **Timeframes**: Multi-timeframe view (1D, 1W, 1M, 1Y).

### Module 4 - Smart Alerts ✅
- **Custom Triggers**: Storage Surprise (>10%), Price Volatility (>5%).
- **Extreme Weather**: Regional HDD/CDD spike notifications.

### Module 5 - MCX Data ✅
- **Arbitrage**: Live USD/INR parity calculator.
- **Contract Specs**: Expiry dates & lot sizes.

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Styling**: TailwindCSS with custom dark theme
- **Charts**: Recharts
- **Icons**: Lucide React

## Getting Started

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up environment variables**:
   Create `.env.local` file with your EIA API key:
   ```
   EIA_API_KEY=your_api_key_here
   ```

3. **Run development server**:
   ```bash
   npm run dev
   ```

4. **Open browser**:
   Navigate to [http://localhost:3001](http://localhost:3001)

## API Endpoints

### Internal API Routes
- `/api/eia/storage`: Weekly storage statistics
- `/api/eia/prices`: Henry Hub spot prices (400-day history)
- `/api/weather/hdd-cdd`: NOAA Regional HDD/CDD forecasts

### External Data Sources
- **EIA API**: Natural gas storage & pricing
- **NOAA Weather**: Gridpoint forecasts & CPC outlooks
- **ExchangeRate-API**: Real-time USD/INR rates

## Project Structure

```
/src
  /app
    /api/eia          # EIA data endpoints
    /dashboard        # Main dashboard page
  /components
    /widgets          # Dashboard widgets (Storage, Price)
    /charts           # Chart components (Recharts)
    /layout           # Layout components (Navbar)
  /lib
    /api-clients      # API client functions
    /utils            # Utility functions
  /styles             # Global styles
```

## Features Implemented

✅ Professional Candlestick Charting  
✅ High-Precision Linear Interpolation for EIA stats  
✅ Real-time Volatility & Arbitrage Calculators  
✅ Dark theme trading interface  
✅ Loading states & Error handling  
✅ Premium gradient effects  

## License

MIT
