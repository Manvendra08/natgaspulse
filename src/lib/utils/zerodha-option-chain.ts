import {
    fetchZerodhaInstruments,
    fetchZerodhaLtpQuotes,
    fetchZerodhaQuotes,
    type ZerodhaCredentials,
    type ZerodhaInstrument,
    type ZerodhaLtpQuote,
    type ZerodhaQuote
} from '@/lib/api-clients/zerodha';

export interface ZerodhaOptionLegQuote {
    tradingsymbol: string;
    instrumentToken: number;
    optionType: 'CE' | 'PE';
    strikePrice: number;
    expiry: string;
    lotSize: number;
    ltp: number;
    oi: number;
    volume: number;
    buyQuantity: number;
    sellQuantity: number;
    bestBidPrice: number;
    bestBidQuantity: number;
    bestAskPrice: number;
    bestAskQuantity: number;
    spread: number;
    spreadPercent: number;
}

export interface ZerodhaOptionChainRow {
    strikePrice: number;
    ce?: ZerodhaOptionLegQuote;
    pe?: ZerodhaOptionLegQuote;
}

export interface ZerodhaOptionChainResult {
    source: 'ZERODHA_KITE';
    fetchedAt: string;
    exchange: string;
    underlying: string;
    quoteError?: string | null;
    selectedExpiry: string | null;
    availableExpiries: string[];
    futureSymbol: string | null;
    futureLtp: number | null;
    strikes: ZerodhaOptionChainRow[];
}

export interface ZerodhaOptionChainParams {
    exchange?: string;
    underlying?: string;
    expiry?: string;
    maxStrikes?: number;
}

const DEFAULT_EXCHANGE = 'MCX';
const DEFAULT_UNDERLYING = 'NATURALGAS';
const DEFAULT_MAX_STRIKES = 30;

export async function fetchZerodhaOptionChain(
    credentials: ZerodhaCredentials,
    params: ZerodhaOptionChainParams = {}
): Promise<ZerodhaOptionChainResult> {
    const exchange = (params.exchange || DEFAULT_EXCHANGE).toUpperCase();
    const underlying = (params.underlying || DEFAULT_UNDERLYING).toUpperCase();
    const maxStrikes = normalizeMaxStrikes(params.maxStrikes);

    const instruments = await fetchZerodhaInstruments(credentials, exchange);
    const options = instruments.filter((inst) => isUnderlyingOption(inst, exchange, underlying));

    if (options.length === 0) {
        return {
            source: 'ZERODHA_KITE',
            fetchedAt: new Date().toISOString(),
            exchange,
            underlying,
            quoteError: null,
            selectedExpiry: null,
            availableExpiries: [],
            futureSymbol: null,
            futureLtp: null,
            strikes: []
        };
    }

    const availableExpiries = Array.from(
        new Set(options.map((opt) => opt.expiry).filter(Boolean))
    ).sort((a, b) => toDateTs(a) - toDateTs(b));

    const selectedExpiry = pickExpiry(availableExpiries, params.expiry);
    const expiryOptions = selectedExpiry
        ? options.filter((opt) => opt.expiry === selectedExpiry)
        : options;

    const future = pickNearestFuture(instruments, exchange, underlying);

    // Use instrument tokens for quote lookup to keep query length compact and avoid 403 from long URLs.
    const optionKeys = expiryOptions.map((opt) => String(opt.instrument_token));
    const quoteKeys = future ? [String(future.instrument_token), ...optionKeys] : optionKeys;

    let quotes: Record<string, ZerodhaQuote> = {};
    let quoteError: string | null = null;
    try {
        quotes = await fetchZerodhaQuotes(credentials, quoteKeys);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Quote fetch failed';
        if (message.includes('403') && message.toLowerCase().includes('insufficient permission')) {
            try {
                const ltpQuotes = await fetchZerodhaLtpQuotes(credentials, quoteKeys);
                quotes = mergeLtpAsQuoteMap(ltpQuotes);
                quoteError = 'Full quote depth/OI is blocked by Kite API permissions for this app/token. Showing LTP-only option chain. Enable Market Quote permission in Kite developer app for full chain.';
            } catch (ltpError) {
                const ltpMessage = ltpError instanceof Error ? ltpError.message : 'LTP quote fetch failed';
                quoteError = `Full quote permission error. LTP fallback also failed: ${ltpMessage}`;
            }
        } else {
            quoteError = message;
        }
        console.warn('Zerodha option chain quote warning:', quoteError);
    }

    const futureQuote = future ? getQuoteForInstrument(quotes, future) : undefined;
    const futureLtp = typeof futureQuote?.last_price === 'number' ? futureQuote.last_price : null;

    const trimmedOptions = trimToStrikeWindow(expiryOptions, futureLtp, maxStrikes);

    const strikeMap = new Map<number, ZerodhaOptionChainRow>();
    for (const instrument of trimmedOptions) {
        const quote = getQuoteForInstrument(quotes, instrument);
        const leg = buildOptionLeg(instrument, quote);

        const row = strikeMap.get(instrument.strike) || { strikePrice: instrument.strike };
        if (instrument.instrument_type === 'CE') {
            row.ce = leg;
        } else if (instrument.instrument_type === 'PE') {
            row.pe = leg;
        }
        strikeMap.set(instrument.strike, row);
    }

    const strikes = Array.from(strikeMap.values())
        .filter((row) => row.ce || row.pe)
        .sort((a, b) => a.strikePrice - b.strikePrice);

    return {
        source: 'ZERODHA_KITE',
        fetchedAt: new Date().toISOString(),
        exchange,
        underlying,
        quoteError,
        selectedExpiry: selectedExpiry || null,
        availableExpiries,
        futureSymbol: future?.tradingsymbol || null,
        futureLtp,
        strikes
    };
}

