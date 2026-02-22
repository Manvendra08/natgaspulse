/**
 * /api/auth/zerodha/login-url
 *
 * GET — Returns the Kite Connect OAuth login URL built from the user's stored API key.
 *       The raw API key is decrypted server-side; only the login URL is returned to the client.
 *       Auth gate: requires a valid Supabase session.
 */

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { decryptJson } from '@/lib/utils/encryption';

const PROFILE_TABLE = 'user_profiles';
// Kite OAuth redirects back here after the user logs in
const KITE_REDIRECT_PATH = '/auth/callback';

type StoredCredentials = { apiKey: string; apiSecret: string };

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

export async function GET(request: Request) {
    try {
        const supabase = await createSupabaseServerClient();

        // Auth gate — only logged-in users can initiate Zerodha OAuth
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError || !auth?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Load encrypted credentials from DB
        const { data, error } = await supabase
            .from(PROFILE_TABLE)
            .select('zerodha_credentials')
            .eq('user_id', auth.user.id)
            .maybeSingle();

        if (error) {
            if (isMissingTableError(error)) {
                return NextResponse.json(
                    { error: 'Profile storage not initialized. Run migration 001_user_profiles.sql.' },
                    { status: 400 }
                );
            }
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (!data?.zerodha_credentials) {
            return NextResponse.json(
                { error: 'Zerodha API Key not saved. Go to Profile → API Keys and save your credentials first.' },
                { status: 400 }
            );
        }

        if (!hasEncryptionKey()) {
            return NextResponse.json(
                { error: 'APP_ENCRYPTION_KEY not configured on server.' },
                { status: 500 }
            );
        }

        let apiKey: string;
        try {
            const creds = decryptJson<StoredCredentials>(data.zerodha_credentials);
            apiKey = (creds?.apiKey ?? '').trim();
            if (!apiKey) throw new Error('empty');
        } catch {
            return NextResponse.json(
                { error: 'Stored credentials could not be decrypted. Re-enter API Key/Secret in Profile.' },
                { status: 500 }
            );
        }

        // Build the Kite Connect login URL
        // redirect_params must be a URL-encoded string of the redirect URL
        const origin = new URL(request.url).origin;
        const redirectUrl = `${origin}${KITE_REDIRECT_PATH}`;
        const loginUrl = `https://kite.zerodha.com/connect/login?api_key=${encodeURIComponent(apiKey)}&redirect_params=${encodeURIComponent(`redirect_url=${redirectUrl}`)}`;

        return NextResponse.json({ loginUrl }, { status: 200 });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to generate login URL';
        console.error('[auth/zerodha/login-url] GET error:', err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
