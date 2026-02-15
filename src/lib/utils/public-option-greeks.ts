import { parseOptionSymbol } from './symbol-parser';

export interface PublicOptionGreeks {
    delta: number;
    theta: number;
}

interface UpstoxUnderlier {
    underlierIk: string;
    underlierName: string;
    expiries: string[];
}

interface UpstoxUnderlierResponse {
    data?: {
        symbolExpiryDataList?: UpstoxUnderlier[];
    };
    success?: boolean;
}

interface StrategyAnalytics {
    delta?: number;
    theta?: number;
}

interface StrategyOptionData {
    analytics?: StrategyAnalytics;
}

interface StrategyStrikeData {
    callOptionData?: StrategyOptionData;
    putOptionData?: StrategyOptionData;
}

interface StrategyChainResponse {
    data?: {
        strategyChainData?: {
            strikeMap?: Record<string, StrategyStrikeData>;
        };
    };
    success?: boolean;
    errorData?: {
        errorCode?: number;
        description?: string;
    };
}

const UPSTOX_BASE_URL = 'https://service.upstox.com';
const UPSTOX_PUBLIC_API_KEY = process.env.UPSTOX_PUBLIC_API_KEY || 'da0d5ff8-a220-4b90-9940-a61664513c2c';
const CACHE_TTL_MS = 60 * 1000;

const chainCache = new Map<string, { fetchedAt: number; data: Map<string, PublicOptionGreeks> }>();

function toDdMmYyyy(date: Date): string {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
}

function normalizeUnderlying(underlying: string): string {
    return underlying.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseDdMmYyyy(value: string): Date | null {
    const match = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (!match) return null;

    const day = Number(match[1]);
    const month = Number(match[2]) - 1;
    const year = Number(match[3]);
    const date = new Date(year, month, day);

    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month ||
        date.getDate() !== day
    ) {
        return null;
    }

    return date;
}

function sortExpiriesByDistance(expiries: string[], targetExpiry: Date): string[] {
    const target = new Date(targetExpiry.getFullYear(), targetExpiry.getMonth(), targetExpiry.getDate()).getTime();
    const ranked: Array<{ expiry: string; diff: number }> = [];

    for (const expiry of expiries) {
        const parsed = parseDdMmYyyy(expiry);
        if (!parsed) continue;
        const expiryTs = parsed.getTime();
        const diff = Math.abs(expiryTs - target);
        ranked.push({ expiry, diff });
    }

    ranked.sort((a, b) => a.diff - b.diff);
    return ranked.map((item) => item.expiry);
}

async function fetchUnderliersForName(name: string): Promise<UpstoxUnderlier[]> {
    const url = `${UPSTOX_BASE_URL}/instrument/v1/open/fnOUnderlierSymbolsWithExpiry?name=${encodeURIComponent(name)}`;
    const res = await fetch(url, {
        headers: {
            'Accept': 'application/json',
            'x-api-key': UPSTOX_PUBLIC_API_KEY
        },
        next: { revalidate: 60 }
    });

    if (!res.ok) {
        return [];
    }

    const data = await res.json() as UpstoxUnderlierResponse;
    return data.data?.symbolExpiryDataList ?? [];
}

async function fetchStrategyChain(assetKey: string, expiry: string): Promise<Map<string, PublicOptionGreeks> | null> {
    const url = `${UPSTOX_BASE_URL}/option-analytics-tool/open/v1/strategy-chains?assetKey=${encodeURIComponent(assetKey)}&strategyChainType=PC_CHAIN&expiry=${encodeURIComponent(expiry)}`;

    const res = await fetch(url, {
        headers: {
            'Accept': 'application/json',
            'x-api-key': UPSTOX_PUBLIC_API_KEY
        },
        next: { revalidate: 30 }
    });

    if (!res.ok) {
        return null;
    }

    const payload = await res.json() as StrategyChainResponse;
    if (!payload.success) {
        return null;
    }

    const strikeMap = payload.data?.strategyChainData?.strikeMap;
    if (!strikeMap) {
        return null;
    }

    const result = new Map<string, PublicOptionGreeks>();
    for (const [strikeKey, strikeData] of Object.entries(strikeMap)) {
        const strike = Number(strikeKey);
        if (Number.isNaN(strike)) continue;

        const ceAnalytics = strikeData.callOptionData?.analytics;
        if (ceAnalytics && typeof ceAnalytics.delta === 'number' && typeof ceAnalytics.theta === 'number') {
            result.set(`${strike}:CE`, { delta: ceAnalytics.delta, theta: ceAnalytics.theta });
        }

        const peAnalytics = strikeData.putOptionData?.analytics;
        if (peAnalytics && typeof peAnalytics.delta === 'number' && typeof peAnalytics.theta === 'number') {
            result.set(`${strike}:PE`, { delta: peAnalytics.delta, theta: peAnalytics.theta });
        }
    }

    return result;
}

