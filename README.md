# Natural Gas Trading Dashboard

Professional trading intelligence dashboard for MCX Natural Gas with signal bot, option chain, storage forecaster, and auth paywall.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Auth / DB**: Supabase (Auth + Postgres)
- **Styling**: TailwindCSS
- **Charts**: Recharts, Lightweight Charts
- **Icons**: Lucide React

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/Manvendra08/natgaspulse.git
cd natgaspulse
npm install
```

### 2. Environment variables

Copy `.env.example` to `.env.local` and fill in the values:

```bash
cp .env.example .env.local
```

Required variables:

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (Dashboard → Settings → API) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `APP_ENCRYPTION_KEY` | Base64-encoded 32-byte key for AES-256-GCM encryption |
| `EIA_API_KEY` | EIA API key — register free at eia.gov/opendata |

**Generate `APP_ENCRYPTION_KEY`** (PowerShell):
```powershell
$b = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
[Convert]::ToBase64String($b)
```

**Generate `APP_ENCRYPTION_KEY`** (Node.js):
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

> **Do NOT add Zerodha API keys to `.env`.**
> They are stored per-user in the database (encrypted). See [API Keys](#api-keys--zerodha-connect) below.

### 3. Supabase database setup

Run the migration SQL in **Supabase Dashboard → SQL Editor → New query**:

```
supabase/migrations/001_user_profiles.sql
```

This creates the `user_profiles` table with:
- `id`, `user_id` (FK → auth.users), `email`, `full_name`, `subscription_status`
- `zerodha_credentials` (AES-256-GCM encrypted blob: `{ apiKey, apiSecret }`)
- `zerodha_access_token` (encrypted access token)
- `other_api_keys` (JSONB for future per-user keys)
- Row-Level Security: users can only read/write their own row
- Trigger: auto-creates a profile row on first login

### 4. Supabase Auth setup

In **Supabase Dashboard → Authentication → Providers**:
- Enable **Email** provider (with or without email confirmation)
- Optionally enable **Google** OAuth (see `supabase/README.md` for full Google OAuth setup)

In **Authentication → URL Configuration**:
- Site URL: your deployed domain (e.g. `https://your-app.vercel.app`)
- Redirect URLs: `http://localhost:3001/auth/callback`, `https://your-app.vercel.app/auth/callback`

### 5. Run development server

```bash
npm run dev
```

