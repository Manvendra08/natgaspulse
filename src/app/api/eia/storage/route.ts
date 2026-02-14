import { NextResponse } from 'next/server';
import { getStorageStatistics } from '@/lib/api-clients/eia';

export async function GET() {
    try {
        const stats = await getStorageStatistics();
        return NextResponse.json(stats);
    } catch (error) {
        console.error('Storage API error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch storage data' },
            { status: 500 }
        );
    }
}
