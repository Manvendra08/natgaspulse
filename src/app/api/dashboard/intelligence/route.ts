import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type SocialCategory = 'OFFICIAL' | 'WEATHER' | 'ANALYST';

interface SocialStreamItem {
    id: string;
    handle: string;
    role: string;
    category: SocialCategory;
    message: string;
    timestamp: string;
    verified: boolean;
}

interface MarketPulse {
    henryHub: {
        price: number | null;
        change: number | null;
        changePercent: number | null;
        asOf: string | null;
        source: 'yahoo-finance-ng-f' | 'unavailable';
    };
    mcxActive: {
        price: number | null;
        change: number | null;
        changePercent: number | null;
        asOf: string | null;
        source: 'tradingview-scanner' | 'unavailable';
    };
    spaceWeather: {
        kIndex: number | null;
        asOf: string | null;
        source: 'noaa-swpc-1m' | 'unavailable';
    };
}

interface YahooChartResult {
    timestamp?: number[];
    indicators?: {
        quote?: Array<{
            close?: Array<number | null>;
        }>;
    };
}

function toSigned(value: number | null, digits: number = 2): string {
    if (value == null || !Number.isFinite(value)) return '0.00';
    return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;
}

function toPercent(value: number | null): string {
    if (value == null || !Number.isFinite(value)) return '0.00%';
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function toContractLabel(offsetMonths: number): string {
    const now = new Date();
    const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offsetMonths, 1));
    return target.toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC'
    });
}

async function fetchHenryHubPulse() {
    try {
        const url = 'https://query1.finance.yahoo.com/v8/finance/chart/NG=F?interval=5m&range=5d';
        const response = await fetch(url, {
            cache: 'no-store',
            headers: {
                Accept: 'application/json',
                'User-Agent': 'Mozilla/5.0'
            }
        });
        if (!response.ok) return null;

        const payload = await response.json();
        const result = payload?.chart?.result?.[0] as YahooChartResult | undefined;
        const timestamps = result?.timestamp || [];
        const closes = result?.indicators?.quote?.[0]?.close || [];
        const valid = timestamps
            .map((ts, idx) => ({ ts, close: closes[idx] }))
            .filter((row) => Number.isFinite(row.close));

        if (!valid.length) return null;

        const current = valid[valid.length - 1];
        const previous = valid[valid.length - 2] || current;
        const currentClose = Number(current.close);
        const previousClose = Number(previous.close);
        const change = currentClose - previousClose;
        const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0;

        return {
            price: currentClose,
            change,
            changePercent,
            asOf: new Date(current.ts * 1000).toISOString()
        };
    } catch {
        return null;
    }
}

async function fetchTradingViewMcxActivePulse() {
    try {
        const response = await fetch('https://scanner.tradingview.com/global/scan', {
            method: 'POST',
            cache: 'no-store',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            body: JSON.stringify({
                symbols: {
                    tickers: ['MCX:NATURALGAS1!'],
                    query: { types: [] }
                },
                columns: ['close', 'change', 'change_abs', 'description', 'name']
            })
        });

        if (!response.ok) return null;

        const payload = await response.json() as {
            data?: Array<{ d?: unknown[] }>;
        };
        const row = payload?.data?.[0]?.d || [];
        const close = Number(row[0]);
        const changePercent = Number(row[1]);
        const change = Number(row[2]);

        if (!Number.isFinite(close) || close <= 0) return null;

        return {
            price: close,
            change: Number.isFinite(change) ? change : null,
            changePercent: Number.isFinite(changePercent) ? changePercent : null,
            asOf: new Date().toISOString()
        };
    } catch {
        return null;
    }
}

