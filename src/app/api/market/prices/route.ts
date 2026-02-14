import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') || '1mo';
    const interval = searchParams.get('interval') || '1d';

    try {
        // NG=F (Active - Mar 26), NGJ26.NYM (Next - Apr 26)
        const symbols = ['NG=F', 'NGJ26.NYM'];
        const results = await Promise.all(symbols.map(async (symbol) => {
            const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval}&range=${range}`;
            const res = await fetch(url, { next: { revalidate: 300 } });
            if (!res.ok) return null;
            return res.json();
        }));

        const activeData = results[0]?.chart?.result?.[0];
        const nextData = results[1]?.chart?.result?.[0];

        if (!activeData) throw new Error('Failed to fetch active market data');

        const processContract = (data: any) => {
            const timestamps = data.timestamp;
            const indicators = data.indicators.quote[0];
            const { open, high, low, close } = indicators;

            const prices = timestamps.map((ts: number, i: number) => ({
                period: new Date(ts * 1000).toISOString().split('T')[0],
                time: ts,
                open: open[i],
                high: high[i],
                low: low[i],
                value: close[i],
                close: close[i]
            })).filter((p: any) => p.value !== null);

            const current = prices[prices.length - 1];
            const previous = prices[prices.length - 2];
            const change = current.close - previous.close;
            const changePercent = ((change / previous.close) * 100).toFixed(2);

            return { current, change, changePercent, prices };
        };

        const active = processContract(activeData);
        const next = nextData ? processContract(nextData) : null;

        return NextResponse.json({
            current: active.current.close,
            date: active.current.period,
            change: active.change,
            changePercent: active.changePercent,
            historicalPrices: active.prices,
            nextMonth: next ? {
                current: next.current.close,
                change: next.change,
                changePercent: next.changePercent
            } : null
        });
    } catch (error: any) {
        console.error('Market Price API error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch live market data' },
            { status: 500 }
        );
    }
}