function normalizeMaxStrikes(input?: number): number {
    if (!input || !Number.isFinite(input)) {
        return DEFAULT_MAX_STRIKES;
    }
    return Math.max(5, Math.min(Math.floor(input), 200));
}

function isUnderlyingOption(
    instrument: ZerodhaInstrument,
    exchange: string,
    underlying: string
): boolean {
    if (instrument.exchange.toUpperCase() !== exchange) {
        return false;
    }

    if (instrument.instrument_type !== 'CE' && instrument.instrument_type !== 'PE') {
        return false;
    }

    return instrument.tradingsymbol.toUpperCase().startsWith(underlying);
}

function pickNearestFuture(
    instruments: ZerodhaInstrument[],
    exchange: string,
    underlying: string
): ZerodhaInstrument | null {
    const candidates = instruments
        .filter((inst) =>
            inst.exchange.toUpperCase() === exchange &&
            inst.instrument_type === 'FUT' &&
            inst.tradingsymbol.toUpperCase().startsWith(underlying)
        )
        .sort((a, b) => toDateTs(a.expiry) - toDateTs(b.expiry));

    if (candidates.length === 0) {
        return null;
    }

    const today = new Date();
    const todayTs = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const future = candidates.find((inst) => toDateTs(inst.expiry) >= todayTs);
    return future || candidates[0];
}

function pickExpiry(expiries: string[], requested?: string): string | null {
    if (expiries.length === 0) {
        return null;
    }

    if (requested && expiries.includes(requested)) {
        return requested;
    }

    const today = new Date();
    const todayTs = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const nearest = expiries.find((exp) => toDateTs(exp) >= todayTs);
    return nearest || expiries[0];
}

function toDateTs(yyyyMmDd: string): number {
    if (!yyyyMmDd) {
        return Number.MAX_SAFE_INTEGER;
    }

    const parsed = new Date(`${yyyyMmDd}T00:00:00Z`);
    const ts = parsed.getTime();
    return Number.isFinite(ts) ? ts : Number.MAX_SAFE_INTEGER;
}

