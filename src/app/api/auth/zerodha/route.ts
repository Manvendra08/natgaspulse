import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { decryptJson } from '@/lib/utils/encryption';

const PROFILE_TABLE = 'user_profiles';
const ENCRYPTION_KEY_ERROR =
    'Server encryption key is not configured. Set APP_ENCRYPTION_KEY and restart the app.';

type ZerodhaProfile = {
    apiKey?: string;
    apiSecret?: string;
    accessToken?: string;
};

function hasEncryptionKey(): boolean {
    return Boolean(process.env.APP_ENCRYPTION_KEY && process.env.APP_ENCRYPTION_KEY.trim().length > 0);
}

function isMissingProfileTableError(error: any): boolean {
    const code = String(error?.code || '');
    const message = String(error?.message || '');
    return (
        code === 'PGRST205' ||
        /user_profiles/i.test(message) ||
        /schema cache/i.test(message) ||
        /relation .* does not exist/i.test(message)
    );
}

function normalizeCredential(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

async function loadSavedCredentials(): Promise<{ apiKey: string; apiSecret: string; error?: string }> {
    const supabase = await createSupabaseServerClient();
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth?.user) {
        return { apiKey: '', apiSecret: '', error: 'Unauthorized' };
    }

    const { data, error } = await supabase
        .from(PROFILE_TABLE)
        .select('zerodha_credentials')
        .eq('user_id', auth.user.id)
        .maybeSingle();

    if (error) {
        if (isMissingProfileTableError(error)) {
            return {
                apiKey: '',
                apiSecret: '',
                error: 'Profile storage is not initialized. Run the user_profiles SQL setup in Supabase.'
            };
        }
        return { apiKey: '', apiSecret: '', error: error.message || 'Profile fetch failed' };
    }

    if (!data?.zerodha_credentials) {
        return { apiKey: '', apiSecret: '', error: 'API Key/Secret not found in profile. Please set them once.' };
    }

    if (!hasEncryptionKey()) {
        return { apiKey: '', apiSecret: '', error: ENCRYPTION_KEY_ERROR };
    }

    try {
        const decrypted = decryptJson<ZerodhaProfile>(data.zerodha_credentials);
        return {
            apiKey: normalizeCredential(decrypted?.apiKey),
            apiSecret: normalizeCredential(decrypted?.apiSecret)
        };
    } catch {
        return {
            apiKey: '',
            apiSecret: '',
            error: 'Saved Zerodha credentials could not be decrypted. Re-enter API Key/Secret.'
        };
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const requestToken = normalizeCredential(body?.requestToken);
        let apiKey = normalizeCredential(body?.apiKey);
        let apiSecret = normalizeCredential(body?.apiSecret);

        if (!requestToken) {
            return NextResponse.json({ error: 'Missing required requestToken' }, { status: 400 });
        }

        if (!apiKey || !apiSecret) {
            const saved = await loadSavedCredentials();
            if (saved.error && (!saved.apiKey || !saved.apiSecret)) {
                return NextResponse.json({ error: saved.error }, { status: saved.error === 'Unauthorized' ? 401 : 400 });
            }
            apiKey = saved.apiKey;
            apiSecret = saved.apiSecret;
        }

        if (!apiKey || !apiSecret) {
            return NextResponse.json(
                { error: 'Missing required credentials (apiKey/apiSecret). Set once in profile, then retry.' },
                { status: 400 }
            );
        }

        // Generate checksum: SHA256(api_key + request_token + api_secret)
        const checksumData = apiKey + requestToken + apiSecret;
        const checksum = crypto.createHash('sha256').update(checksumData).digest('hex');

        // Exchange for Access Token
        const params = new URLSearchParams();
        params.append('api_key', apiKey);
        params.append('request_token', requestToken);
        params.append('checksum', checksum);

        const response = await fetch('https://api.kite.trade/session/token', {
            method: 'POST',
            headers: {
                'X-Kite-Version': '3',
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Zerodha Token Exchange Failed: ${response.status} - ${errorText}`);
        }

        const data = await response.json();

        if (data.status === 'error') {
            throw new Error(data.message || 'Token exchange returned error status');
        }

        return NextResponse.json({
            accessToken: data.data.access_token,
            publicToken: data.data.public_token,
            userName: data.data.user_name,
            userId: data.data.user_id,
            loginTime: data.data.login_time
        });

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Token exchange failed';
        console.error('Zerodha Auth Error:', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
