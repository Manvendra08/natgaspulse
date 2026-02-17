/**
 * Zerodha Kite Connect API Client
 * Handles authentication and position fetching
 */

export interface ZerodhaPosition {
    tradingsymbol: string;
    exchange: string;
    instrument_token: number;
    product: string;
    quantity: number;
    overnight_quantity: number;
    multiplier: number;
    average_price: number;
    close_price: number;
    last_price: number;
    value: number;
    pnl: number;
    m2m: number;
    unrealised: number;
    realised: number;
    buy_quantity: number;
    buy_price: number;
    buy_value: number;
    buy_m2m: number;
    sell_quantity: number;
    sell_price: number;
    sell_value: number;
    sell_m2m: number;
    day_buy_quantity: number;
    day_buy_price: number;
    day_buy_value: number;
    day_sell_quantity: number;
    day_sell_price: number;
    day_sell_value: number;
}

export interface ZerodhaCredentials {
    apiKey: string;
    accessToken: string;
}

export interface ZerodhaInstrument {
    instrument_token: number;
    exchange_token: number;
    tradingsymbol: string;
    name: string;
    last_price: number;
    expiry: string;
    strike: number;
    tick_size: number;
    lot_size: number;
    instrument_type: string;
    segment: string;
    exchange: string;
}

export interface ZerodhaDepthEntry {
    price: number;
    quantity: number;
    orders: number;
}

export interface ZerodhaQuote {
    instrument_token: number;
    timestamp?: string;
    last_trade_time?: string;
    last_price: number;
    volume?: number;
    average_price?: number;
    oi?: number;
    oi_day_high?: number;
    oi_day_low?: number;
    buy_quantity?: number;
    sell_quantity?: number;
    depth?: {
        buy?: ZerodhaDepthEntry[];
        sell?: ZerodhaDepthEntry[];
    };
}

export interface ZerodhaLtpQuote {
    instrument_token: number;
    last_price: number;
}

const INSTRUMENT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const instrumentCache = new Map<string, { fetchedAt: number; data: ZerodhaInstrument[] }>();

/**
 * Fetch positions from Zerodha
 * Note: Requires valid access token (obtained via OAuth flow)
 */
export async function fetchZerodhaPositions(credentials: ZerodhaCredentials): Promise<ZerodhaPosition[]> {
    try {
        const response = await fetch('https://api.kite.trade/portfolio/positions', getAuthHeaders(credentials));

        if (!response.ok) {
            let errorMessage = `Zerodha API error: ${response.status}`;
            try {
                const errorData = await response.json();
                if (errorData.message) {
                    errorMessage = `Zerodha: ${errorData.message} (${errorData.status})`;
                }
            } catch (e) {
                // Could not parse JSON, stick to status code
            }
            throw new Error(errorMessage);
        }

        const data = await response.json();
        return data.data?.net || [];
    } catch (error) {
        console.error('Failed to fetch Zerodha positions:', error);
        throw error;
    }
}

/**
 * Fetch tradable instruments from Zerodha (CSV dump).
 * Optional exchange filter significantly reduces payload size.
 */
export async function fetchZerodhaInstruments(
    credentials: ZerodhaCredentials,
    exchange?: string
): Promise<ZerodhaInstrument[]> {
    const exchangeKey = (exchange || 'ALL').toUpperCase();
    const cached = instrumentCache.get(exchangeKey);
    const now = Date.now();
    if (cached && now - cached.fetchedAt < INSTRUMENT_CACHE_TTL_MS) {
        return cached.data;
    }

    const url = exchangeKey === 'ALL'
        ? 'https://api.kite.trade/instruments'
        : `https://api.kite.trade/instruments/${encodeURIComponent(exchangeKey)}`;

    const response = await fetch(url, getAuthHeaders(credentials));
    if (!response.ok) {
        throw new Error(`Zerodha instruments fetch failed: ${response.status}`);
    }

    const csv = await response.text();
    const instruments = parseInstrumentsCsv(csv);
    instrumentCache.set(exchangeKey, { fetchedAt: now, data: instruments });
    return instruments;
}

/**
 * Fetch full quote snapshots for up to many instruments.
 * Zerodha supports up to 250 instruments per /quote request; this helper batches automatically.
 */
export async function fetchZerodhaQuotes(
    credentials: ZerodhaCredentials,
    instrumentKeys: string[]
): Promise<Record<string, ZerodhaQuote>> {
    const deduped = Array.from(new Set(instrumentKeys.filter(Boolean)));
    if (deduped.length === 0) {
        return {};
    }

    // Keep chunk smaller to avoid very long query strings getting blocked by upstream gateways.
    const chunkSize = 100;
    const merged: Record<string, ZerodhaQuote> = {};

    for (let i = 0; i < deduped.length; i += chunkSize) {
        const chunk = deduped.slice(i, i + chunkSize);
        const query = new URLSearchParams();
        chunk.forEach((key) => query.append('i', key));

        const url = `https://api.kite.trade/quote?${query.toString()}`;
        const response = await fetch(url, getAuthHeaders(credentials));
        if (!response.ok) {
            const details = await readZerodhaErrorDetails(response);
            throw new Error(`Zerodha quote fetch failed: ${response.status}${details ? ` (${details})` : ''}`);
        }

        const payload = await response.json() as { data?: Record<string, ZerodhaQuote> };
        if (payload.data) {
            Object.assign(merged, payload.data);
        }
    }

    return merged;
}

