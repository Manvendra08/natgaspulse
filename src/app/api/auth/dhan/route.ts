import { NextResponse } from 'next/server';
import { fetchDhanOptionChain } from '@/lib/utils/dhan-option-chain';
import { normalizeDhanAuthToken } from '@/lib/utils/dhan-auth';

interface DhanAuthRequest {
    authToken?: string;
    authPayload?: unknown;
    exchange?: string;
    segment?: string;
    underlying?: string;
}

export async function POST(request: Request) {
    try {
        const body = (await request.json()) as DhanAuthRequest;
        const {
            authToken,
            authPayload,
            exchange = 'MCX',
            segment = 'M',
            underlying = 'NATURALGAS'
        } = body;
        const normalizedToken = normalizeDhanAuthToken(authToken || authPayload || '');

        if (!normalizedToken) {
            return NextResponse.json(
                { error: 'Missing Dhan auth token. Paste Local Storage "policeToken" or full storage value.' },
                { status: 400 }
            );
        }

        const chain = await fetchDhanOptionChain(
            { authToken: normalizedToken },
            { exchange, segment, underlying, maxStrikes: 8 }
        );

        return NextResponse.json({
            authenticated: true,
            source: chain.source,
            exchange: chain.exchange,
            underlying: chain.underlying,
            selectedExpiry: chain.selectedExpiry,
            strikeCount: chain.strikes.length,
            authTokenPreview: `${normalizedToken.slice(0, 8)}...${normalizedToken.slice(-6)}`,
            validatedAt: new Date().toISOString()
        });
    } catch (error: unknown) {
        const baseMessage = error instanceof Error ? error.message : 'Dhan authentication failed';
        const message = baseMessage.includes('401')
            ? `${baseMessage} Use Local Storage key "policeToken" (not "verification_token").`
            : baseMessage;
        console.error('Dhan Auth API error:', error);
        const status = shouldReturnUnauthorized(message) ? 401 : 500;
        return NextResponse.json({ error: message }, { status });
    }
}

function shouldReturnUnauthorized(message: string): boolean {
    const text = message.toLowerCase();
    return text.includes('401') || text.includes('auth') || text.includes('token') || text.includes('session');
}
