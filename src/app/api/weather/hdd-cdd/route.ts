import { NextResponse } from 'next/server';
import { getRegionalDegreeDays } from '@/lib/api-clients/noaa';

export async function GET() {
    try {
        const data = await getRegionalDegreeDays();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Weather API error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch weather data' },
            { status: 500 }
        );
    }
}