async function fetchNoaaKpIndex() {
    try {
        const response = await fetch('https://services.swpc.noaa.gov/json/planetary_k_index_1m.json', {
            cache: 'no-store',
            headers: {
                Accept: 'application/json'
            }
        });
        if (!response.ok) return null;

        const payload = await response.json() as Array<{ time_tag?: string; estimated_kp?: number; kp_index?: number }>;
        const latest = payload?.[payload.length - 1];
        if (!latest) return null;

        const kIndex = Number(latest.estimated_kp ?? latest.kp_index);
        if (!Number.isFinite(kIndex)) return null;

        return {
            kIndex,
            asOf: latest.time_tag ? new Date(latest.time_tag).toISOString() : new Date().toISOString()
        };
    } catch {
        return null;
    }
}

export async function GET() {
    const generatedAt = new Date().toISOString();

    const [henryHubPulse, mcxPulse, kpPulse] = await Promise.all([
        fetchHenryHubPulse(),
        fetchTradingViewMcxActivePulse(),
        fetchNoaaKpIndex()
    ]);

    const market: MarketPulse = {
        henryHub: {
            price: henryHubPulse?.price ?? null,
            change: henryHubPulse?.change ?? null,
            changePercent: henryHubPulse?.changePercent ?? null,
            asOf: henryHubPulse?.asOf ?? null,
            source: henryHubPulse ? 'yahoo-finance-ng-f' : 'unavailable'
        },
        mcxActive: {
            price: mcxPulse?.price ?? null,
            change: mcxPulse?.change ?? null,
            changePercent: mcxPulse?.changePercent ?? null,
            asOf: mcxPulse?.asOf ?? null,
            source: mcxPulse ? 'tradingview-scanner' : 'unavailable'
        },
        spaceWeather: {
            kIndex: kpPulse?.kIndex ?? null,
            asOf: kpPulse?.asOf ?? null,
            source: kpPulse ? 'noaa-swpc-1m' : 'unavailable'
        }
    };

    const socialStream: SocialStreamItem[] = [];

    if (market.henryHub.price != null) {
        socialStream.push({
            id: `hh-${Date.now()}`,
            handle: 'EIAgov',
            role: 'EIA / Henry Hub Monitor',
            category: 'OFFICIAL',
            message: `Henry Hub print ${market.henryHub.price.toFixed(3)} USD/MMBtu (${toPercent(market.henryHub.changePercent)} | ${toSigned(market.henryHub.change)}).`,
            timestamp: market.henryHub.asOf || generatedAt,
            verified: true
        });
    }

    if (market.mcxActive.price != null) {
        socialStream.push({
            id: `mcx-${Date.now() + 1}`,
            handle: 'MCXDeskPulse',
            role: 'MCX Natural Gas Tape',
            category: 'OFFICIAL',
            message: `MCX NATURALGAS active (${toContractLabel(0)}) at INR ${market.mcxActive.price.toFixed(2)} (${toPercent(market.mcxActive.changePercent)}).`,
            timestamp: market.mcxActive.asOf || generatedAt,
            verified: true
        });
    }

    if (market.spaceWeather.kIndex != null) {
        socialStream.push({
            id: `kp-${Date.now() + 2}`,
            handle: 'NWSSWPC',
            role: 'NOAA Space Weather',
            category: 'WEATHER',
            message: `Real-time geomagnetic monitor: estimated K-index ${market.spaceWeather.kIndex.toFixed(2)}. Grid volatility watch is ${market.spaceWeather.kIndex >= 5 ? 'elevated' : 'normal'}.`,
            timestamp: market.spaceWeather.asOf || generatedAt,
            verified: true
        });
    }

    socialStream.push({
        id: `analyst-${Date.now() + 3}`,
        handle: 'NatGasFlowIntel',
        role: 'Cross-Market Analyst',
        category: 'ANALYST',
        message: `Cross-asset pulse: Henry Hub ${toPercent(market.henryHub.changePercent)} vs MCX ${toPercent(market.mcxActive.changePercent)}. Monitoring basis direction for active/next-month spread behavior.`,
        timestamp: generatedAt,
        verified: true
    });

    return NextResponse.json(
        {
            generatedAt,
            market,
            socialStream
        },
        {
            status: 200,
            headers: {
                'Cache-Control': 'no-store, max-age=0'
            }
        }
    );
}
