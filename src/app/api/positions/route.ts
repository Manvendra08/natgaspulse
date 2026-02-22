/**
 * /api/positions
 *
 * POST (no body required) — loads Zerodha api_key + access_token from the
 * authenticated user's profile (decrypted server-side), fetches live positions,
 * and returns position analysis + market condition.
 *
 * Credentials are NEVER sent from the client — they live only in user_profiles.
 */

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { decryptJson } from '@/lib/utils/encryption';
import { fetchZerodhaPositions } from '@/lib/api-clients/zerodha';
import { analyzePositions, type MarketCondition } from '@/lib/utils/position-analyzer';

const PROFILE_TABLE = 'user_profiles';

type StoredCredentials = { apiKey: string; apiSecret: string };
type StoredToken = { accessToken: string };

function isMissingTableError(error: unknown): boolean {
    const code = String((error as any)?.code ?? '');
    const msg = String((error as any)?.message ?? '');
    return (
        code === 'PGRST205' ||
        /user_profiles/i.test(msg) ||
        /schema cache/i.test(msg) ||
        /relation .* does not exist/i.test(msg)
    );
}

function hasEncryptionKey(): boolean {
    return Boolean(process.env.APP_ENCRYPTION_KEY?.trim());
}

export async function POST(request: Request) {
    try {
        const supabase = await createSupabaseServerClient();

        // Auth gate
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError || !auth?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!hasEncryptionKey()) {
            return NextResponse.json(
                { error: 'APP_ENCRYPTION_KEY not configured — cannot decrypt stored credentials.' },
                { status: 500 }
            );
        }

        // Load encrypted credentials from DB
        const { data: profile, error: profileError } = await supabase
            .from(PROFILE_TABLE)
            .select('zerodha_credentials, zerodha_access_token')
            .eq('user_id', auth.user.id)
            .maybeSingle();

        if (profileError) {
            if (isMissingTableError(profileError)) {
                return NextResponse.json(
                    { error: 'Profile storage not initialized. Run migration 001_user_profiles.sql.' },
                    { status: 500 }
                );
            }
            return NextResponse.json({ error: profileError.message }, { status: 500 });
        }

        if (!profile?.zerodha_credentials) {
            return NextResponse.json(
                { error: 'Zerodha API Key/Secret not saved. Go to Profile → API Keys to set up.' },
                { status: 400 }
            );
        }

        if (!profile?.zerodha_access_token) {
            return NextResponse.json(
                { error: 'No active Zerodha session. Please login via Trading Zone → Login with Zerodha.' },
                { status: 401 }
            );
        }

        // Decrypt credentials
        let apiKey: string;
        let accessToken: string;

        try {
            const creds = decryptJson<StoredCredentials>(profile.zerodha_credentials);
            apiKey = (creds?.apiKey ?? '').trim();
            if (!apiKey) throw new Error('apiKey missing in stored credentials');
        } catch {
            return NextResponse.json(
                { error: 'Stored API credentials could not be decrypted. Re-enter in Profile → API Keys.' },
                { status: 500 }
            );
        }

        try {
            const tokenData = decryptJson<StoredToken>(profile.zerodha_access_token);
            accessToken = (tokenData?.accessToken ?? '').trim();
            if (!accessToken) throw new Error('accessToken missing in stored token');
        } catch {
            return NextResponse.json(
                { error: 'Stored session token could not be decrypted. Please login again.' },
                { status: 401 }
            );
        }

        // Fetch positions from Zerodha
        const positions = await fetchZerodhaPositions({ apiKey, accessToken });

        // Fetch current market condition
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
        console.error('[positions] POST error:', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

async function fetchMarketCondition(requestUrl: string, cookieHeader?: string | null): Promise<MarketCondition> {
    try {
        const signalApiUrl = new URL('/api/signals', requestUrl).toString();
        const response = await fetch(signalApiUrl, {
            cache: 'no-store',
            headers: cookieHeader ? { cookie: cookieHeader } : undefined
        });

        if (!response.ok) throw new Error('Failed to fetch market signals');

        const data = await response.json();
        const dailyTF = data.timeframes?.find((tf: any) => tf.timeframe === '1D');

        return {
            trend: data.overallSignal === 'BUY' ? 'BULLISH' :
                data.overallSignal === 'SELL' ? 'BEARISH' : 'NEUTRAL',
            volatility: data.marketCondition === 'VOLATILE' ? 'HIGH' :
                data.marketCondition === 'RANGING' ? 'LOW' : 'MEDIUM',
            rsi: dailyTF?.indicators?.rsi || undefined,
            atr: dailyTF?.indicators?.atr || undefined,
            underlyingPrice: data.currentPrice
        };
    } catch {
        return { trend: 'NEUTRAL', volatility: 'MEDIUM' };
    }
}
