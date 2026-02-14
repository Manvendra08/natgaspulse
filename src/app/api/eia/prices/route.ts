import { NextResponse } from 'next/server';
import { fetchHenryHubPrices } from '@/lib/api-clients/eia';

export async function GET() {
    try {
        const prices = await fetchHenryHubPrices(400);

        if (!prices || prices.length === 0) {
            return NextResponse.json(
                { error: 'No price data available' },
                { status: 404 }
            );
        }

        const current = prices[0];
        const previous = prices[1];
        const change = current.value - previous.value;
        const changePercent = ((change / previous.value) * 100).toFixed(2);

        return NextResponse.json({
            current: current.value,
            date: current.period,
            change,
            changePercent,
            historicalPrices: prices.reverse()
        });
    } catch (error) {
        console.error('Price API error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch price data' },
            { status: 500 }
        );
    }
}
