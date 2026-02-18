interface RupeezyGreeksRaw {
    delta?: number;
    theta?: number;
    gamma?: number;
    vega?: number;
    iv?: number;
}

interface RupeezyOptionLegRaw {
    token?: number;
    securityDesc?: string;
    optionType?: 'CE' | 'PE';
    strikePrice?: number;
    expYYYYMMDD?: string | number;
    lotSize?: number;
    ltp?: number;
    openInterest?: number;
    volume?: number;
    greeks?: RupeezyGreeksRaw;
}

interface RupeezyOptionDataRaw {
    strikePrice?: number;
    CE?: RupeezyOptionLegRaw;
    PE?: RupeezyOptionLegRaw;
}

interface RupeezyParentStockRaw {
    symbol?: string;
    livePrice?: number;
}

interface RupeezyCommoditySnapshotRaw {
    symbol?: string;
    security_desc?: string;
    canonical_url?: string;
    expiry_date?: string | number;
    has_option_chain?: boolean;
    ltp?: number;
    close?: number;
    percentage_change?: number;
}

interface RupeezyOptionChainPayloadRaw {
    symbol?: string;
    curExpDate?: number;
    expDates?: number[];
    optionData?: RupeezyOptionDataRaw[];
    parentStockData?: RupeezyParentStockRaw;
}

interface RupeezyOptionChainRaw {
    message?: string;
    status?: string;
    response?: RupeezyOptionChainPayloadRaw;
}

interface RupeezyLtpRaw {
    option_type?: string;
    scrip_token?: number;
    ltp?: number;
    total_quantity_traded?: number;
    open_interest?: number;
}

