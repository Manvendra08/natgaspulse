import {
    fetchDhanOptionChainRaw,
    mapDhanSegId,
    resolveDhanUnderlyingInstrument,
    type DhanCredentials,
    type DhanFutureLegRaw,
    type DhanOptionChainRaw,
    type DhanOptionLegRaw
} from '@/lib/api-clients/dhan';

export interface DhanOptionLegQuote {
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
    delta?: number;
    theta?: number;
}

export interface DhanOptionChainRow {
    strikePrice: number;
    ce?: DhanOptionLegQuote;
    pe?: DhanOptionLegQuote;
}

export interface DhanOptionChainResult {
    source: 'DHAN_SCANX';
    fetchedAt: string;
    exchange: string;
    underlying: string;
    quoteError?: string | null;
    selectedExpiry: string | null;
    availableExpiries: string[];
    futureSymbol: string | null;
    futureLtp: number | null;
    strikes: DhanOptionChainRow[];
}

export interface DhanOptionChainParams {
    exchange?: string;
    segment?: string;
    underlying?: string;
    expiry?: string | number;
    maxStrikes?: number;
    segId?: number;
    underlyingSid?: number;
}

const DEFAULT_EXCHANGE = 'MCX';
const DEFAULT_SEGMENT = 'M';
const DEFAULT_UNDERLYING = 'NATURALGAS';
const DEFAULT_MAX_STRIKES = 30;
const DHAN_JULIAN_BASE_MS = Date.parse('1980-01-01T00:00:00+05:30');

export async function fetchDhanOptionChain(
    credentials: DhanCredentials,
    params: DhanOptionChainParams = {}
): Promise<DhanOptionChainResult> {
    const exchange = (params.exchange || DEFAULT_EXCHANGE).toUpperCase();
    const segment = (params.segment || DEFAULT_SEGMENT).toUpperCase();
    const underlying = (params.underlying || DEFAULT_UNDERLYING).toUpperCase();
    const maxStrikes = normalizeMaxStrikes(params.maxStrikes);

    const segId = params.segId ?? mapDhanSegId(exchange, segment);
    if (!Number.isFinite(segId) || segId < 0) {
        throw new Error(`Unsupported Dhan segment mapping for ${exchange}:${segment}`);
    }

    const resolvedUnderlying = params.underlyingSid
        ? null
        : await resolveDhanUnderlyingInstrument(exchange, segment, underlying);

    const underlyingSid = params.underlyingSid ?? resolvedUnderlying?.securityId;
    if (!underlyingSid || !Number.isFinite(underlyingSid)) {
        throw new Error(`Could not resolve Dhan security ID for ${exchange}:${underlying}`);
    }

    const expiry = normalizeExpiryParam(params.expiry);
    const raw = await fetchDhanOptionChainRaw(credentials, {
        segId,
        underlyingSid,
        expiry
    });

    return mapRawToChainResult(raw, {
        exchange,
        underlying,
        fallbackFutureSymbol: resolvedUnderlying?.tradingSymbol || null,
        maxStrikes
    });
}

function mapRawToChainResult(
    raw: DhanOptionChainRaw,
    context: {
        exchange: string;
        underlying: string;
        fallbackFutureSymbol: string | null;
        maxStrikes: number;
    }
): DhanOptionChainResult {
    const expiryList = (raw.explst || [])
        .map((julian) => toDateStringFromDhanJulian(julian))
        .filter(Boolean) as string[];

    const availableExpiries = Array.from(new Set(expiryList)).sort((a, b) => toDateTs(a) - toDateTs(b));
    const selectedExpiry = pickNearestExpiry(availableExpiries);
    const lotSize = toNum(raw.olot) || 1;
    const spot = toNum(raw.sltp);

    const rows: DhanOptionChainRow[] = [];
    const strikes = raw.oc || {};
    for (const [strikeKey, value] of Object.entries(strikes)) {
        const strikePrice = Number(strikeKey);
        if (!Number.isFinite(strikePrice) || strikePrice <= 0) continue;

        const row: DhanOptionChainRow = { strikePrice };
        if (value.ce) {
            row.ce = buildLegQuote(value.ce, 'CE', strikePrice, lotSize, selectedExpiry || '');
        }
        if (value.pe) {
            row.pe = buildLegQuote(value.pe, 'PE', strikePrice, lotSize, selectedExpiry || '');
        }

        if (row.ce || row.pe) {
            rows.push(row);
        }
    }

    rows.sort((a, b) => a.strikePrice - b.strikePrice);
    const trimmedRows = trimToStrikeWindow(rows, spot || null, context.maxStrikes);
    const future = pickNearestFuture(raw.fl);

    return {
        source: 'DHAN_SCANX',
        fetchedAt: new Date().toISOString(),
        exchange: (raw.exch || context.exchange || '').toUpperCase(),
        underlying: context.underlying,
        quoteError: null,
        selectedExpiry: selectedExpiry || null,
        availableExpiries,
        futureSymbol: future?.symbol || context.fallbackFutureSymbol,
        futureLtp: future?.ltp ?? (spot || null),
        strikes: trimmedRows
    };
}

