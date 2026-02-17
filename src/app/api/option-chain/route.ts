import { NextResponse } from 'next/server';
import { fetchRupeezyOptionChain } from '@/lib/utils/rupeezy-option-chain';

interface OptionChainRequest {
    exchange?: string;
    underlying?: string;
    expiry?: string | number;
    maxStrikes?: number;
}

export async function POST(request: Request) {
    try {
        const body = await request.json() as OptionChainRequest;
        const { exchange, underlying, expiry, maxStrikes } = body;
        const chain = await fetchRupeezyOptionChain({ exchange, underlying, expiry, maxStrikes });

        return NextResponse.json(chain);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to fetch option chain';
        console.error('Option Chain API error:', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