Open [http://localhost:3001](http://localhost:3001)

---

## API Keys & Zerodha Connect

Trading API keys (Zerodha) are **never stored in `.env`**. They are managed per-user:

1. **Sign up / log in** to the dashboard.
2. Go to **Profile → Zerodha API Keys**.
3. Paste your Zerodha API Key and API Secret. They are sent once over HTTPS, encrypted with AES-256-GCM server-side, and stored in `user_profiles.zerodha_credentials`. The raw values are never logged or returned to the frontend.
4. Go to **Profile → Zerodha Connect** and click **Connect Zerodha**.
5. You are redirected to Kite OAuth. After login, the `request_token` is exchanged server-side for an `access_token` (SHA-256 checksum verified). The access token is stored encrypted in `user_profiles.zerodha_access_token`.
6. To disconnect, click **Disconnect** — this clears the stored access token.

---

## Features

### Auth & Paywall
- Email/password + Google OAuth via Supabase
- Middleware-based route protection: `/dashboard`, `/signals`, `/forecaster`, `/trading-zone`, `/nat-gas-mcx`, `/profile` require login
- Home page (`/`) is public

### Signal Bot (`/signals`)
- Multi-timeframe analysis: `1H`, `3H`, `1D`
- 8 indicators: RSI, MACD, EMA(20/50), Stochastic, Bollinger Bands, VWAP, Pivot Points, ADX
- Futures setups with ATR-based SL/targets per timeframe
- Live MCX price from Rupeezy active future; fallback to NYMEX × USDINR
- Confidence score: HIGH / MEDIUM / LOW based on timeframe agreement

### Forecaster (`/forecaster`)
- NOAA HDD/CDD weighted by region (East 35%, Midwest 30%, South 20%, West 10%, Mountain 5%)
- Simple and Advanced regression models
- Per-source error surfacing (EIA, NOAA, market price)
- Data freshness timestamps per source
- Stale-data warning when EIA data is >8 days old
- Model mode persisted in sessionStorage

### MCX Data (`/nat-gas-mcx`)
- Active future LTP from Rupeezy public API
- Option chain analysis (PCR, max pain, call resistance, put support)
- USD/INR parity calculator

### Trading Zone (`/trading-zone`)
- Position analyzer with Greeks (Delta, Theta, Vega)
- PnL calculator using MCX lot size

---

## API Routes

| Route | Description |
|---|---|
| `GET /api/eia/storage` | EIA weekly storage stats (current, 5Y avg, deviation) |
| `GET /api/market/prices` | Yahoo Finance NYMEX NG=F prices |
| `GET /api/weather/hdd-cdd` | NOAA regional HDD/CDD forecasts |
| `GET /api/signals` | Multi-timeframe signal engine |
| `GET /api/mcx/public` | MCX public data panel |
| `GET /api/option-chain` | Option chain snapshot |
| `GET /api/profile` | User profile (auth required) |
| `POST /api/profile` | Update display name (auth required) |
| `GET /api/profile/zerodha` | Zerodha key status — masked (auth required) |
| `POST /api/profile/zerodha` | Save / clear Zerodha API keys (auth required) |
| `GET /api/auth/zerodha/login-url` | Generate Kite OAuth login URL (auth required) |
| `POST /api/auth/zerodha` | Exchange request_token → access_token (auth required) |
| `DELETE /api/auth/zerodha` | Clear stored access token (auth required) |

---

## Project Structure

```
/
├── .env.example                    # Template — copy to .env.local
├── supabase/
│   ├── README.md                   # Supabase setup guide
│   └── migrations/
│       └── 001_user_profiles.sql   # Run in Supabase SQL Editor
├── middleware.ts                   # Route protection (auth gate)
└── src/
    ├── app/
    │   ├── api/
    │   │   ├── auth/zerodha/       # Kite OAuth token exchange + login-url
    │   │   ├── eia/storage/        # EIA storage stats
    │   │   ├── market/prices/      # NYMEX prices
    │   │   ├── mcx/public/         # MCX public data
    │   │   ├── option-chain/       # Option chain
    │   │   ├── profile/            # User profile CRUD
    │   │   ├── profile/zerodha/    # Zerodha key management
    │   │   ├── signals/            # Signal engine
    │   │   └── weather/hdd-cdd/    # NOAA weather
    │   ├── forecaster/             # Forecaster page
    │   ├── profile/                # Settings page (account + API keys)
    │   ├── signals/                # Signal bot page
    │   └── trading-zone/           # Trading zone page
    ├── components/
    │   ├── layout/Navbar.tsx
    │   └── widgets/                # StoragePredictor, StorageSignals, etc.
    └── lib/
        ├── api-clients/            # EIA, NOAA, Zerodha clients
        ├── supabase/               # Browser + server Supabase clients
        ├── types/                  # Signal, MCX types
        └── utils/
            ├── encryption.ts       # AES-256-GCM encrypt/decrypt
            ├── signal-engine.ts    # Multi-TF signal logic
            └── technical.ts        # RSI, EMA, MACD, BB, Stochastic
```

---

## Security Notes

- `APP_ENCRYPTION_KEY` is server-side only — never prefix with `NEXT_PUBLIC_`
- `EIA_API_KEY` is server-side only — never prefix with `NEXT_PUBLIC_`
- Zerodha credentials are encrypted before DB write; raw values never leave the server
- RLS ensures users can only access their own `user_profiles` row
- Access tokens are stored encrypted and cleared on disconnect/logout

## License

MIT