function buildLegQuote(
    leg: DhanOptionLegRaw,
    optionType: 'CE' | 'PE',
    strikePrice: number,
    lotSize: number,
    expiry: string
): DhanOptionLegQuote {
    const ltp = toNum(leg.ltp);
    const bid = toNum(leg.bp);
    const ask = toNum(leg.ap);
    const bestBidPrice = bid > 0 ? bid : ltp;
    const bestAskPrice = ask > 0 ? ask : ltp;
    const spread = bestAskPrice > 0 && bestBidPrice > 0 ? bestAskPrice - bestBidPrice : 0;
    const mid = bestAskPrice > 0 && bestBidPrice > 0 ? (bestAskPrice + bestBidPrice) / 2 : 0;
    const spreadPercent = mid > 0 ? (spread / mid) * 100 : 0;

    return {
        tradingsymbol: String(leg.disp_sym || leg.sym || '').trim() || `${strikePrice}${optionType}`,
        instrumentToken: toNum(leg.sid),
        optionType,
        strikePrice,
        expiry,
        lotSize,
        ltp,
        oi: toNum(leg.OI),
        volume: toNum(leg.vol),
        buyQuantity: toNum(leg.bq),
        sellQuantity: toNum(leg.aq),
        bestBidPrice,
        bestBidQuantity: 0,
        bestAskPrice,
        bestAskQuantity: 0,
        spread,
        spreadPercent,
        delta: toNum(leg.optgeeks?.delta),
        theta: toNum(leg.optgeeks?.theta)
    };
}

function pickNearestFuture(
    fl?: Record<string, DhanFutureLegRaw>
): { symbol: string | null; ltp: number | null } | null {
    if (!fl || typeof fl !== 'object') {
        return null;
    }

    const items = Object.values(fl)
        .map((item) => ({
            symbol: String(item.disp_sym || item.sym || '').trim() || null,
            ltp: toNum(item.ltp) || null,
            daystoexp: toNum(item.daystoexp),
            expdate: toNum(item.expdate)
        }))
        .filter((item) => item.symbol || item.ltp != null);

    if (items.length === 0) {
        return null;
    }

    items.sort((a, b) => {
        const aExp = a.daystoexp || a.expdate || Number.MAX_SAFE_INTEGER;
        const bExp = b.daystoexp || b.expdate || Number.MAX_SAFE_INTEGER;
        return aExp - bExp;
    });

    return {
        symbol: items[0].symbol,
        ltp: items[0].ltp
    };
}

function trimToStrikeWindow(
    rows: DhanOptionChainRow[],
    spot: number | null,
    maxStrikes: number
): DhanOptionChainRow[] {
    if (rows.length <= maxStrikes) {
        return rows;
    }

    const target = spot ?? rows[Math.floor(rows.length / 2)].strikePrice;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < rows.length; i++) {
        const distance = Math.abs(rows[i].strikePrice - target);
        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestIndex = i;
        }
    }

    const half = Math.floor(maxStrikes / 2);
    const start = Math.max(0, nearestIndex - half);
    const end = Math.min(rows.length, start + maxStrikes);
    return rows.slice(start, end);
}

function normalizeMaxStrikes(input?: number): number {
    if (!input || !Number.isFinite(input)) {
        return DEFAULT_MAX_STRIKES;
    }
    return Math.max(5, Math.min(Math.floor(input), 200));
}

function normalizeExpiryParam(expiry?: string | number): number {
    if (typeof expiry === 'number' && Number.isFinite(expiry)) {
        return Math.floor(expiry);
    }
    return -1;
}

function pickNearestExpiry(expiries: string[]): string | null {
    if (expiries.length === 0) return null;

    const now = Date.now();
    const nearest = expiries.find((exp) => toDateTs(exp) >= now);
    return nearest || expiries[0];
}

function toDateStringFromDhanJulian(value: number): string | null {
    if (!Number.isFinite(value)) return null;
    const ts = DHAN_JULIAN_BASE_MS + Number(value) * 1000;
    const date = new Date(ts);
    if (!Number.isFinite(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
}

function toNum(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function toDateTs(yyyyMmDd: string): number {
    if (!yyyyMmDd) return Number.MAX_SAFE_INTEGER;
    const ts = new Date(`${yyyyMmDd}T00:00:00Z`).getTime();
    return Number.isFinite(ts) ? ts : Number.MAX_SAFE_INTEGER;
}
