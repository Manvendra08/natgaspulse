import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { decryptJson, encryptJson } from '@/lib/utils/encryption';

const PROFILE_TABLE = 'user_profiles';
const PROFILE_STORAGE_WARNING = 'Profile storage is not initialized. Run the user_profiles SQL setup in Supabase.';

type ZerodhaProfile = {
    apiKey?: string;
    apiSecret?: string;
    accessToken?: string;
};

const ENCRYPTION_KEY_ERROR =
    'Server encryption key is not configured. Set APP_ENCRYPTION_KEY and restart the app.';

function hasEncryptionKey(): boolean {
    return Boolean(process.env.APP_ENCRYPTION_KEY && process.env.APP_ENCRYPTION_KEY.trim().length > 0);
}

function normalizeCredentials(input: ZerodhaProfile): ZerodhaProfile {
    const apiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
    const apiSecret = typeof input.apiSecret === 'string' ? input.apiSecret.trim() : '';
    const accessToken = typeof input.accessToken === 'string' ? input.accessToken.trim() : '';
    return { apiKey, apiSecret, accessToken };
}

function hasAnyCredential(input: ZerodhaProfile): boolean {
    return Boolean(input.apiKey || input.apiSecret || input.accessToken);
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

export async function GET() {
    try {
        const supabase = await createSupabaseServerClient();
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError || !auth?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data, error } = await supabase
            .from(PROFILE_TABLE)
            .select('zerodha_credentials')
            .eq('user_id', auth.user.id)
            .maybeSingle();

        if (error) {
            if (isMissingProfileTableError(error)) {
                return NextResponse.json(
                    {
                        credentials: null,
                        warning: PROFILE_STORAGE_WARNING
                    },
                    { status: 200 }
                );
            }
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (!data?.zerodha_credentials) {
            return NextResponse.json({ credentials: null }, { status: 200 });
        }

        if (!hasEncryptionKey()) {
            return NextResponse.json(
                {
                    credentials: null,
                    warning: ENCRYPTION_KEY_ERROR
                },
                { status: 200 }
            );
        }

        try {
            const credentials = decryptJson<ZerodhaProfile>(data.zerodha_credentials);
            return NextResponse.json({ credentials }, { status: 200 });
        } catch {
            return NextResponse.json(
                {
                    credentials: null,
                    warning: 'Saved Zerodha credentials could not be decrypted. Re-enter API Key/Secret.'
                },
                { status: 200 }
            );
        }
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || 'Profile fetch failed' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const supabase = await createSupabaseServerClient();
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError || !auth?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = (await request.json()) as { credentials?: ZerodhaProfile } | null;
        const credentials = body?.credentials;
        if (!credentials || typeof credentials !== 'object') {
            return NextResponse.json({ error: 'Missing credentials payload' }, { status: 400 });
        }

        const normalized = normalizeCredentials(credentials);
        const shouldClear = !hasAnyCredential(normalized);

        if (!shouldClear && !hasEncryptionKey()) {
            return NextResponse.json({ error: ENCRYPTION_KEY_ERROR }, { status: 500 });
        }
        const encrypted = shouldClear ? null : encryptJson(normalized);

        const { error } = await supabase.from(PROFILE_TABLE).upsert({
            user_id: auth.user.id,
            zerodha_credentials: encrypted,
            updated_at: new Date().toISOString()
        });

        if (error) {
            if (isMissingProfileTableError(error)) {
                return NextResponse.json({ error: PROFILE_STORAGE_WARNING }, { status: 500 });
            }
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ ok: true }, { status: 200 });
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || 'Profile update failed' }, { status: 500 });
    }
}