function findStrikeGreeks(
    chain: Map<string, PublicOptionGreeks>,
    strike: number,
    type: 'CE' | 'PE'
): PublicOptionGreeks | null {
    const direct = chain.get(`${strike}:${type}`);
    if (direct) return direct;

    // Handle minor floating-point formatting differences (e.g., 260 vs 260.0).
    for (const [key, value] of chain.entries()) {
        const [strikeStr, optType] = key.split(':');
        if (optType !== type) continue;
        const chainStrike = Number(strikeStr);
        if (!Number.isNaN(chainStrike) && Math.abs(chainStrike - strike) < 1e-6) {
            return value;
        }
    }

    return null;
}

async function getChainForUnderlyingAndExpiry(
    underlying: string,
    expiryDate: Date
): Promise<Map<string, PublicOptionGreeks> | null> {
    const cacheKey = `${normalizeUnderlying(underlying)}|${toDdMmYyyy(expiryDate)}`;
    const cached = chainCache.get(cacheKey);
    const now = Date.now();

    if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
        return cached.data;
    }

    const candidates = await fetchUnderliersForName(normalizeUnderlying(underlying));
    if (!candidates.length) {
        return null;
    }

    const normalizedUnderlying = normalizeUnderlying(underlying);
    const orderedCandidates = [
        ...candidates.filter((item) => normalizeUnderlying(item.underlierName) === normalizedUnderlying),
        ...candidates.filter((item) => normalizeUnderlying(item.underlierName) !== normalizedUnderlying)
    ];

    for (const candidate of orderedCandidates) {
        const rankedExpiries = sortExpiriesByDistance(candidate.expiries || [], expiryDate);
        for (const expiry of rankedExpiries) {
            const chain = await fetchStrategyChain(candidate.underlierIk, expiry);
            if (chain) {
                chainCache.set(cacheKey, { fetchedAt: now, data: chain });
                return chain;
            }
        }
    }

    return null;
}

export async function fetchGreeksForPositions(
    tradingSymbols: string[]
): Promise<Map<string, PublicOptionGreeks>> {
    const result = new Map<string, PublicOptionGreeks>();

    const parsedSymbols = tradingSymbols
        .map((symbol) => {
            const parsed = parseOptionSymbol(symbol);
            if (!parsed) return null;
            return { symbol, parsed };
        })
        .filter((item): item is { symbol: string; parsed: NonNullable<ReturnType<typeof parseOptionSymbol>> } => item !== null);

    const uniqueLookups = new Map<string, { underlying: string; expiryDate: Date }>();
    for (const item of parsedSymbols) {
        const key = `${normalizeUnderlying(item.parsed.symbol)}|${toDdMmYyyy(item.parsed.expiryDate)}`;
        if (!uniqueLookups.has(key)) {
            uniqueLookups.set(key, { underlying: item.parsed.symbol, expiryDate: item.parsed.expiryDate });
        }
    }

    const chainByLookup = new Map<string, Map<string, PublicOptionGreeks>>();
    await Promise.all(
        Array.from(uniqueLookups.entries()).map(async ([key, lookup]) => {
            const chain = await getChainForUnderlyingAndExpiry(lookup.underlying, lookup.expiryDate);
            if (chain) {
                chainByLookup.set(key, chain);
            }
        })
    );

    for (const item of parsedSymbols) {
        const lookupKey = `${normalizeUnderlying(item.parsed.symbol)}|${toDdMmYyyy(item.parsed.expiryDate)}`;
        const chain = chainByLookup.get(lookupKey);
        if (!chain) continue;

        const greeks = findStrikeGreeks(chain, item.parsed.strike, item.parsed.type);
        if (greeks) {
            result.set(item.symbol, greeks);
        }
    }

    return result;
}