/**
 * Fetch LTP-only quote snapshots.
 * Useful as a fallback when full quote depth/oi permission is unavailable.
 */
export async function fetchZerodhaLtpQuotes(
    credentials: ZerodhaCredentials,
    instrumentKeys: string[]
): Promise<Record<string, ZerodhaLtpQuote>> {
    const deduped = Array.from(new Set(instrumentKeys.filter(Boolean)));
    if (deduped.length === 0) {
        return {};
    }

    const chunkSize = 200;
    const merged: Record<string, ZerodhaLtpQuote> = {};

    for (let i = 0; i < deduped.length; i += chunkSize) {
        const chunk = deduped.slice(i, i + chunkSize);
        const query = new URLSearchParams();
        chunk.forEach((key) => query.append('i', key));

        const url = `https://api.kite.trade/quote/ltp?${query.toString()}`;
        const response = await fetch(url, getAuthHeaders(credentials));
        if (!response.ok) {
            const details = await readZerodhaErrorDetails(response);
            throw new Error(`Zerodha LTP quote fetch failed: ${response.status}${details ? ` (${details})` : ''}`);
        }

        const payload = await response.json() as { data?: Record<string, ZerodhaLtpQuote> };
        if (payload.data) {
            Object.assign(merged, payload.data);
        }
    }

    return merged;
}

/**
 * Generate login URL for Zerodha OAuth
 */
export function getZerodhaLoginUrl(apiKey: string, redirectUrl: string): string {
    return `https://kite.zerodha.com/connect/login?api_key=${apiKey}&redirect_params=${encodeURIComponent(redirectUrl)}`;
}

/**
 * Exchange access token from request token
 */
export async function exchangeToken(apiKey: string, requestToken: string, apiSecret: string): Promise<string> {
    const response = await fetch('https://api.kite.trade/session/token', {
        method: 'POST',
        headers: {
            'X-Kite-Version': '3',
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            api_key: apiKey,
            request_token: requestToken,
            checksum: generateChecksum(apiKey, requestToken, apiSecret)
        })
    });

    if (!response.ok) {
        throw new Error('Token exchange failed');
    }

    const data = await response.json();
    return data.data.access_token;
}

function getAuthHeaders(credentials: ZerodhaCredentials): RequestInit {
    return {
        headers: {
            'X-Kite-Version': '3',
            'Authorization': `token ${credentials.apiKey}:${credentials.accessToken}`
        }
    };
}

function parseInstrumentsCsv(csv: string): ZerodhaInstrument[] {
    const rows = csv
        .trim()
        .split(/\r?\n/)
        .filter(Boolean);

    if (rows.length <= 1) {
        return [];
    }

    const header = parseCsvLine(rows[0]);
    const index = (key: string) => header.findIndex((h) => h === key);

    const idx = {
        instrument_token: index('instrument_token'),
        exchange_token: index('exchange_token'),
        tradingsymbol: index('tradingsymbol'),
        name: index('name'),
        last_price: index('last_price'),
        expiry: index('expiry'),
        strike: index('strike'),
        tick_size: index('tick_size'),
        lot_size: index('lot_size'),
        instrument_type: index('instrument_type'),
        segment: index('segment'),
        exchange: index('exchange')
    };

    const parseNum = (value: string): number => {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
    };

    const instruments: ZerodhaInstrument[] = [];
    for (let i = 1; i < rows.length; i++) {
        const values = parseCsvLine(rows[i]);
        if (!values.length) continue;

        instruments.push({
            instrument_token: parseNum(values[idx.instrument_token]),
            exchange_token: parseNum(values[idx.exchange_token]),
            tradingsymbol: values[idx.tradingsymbol] || '',
            name: values[idx.name] || '',
            last_price: parseNum(values[idx.last_price]),
            expiry: values[idx.expiry] || '',
            strike: parseNum(values[idx.strike]),
            tick_size: parseNum(values[idx.tick_size]),
            lot_size: parseNum(values[idx.lot_size]),
            instrument_type: values[idx.instrument_type] || '',
            segment: values[idx.segment] || '',
            exchange: values[idx.exchange] || ''
        });
    }

    return instruments;
}

function parseCsvLine(line: string): string[] {
    const out: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];

        if (ch === '"') {
            if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (ch === ',' && !inQuotes) {
            out.push(current);
            current = '';
            continue;
        }

        current += ch;
    }

    out.push(current);
    return out;
}

async function readZerodhaErrorDetails(response: Response): Promise<string> {
    try {
        const payload = await response.json() as { message?: string; error_type?: string };
        if (payload?.message) return payload.message;
        if (payload?.error_type) return payload.error_type;
    } catch {
        // Ignore parse failures.
    }
    return '';
}

function generateChecksum(apiKey: string, requestToken: string, apiSecret: string): string {
    // SHA-256 hash of api_key + request_token + api_secret
    // Note: In production, use crypto library
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(apiKey + requestToken + apiSecret).digest('hex');
}
