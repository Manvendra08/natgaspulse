import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type YahooChartResult = {
    timestamp?: number[];
    indicators?: {
        quote?: Array<{
            open?: Array<number | null>;
            high?: Array<number | null>;
            low?: Array<number | null>;
            close?: Array<number | null>;
        }>;
    };
    meta?: {
        previousClose?: number;
        chartPreviousClose?: number;
    };
};

interface PricePoint {
    period: string;
    time: number;
    open: number;
    high: number;
    low: number;
    value: number;
    close: number;
}

interface ContractSummary {
    current: PricePoint;
    previousClose: number;
    change: number;
    changePercent: string;
    prices: PricePoint[];
}

async function fetchYahooChart(symbol: string, interval: string, range: string): Promise<YahooChartResult | null> {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(range)}`;
    const res = await fetch(url, {
        cache: 'no-store',
        headers: {
            Accept: 'application/json',
            'User-Agent': 'Mozilla/5.0'
        }
    });

    if (!res.ok) return null;
    const payload = await res.json();
    return payload?.chart?.result?.[0] || null;
}

function processContract(data: YahooChartResult | null): ContractSummary | null {
    if (!data?.timestamp?.length || !data?.indicators?.quote?.[0]) return null;

    const timestamps = data.timestamp;
    const indicators = data.indicators.quote[0];
    const { open = [], high = [], low = [], close = [] } = indicators;

    const prices: PricePoint[] = timestamps
        .map((ts, i) => {
            const pointOpen = open[i];
            const pointHigh = high[i];
            const pointLow = low[i];
            const pointClose = close[i];

            if (
                pointOpen == null ||
                pointHigh == null ||
                pointLow == null ||
                pointClose == null ||
                !Number.isFinite(pointClose)
            ) {
                return null;
            }

            return {
                period: new Date(ts * 1000).toISOString().split('T')[0],
                time: ts,
                open: pointOpen,
                high: pointHigh,
                low: pointLow,
                value: pointClose,
                close: pointClose
            };
        })
        .filter((point): point is PricePoint => point !== null);

    if (!prices.length) return null;

    const current = prices[prices.length - 1];
    const previous = prices[prices.length - 2];
    const previousClose = previous?.close
        ?? data.meta?.chartPreviousClose
        ?? data.meta?.previousClose
        ?? current.close;

    const safePrevClose = Number.isFinite(previousClose) && previousClose > 0 ? previousClose : current.close;
    const change = current.close - safePrevClose;
    const changePercent = safePrevClose === 0 ? '0.00' : ((change / safePrevClose) * 100).toFixed(2);

    return {
        current,
        previousClose: safePrevClose,
        change,
        changePercent,
        prices
    };
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') || '1mo';
    const interval = searchParams.get('interval') || '1d';

    try {
        // NOTE: Intraday pull is used for near-real-time current/change values.
        // Historical series still follows caller-selected range/interval.
        const [
            activeHistoryRaw,
            nextHistoryRaw,
            activeIntradayRaw,
            nextIntradayRaw
        ] = await Promise.all([
            fetchYahooChart('NG=F', interval, range),
            fetchYahooChart('NGJ26.NYM', interval, range),
            fetchYahooChart('NG=F', '5m', '5d'),
            fetchYahooChart('NGJ26.NYM', '5m', '5d')
        ]);

        const activeHistory = processContract(activeHistoryRaw);
        const nextHistory = processContract(nextHistoryRaw);
        const activeIntraday = processContract(activeIntradayRaw);
        const nextIntraday = processContract(nextIntradayRaw);

        if (!activeHistory && !activeIntraday) {
            throw new Error('Failed to fetch active market data');
        }

        const active = activeIntraday || activeHistory;
        const next = nextIntraday || nextHistory;
        if (!active) {
            throw new Error('Active contract payload unavailable');
        }

        return NextResponse.json({
            current: active.current.close,
            date: new Date(active.current.time * 1000).toISOString(),
            change: active.change,
            changePercent: active.changePercent,
            historicalPrices: activeHistory?.prices || active.prices,
            nextMonth: next ? {
                current: next.current.close,
                change: next.change,
                changePercent: next.changePercent
            } : null,
            source: 'yahoo-finance-ng-f',
            asOf: new Date(active.current.time * 1000).toISOString()
        });
    } catch (error: any) {
        console.error('Market Price API error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch live market data' },
            { status: 500 }
        );
    }
}