function trimToStrikeWindow(
    options: ZerodhaInstrument[],
    futureLtp: number | null,
    maxStrikes: number
): ZerodhaInstrument[] {
    if (options.length <= maxStrikes * 2) {
        return options;
    }

    const uniqueStrikes = Array.from(new Set(options.map((inst) => inst.strike))).sort((a, b) => a - b);
    if (uniqueStrikes.length <= maxStrikes) {
        return options;
    }

    const target = futureLtp ?? uniqueStrikes[Math.floor(uniqueStrikes.length / 2)];
    let nearestIndex = 0;
    let minDist = Number.POSITIVE_INFINITY;

    for (let i = 0; i < uniqueStrikes.length; i++) {
        const dist = Math.abs(uniqueStrikes[i] - target);
        if (dist < minDist) {
            minDist = dist;
            nearestIndex = i;
        }
    }

    const half = Math.floor(maxStrikes / 2);
    const start = Math.max(0, nearestIndex - half);
    const end = Math.min(uniqueStrikes.length, start + maxStrikes);
    const selectedStrikes = new Set(uniqueStrikes.slice(start, end));

    return options.filter((inst) => selectedStrikes.has(inst.strike));
}

function buildOptionLeg(instrument: ZerodhaInstrument, quote?: ZerodhaQuote): ZerodhaOptionLegQuote {
    const bestBid = quote?.depth?.buy?.[0];
    const bestAsk = quote?.depth?.sell?.[0];
    const bestBidPrice = Number(bestBid?.price || 0);
    const bestAskPrice = Number(bestAsk?.price || 0);
    const spread = bestAskPrice > 0 && bestBidPrice > 0 ? bestAskPrice - bestBidPrice : 0;
    const mid = bestAskPrice > 0 && bestBidPrice > 0 ? (bestAskPrice + bestBidPrice) / 2 : 0;
    const spreadPercent = mid > 0 ? (spread / mid) * 100 : 0;

    return {
        tradingsymbol: instrument.tradingsymbol,
        instrumentToken: instrument.instrument_token,
        optionType: instrument.instrument_type as 'CE' | 'PE',
        strikePrice: instrument.strike,
        expiry: instrument.expiry,
        lotSize: instrument.lot_size,
        ltp: Number(quote?.last_price || 0),
        oi: Number(quote?.oi || 0),
        volume: Number(quote?.volume || 0),
        buyQuantity: Number(quote?.buy_quantity || 0),
        sellQuantity: Number(quote?.sell_quantity || 0),
        bestBidPrice,
        bestBidQuantity: Number(bestBid?.quantity || 0),
        bestAskPrice,
        bestAskQuantity: Number(bestAsk?.quantity || 0),
        spread,
        spreadPercent
    };
}

function getQuoteForInstrument(
    quotes: Record<string, ZerodhaQuote>,
    instrument: ZerodhaInstrument
): ZerodhaQuote | undefined {
    const byExchangeSymbol = quotes[`${instrument.exchange}:${instrument.tradingsymbol}`];
    if (byExchangeSymbol) {
        return byExchangeSymbol;
    }

    const byToken = quotes[String(instrument.instrument_token)];
    if (byToken) {
        return byToken;
    }

    // Fallback: some payloads may still key by exchange token.
    const byExchangeToken = quotes[String(instrument.exchange_token)];
    return byExchangeToken;
}

function mergeLtpAsQuoteMap(
    ltpQuotes: Record<string, ZerodhaLtpQuote>
): Record<string, ZerodhaQuote> {
    const merged: Record<string, ZerodhaQuote> = {};
    for (const [key, value] of Object.entries(ltpQuotes)) {
        merged[key] = {
            instrument_token: Number(value.instrument_token || 0),
            last_price: Number(value.last_price || 0)
        };
    }
    return merged;
}
