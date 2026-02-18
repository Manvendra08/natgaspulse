import { NextResponse } from 'next/server';
import { fetchZerodhaPositions, type ZerodhaCredentials } from '@/lib/api-clients/zerodha';
import { analyzePositions, type MarketCondition } from '@/lib/utils/position-analyzer';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { apiKey, accessToken } = body as ZerodhaCredentials;

        if (!apiKey || !accessToken) {
            return NextResponse.json(
                { error: 'Missing Zerodha credentials' },
                { status: 400 }
            );
        }

        // Fetch positions from Zerodha
        const positions = await fetchZerodhaPositions({ apiKey, accessToken });

        // Fetch current market condition (from existing signal API)
        const marketCondition = await fetchMarketCondition(request.url, request.headers.get('cookie'));

        // Analyze positions and generate recommendations
        const analysis = await analyzePositions(positions, marketCondition);

        return NextResponse.json({
            timestamp: new Date().toISOString(),
            positionCount: positions.length,
            totalPnL: positions.reduce((sum, p) => sum + (p.pnl || 0), 0),
            marketCondition,
            positions: analysis.positions,
            portfolio: analysis.portfolio
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Position analysis failed';
        console.error('Position Monitor API error:', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/**
 * Fetch current market condition from Signal API
 */
async function fetchMarketCondition(requestUrl: string, cookieHeader?: string | null): Promise<MarketCondition> {
    try {
        // Call internal signal API while forwarding caller auth cookies.
        const signalApiUrl = new URL('/api/signals', requestUrl).toString();
        const response = await fetch(signalApiUrl, {
            cache: 'no-store',
            headers: cookieHeader ? { cookie: cookieHeader } : undefined
        });

        if (!response.ok) {
            throw new Error('Failed to fetch market signals');
        }

        const data = await response.json();

        // Extract market condition from signal data
        const dailyTF = data.timeframes?.find((tf: any) => tf.timeframe === '1D');

        return {
            trend: data.overallSignal === 'BUY' ? 'BULLISH' :
                data.overallSignal === 'SELL' ? 'BEARISH' : 'NEUTRAL',
            volatility: data.marketCondition === 'VOLATILE' ? 'HIGH' :
                data.marketCondition === 'RANGING' ? 'LOW' : 'MEDIUM',
            rsi: dailyTF?.indicators?.rsi || undefined,
            atr: dailyTF?.indicators?.atr || undefined,
            underlyingPrice: data.currentPrice // Pass the current price for Greeks
        };
    } catch (error) {
        console.warn('Failed to fetch market condition, using defaults:', error);
        // Fallback to neutral market
        return {
            trend: 'NEUTRAL',
            volatility: 'MEDIUM'
        };
    }
}