export interface RupeezyOptionLegQuote {
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

export interface RupeezyOptionChainRow {
    strikePrice: number;
    ce?: RupeezyOptionLegQuote;
    pe?: RupeezyOptionLegQuote;
}

export interface RupeezyOptionChainResult {
    source: 'RUPEEZY_PUBLIC';
    fetchedAt: string;
    exchange: string;
    underlying: string;
    quoteError?: string | null;
    selectedExpiry: string | null;
    availableExpiries: string[];
    futureSymbol: string | null;
    futureLtp: number | null;
    futureClose: number | null;
    futureChange: number | null;
    futureChangePercent: number | null;
    strikes: RupeezyOptionChainRow[];
}

export interface RupeezyOptionChainParams {
    exchange?: string;
    underlying?: string;
    expiry?: string | number;
    maxStrikes?: number;
}

const RUPEEZY_STOCKDATA_ENDPOINT = 'https://stockdata.rupeezy.in';
const RUPEEZY_CMS_ENDPOINT = 'https://cms.rupeezy.in';
const DEFAULT_EXCHANGE = 'MCX';
const DEFAULT_UNDERLYING = 'NATURALGAS';
const DEFAULT_MAX_STRIKES = 30;
const DEFAULT_LOT_SIZE = 1250;

export async function fetchRupeezyOptionChain(
    params: RupeezyOptionChainParams = {}
): Promise<RupeezyOptionChainResult> {
    const exchange = (params.exchange || DEFAULT_EXCHANGE).toUpperCase();
    const underlying = (params.underlying || DEFAULT_UNDERLYING).toUpperCase();
    const maxStrikes = normalizeMaxStrikes(params.maxStrikes);
    const requestedExpiry = normalizeExpiryQueryValue(params.expiry);

    const chain = await fetchRupeezyBaseChain(underlying, requestedExpiry);
    if (!chain.response || chain.status !== 'success') {
        throw new Error(chain.message || 'Rupeezy option chain returned invalid response');
    }

    const payload = chain.response;
    const availableExpiries = (payload.expDates || [])
        .map((value) => toIsoDate(value))
        .filter((value): value is string => Boolean(value));

    const selectedExpiry = toIsoDate(payload.curExpDate) || pickNearestExpiry(availableExpiries);
    const futureSnapshot = await fetchRupeezyCommoditySnapshot(underlying);
    const futureSymbol = futureSnapshot?.security_desc || payload.parentStockData?.symbol || underlying;
    const futureLtp = normalizePrice(futureSnapshot?.ltp ?? payload.parentStockData?.livePrice);
    const futureClose = normalizePrice(futureSnapshot?.close);
    const vendorPct = toFiniteOptional(futureSnapshot?.percentage_change) ?? null;
    const futureChange = (futureLtp > 0 && futureClose > 0)
        ? futureLtp - futureClose
        : vendorPct != null && futureLtp > 0
            ? (futureLtp * vendorPct) / 100
            : null;
    const futureChangePercent = (futureLtp > 0 && futureClose > 0)
        ? ((futureLtp - futureClose) / futureClose) * 100
        : vendorPct;

    let quoteError: string | null = null;
    let ltpByToken = new Map<number, RupeezyLtpRaw>();
    try {
        ltpByToken = await fetchRupeezyLtpMap(underlying);
    } catch (error) {
        quoteError = error instanceof Error ? error.message : 'Rupeezy LTP enrichment unavailable';
    }

    const rows: RupeezyOptionChainRow[] = [];
    for (const strike of payload.optionData || []) {
        const strikePriceRaw = strike.strikePrice ?? strike.CE?.strikePrice ?? strike.PE?.strikePrice;
        const strikePrice = normalizePrice(strikePriceRaw);
        if (!Number.isFinite(strikePrice) || strikePrice <= 0) {
            continue;
        }

        const row: RupeezyOptionChainRow = { strikePrice };
        if (strike.CE) {
            row.ce = buildLegQuote(
                strike.CE,
                'CE',
                strikePrice,
                selectedExpiry || '',
                underlying,
                ltpByToken
            );
        }
        if (strike.PE) {
            row.pe = buildLegQuote(
                strike.PE,
                'PE',
                strikePrice,
                selectedExpiry || '',
                underlying,
                ltpByToken
            );
        }

        if (row.ce || row.pe) {
            rows.push(row);
        }
    }

    rows.sort((a, b) => a.strikePrice - b.strikePrice);
    const trimmedRows = trimToStrikeWindow(rows, futureLtp ?? null, maxStrikes);

    return {
        source: 'RUPEEZY_PUBLIC',
        fetchedAt: new Date().toISOString(),
        exchange,
        underlying,
        quoteError,
        selectedExpiry: selectedExpiry || null,
        availableExpiries,
        futureSymbol,
        futureLtp: futureLtp ?? null,
        futureClose: futureClose > 0 ? futureClose : null,
        futureChange,
        futureChangePercent,
        strikes: trimmedRows
    };
}

async function fetchRupeezyBaseChain(underlying: string, expiry: number): Promise<RupeezyOptionChainRaw> {
    const query = new URLSearchParams({
        symbol: underlying,
        InstrumentType: 'mcx',
        ExpiryDate: String(expiry),
        AddGreek: 'true'
    });

    const response = await fetch(`${RUPEEZY_STOCKDATA_ENDPOINT}/flow/api/v1/stock/optionchain?${query.toString()}`, {
        cache: 'no-store',
        headers: {
            Accept: 'application/json',
            'User-Agent': 'Mozilla/5.0'
        }
    });

    if (!response.ok) {
        throw new Error(`Rupeezy option chain fetch failed: ${response.status}`);
    }

    return (await response.json()) as RupeezyOptionChainRaw;
}

async function fetchRupeezyLtpMap(underlying: string): Promise<Map<number, RupeezyLtpRaw>> {
    const response = await fetch(`${RUPEEZY_CMS_ENDPOINT}/flow/api/v1/optionchainltpsmcx/${encodeURIComponent(underlying)}`, {
        cache: 'no-store',
        headers: {
            Accept: 'application/json',
            'User-Agent': 'Mozilla/5.0'
        }
    });

    if (!response.ok) {
        throw new Error(`Rupeezy option-chain LTP fetch failed: ${response.status}`);
    }

    const payload = (await response.json()) as RupeezyLtpRaw[];
    const map = new Map<number, RupeezyLtpRaw>();
    for (const item of payload || []) {
        const token = toNum(item.scrip_token);
        if (token > 0) {
            map.set(token, item);
        }
    }
    return map;
}

function buildLegQuote(
    leg: RupeezyOptionLegRaw,
    optionType: 'CE' | 'PE',
    strikePrice: number,
    selectedExpiry: string,
    underlying: string,
    ltpByToken: Map<number, RupeezyLtpRaw>
): RupeezyOptionLegQuote {
    const instrumentToken = toNum(leg.token);
    const snapshot = ltpByToken.get(instrumentToken);
    const ltp = firstFinite(snapshot?.ltp, leg.ltp, 0);
    const oi = firstFinite(snapshot?.open_interest, leg.openInterest, 0);
    const volume = firstFinite(snapshot?.total_quantity_traded, leg.volume, 0);
    const expiry = toIsoDate(leg.expYYYYMMDD) || selectedExpiry;
    const lotSize = normalizeLotSize(leg.lotSize);
    const tradingsymbol = String(leg.securityDesc || '').trim() || `${underlying}${strikePrice}${optionType}`;
    const { bid, ask, spread, spreadPercent } = estimateBidAsk(ltp, oi, volume);

    return {
        tradingsymbol,
        instrumentToken,
        optionType,
        strikePrice,
        expiry,
        lotSize,
        ltp,
        oi,
        volume,
        buyQuantity: 0,
        sellQuantity: 0,
        bestBidPrice: bid,
        bestBidQuantity: 0,
        bestAskPrice: ask,
        bestAskQuantity: 0,
        spread,
        spreadPercent,
        delta: toFiniteOptional(leg.greeks?.delta),
        theta: toFiniteOptional(leg.greeks?.theta)
    };
}

async function fetchRupeezyCommoditySnapshot(underlying: string): Promise<RupeezyCommoditySnapshotRaw | null> {
    try {
        const response = await fetch(`${RUPEEZY_CMS_ENDPOINT}/flow/api/v1/commondities`, {
            cache: 'no-store',
            headers: {
                Accept: 'application/json',
                'User-Agent': 'Mozilla/5.0'
            }
        });

        if (!response.ok) {
            return null;
        }

        const payload = (await response.json()) as RupeezyCommoditySnapshotRaw[];
        const matches = (payload || [])
            .filter((row) => (row.symbol || '').toUpperCase() === underlying)
            .sort((a, b) => toYyyyMmDdTs(a.expiry_date) - toYyyyMmDdTs(b.expiry_date));

        if (matches.length === 0) {
            return null;
        }

        const now = Date.now();
        const current = matches.find((row) => toYyyyMmDdTs(row.expiry_date) >= now - 24 * 60 * 60 * 1000);
        return current || matches[0];
    } catch {
        return null;
    }
}

function normalizeMaxStrikes(input?: number): number {
    if (!input || !Number.isFinite(input)) {
        return DEFAULT_MAX_STRIKES;
    }
    return Math.max(5, Math.min(Math.floor(input), 200));
}

function normalizeLotSize(value?: number): number {
    const n = toNum(value);
    if (n <= 0) {
        return DEFAULT_LOT_SIZE;
    }

    return Math.floor(n);
}

function normalizeExpiryQueryValue(expiry?: string | number): number {
    if (typeof expiry === 'number' && Number.isFinite(expiry)) {
        return Math.floor(expiry);
    }

    if (typeof expiry !== 'string') {
        return 0;
    }

    const digits = expiry.replace(/\D/g, '');
    if (digits.length === 8) {
        return Number(digits);
    }

    return 0;
}

function toIsoDate(value?: string | number | null): string | null {
    if (value == null) {
        return null;
    }

    const digits = String(value).replace(/\D/g, '');
    if (digits.length !== 8) {
        return null;
    }

    const year = digits.slice(0, 4);
    const month = digits.slice(4, 6);
    const day = digits.slice(6, 8);
    return `${year}-${month}-${day}`;
}

function pickNearestExpiry(expiries: string[]): string | null {
    if (expiries.length === 0) {
        return null;
    }

    const now = Date.now();
    const nearest = expiries.find((exp) => toDateTs(exp) >= now);
    return nearest || expiries[0];
}

function trimToStrikeWindow(
    rows: RupeezyOptionChainRow[],
    spot: number | null,
    maxStrikes: number
): RupeezyOptionChainRow[] {
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

function normalizePrice(value: unknown): number {
    const num = toNum(value);
    if (!Number.isFinite(num) || num <= 0) {
        return 0;
    }

    // Rupeezy returns MCX commodity values in paise-like scaling for strike/spot.
    if (num > 5000) {
        return num / 100;
    }

    return num;
}

function estimateBidAsk(
    ltp: number,
    oi: number,
    volume: number
): { bid: number; ask: number; spread: number; spreadPercent: number } {
    if (!Number.isFinite(ltp) || ltp <= 0) {
        return { bid: 0, ask: 0, spread: 0, spreadPercent: 0 };
    }

    const tick = ltp >= 100 ? 0.1 : ltp >= 10 ? 0.05 : 0.01;
    const spreadFactor = volume >= 1000 && oi >= 3000
        ? 0.003
        : volume >= 200 && oi >= 1000
            ? 0.006
            : 0.012;

    const rawSpread = Math.max(tick * 2, ltp * spreadFactor);
    const halfSpread = rawSpread / 2;
    const bid = roundToTick(Math.max(0, ltp - halfSpread), tick);
    const ask = roundToTick(Math.max(bid + tick, ltp + halfSpread), tick);
    const spread = ask - bid;
    const mid = (ask + bid) / 2;
    const spreadPercent = mid > 0 ? (spread / mid) * 100 : 0;

    return {
        bid,
        ask,
        spread,
        spreadPercent
    };
}

function roundToTick(price: number, tick: number): number {
    if (tick <= 0) return price;
    return Math.round(price / tick) * tick;
}

function firstFinite(...values: Array<unknown>): number {
    for (const value of values) {
        const n = Number(value);
        if (Number.isFinite(n)) {
            return n;
        }
    }
    return 0;
}

function toFiniteOptional(value: unknown): number | undefined {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
}

function toNum(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function toDateTs(yyyyMmDd: string): number {
    if (!yyyyMmDd) {
        return Number.MAX_SAFE_INTEGER;
    }
    const ts = new Date(`${yyyyMmDd}T00:00:00Z`).getTime();
    return Number.isFinite(ts) ? ts : Number.MAX_SAFE_INTEGER;
}

function toYyyyMmDdTs(value?: string | number): number {
    if (value == null) return Number.MAX_SAFE_INTEGER;
    const digits = String(value).replace(/\D/g, '');
    if (digits.length !== 8) return Number.MAX_SAFE_INTEGER;
    const yyyyMmDd = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
    return toDateTs(yyyyMmDd);
}
