/**
 * /api/auth/zerodha
 *
 * POST { requestToken }
 *   — Loads the user's stored API key + secret from user_profiles (decrypted server-side).
 *   — Computes SHA-256 checksum: SHA256(apiKey + requestToken + apiSecret).
 *   — Exchanges request_token for access_token via Kite Connect session API.
 *   — Saves the access_token (encrypted) back to user_profiles.zerodha_access_token.
 *   — Returns { ok: true, userName, userId, loginTime } — access token is NEVER sent to client.
 *
 * DELETE
 *   — Clears zerodha_access_token from user_profiles (logout / token expiry).
 *
 * Auth gate: both methods require a valid Supabase session.
 * Zerodha UI / connect flow must never be shown to unauthenticated users.
 */

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { decryptJson, encryptJson } from '@/lib/utils/encryption';

// ── Constants ────────────────────────────────────────────────────────────────
const PROFILE_TABLE = 'user_profiles';
const KITE_SESSION_URL = 'https://api.kite.trade/session/token';

// ── Types ────────────────────────────────────────────────────────────────────
type StoredCredentials = {
    apiKey: string;
    apiSecret: string;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function normalise(v: unknown): string {
    return typeof v === 'string' ? v.trim() : '';
}

/** SHA-256(apiKey + requestToken + apiSecret) as required by Kite Connect */
function kiteChecksum(apiKey: string, requestToken: string, apiSecret: string): string {
    return crypto
        .createHash('sha256')
        .update(apiKey + requestToken + apiSecret)
        .digest('hex');
}

/**
 * Load and decrypt the user's stored Zerodha API key + secret.
 * Returns an error string if anything is missing or misconfigured.
 */
async function loadStoredCredentials(
    supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
    userId: string
): Promise<{ creds: StoredCredentials | null; error: string | null }> {
    const { data, error } = await supabase
        .from(PROFILE_TABLE)
        .select('zerodha_credentials')
        .eq('user_id', userId)
        .maybeSingle();

    if (error) {
        if (isMissingTableError(error)) {
            return { creds: null, error: 'Profile storage not initialized. Run migration 001_user_profiles.sql.' };
        }
        return { creds: null, error: error.message };
    }

    if (!data?.zerodha_credentials) {
        return {
            creds: null,
            error: 'Zerodha API Key/Secret not found in your profile. Save them in Settings → API Keys first.'
        };
    }

    if (!hasEncryptionKey()) {
        return {
            creds: null,
            error: 'APP_ENCRYPTION_KEY is not configured on the server. Cannot decrypt stored credentials.'
        };
    }

    try {
        const decrypted = decryptJson<StoredCredentials>(data.zerodha_credentials);
        const apiKey = normalise(decrypted?.apiKey);
        const apiSecret = normalise(decrypted?.apiSecret);

        if (!apiKey || !apiSecret) {
            return {
                creds: null,
                error: 'Stored Zerodha credentials are incomplete. Re-enter API Key and Secret in Settings.'
            };
        }

        return { creds: { apiKey, apiSecret }, error: null };
    } catch {
        return {
            creds: null,
            error: 'Stored Zerodha credentials could not be decrypted. Re-enter API Key and Secret in Settings.'
        };
    }
}

/**
 * Persist the access token (encrypted) to user_profiles.
 * Errors here are logged but do not fail the response — the token exchange already succeeded.
 */
async function saveAccessToken(
    supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
    userId: string,
    accessToken: string
): Promise<void> {
    try {
        if (!hasEncryptionKey()) {
            console.warn('[auth/zerodha] Cannot encrypt access token — APP_ENCRYPTION_KEY missing');
            return;
        }

        const encrypted = encryptJson({ accessToken });

        const { error } = await supabase
            .from(PROFILE_TABLE)
            .upsert(
                {
                    user_id: userId,
                    zerodha_access_token: encrypted,
                    updated_at: new Date().toISOString()
                },
                { onConflict: 'user_id' }
            );

        if (error) {
            console.error('[auth/zerodha] Failed to save access token:', error.message);
        }
    } catch (err) {
        console.error('[auth/zerodha] saveAccessToken threw:', err);
    }
}

// ── POST /api/auth/zerodha ───────────────────────────────────────────────────
export async function POST(request: Request) {
    try {
        const supabase = await createSupabaseServerClient();

        // Auth gate — Zerodha OAuth only available to logged-in users
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError || !auth?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Parse body
        let body: { requestToken?: unknown } | null = null;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }

        const requestToken = normalise(body?.requestToken);
        if (!requestToken) {
            return NextResponse.json({ error: 'Missing required field: requestToken' }, { status: 400 });
        }

        // Load stored API key + secret from DB (never from env or client)
        const { creds, error: credError } = await loadStoredCredentials(supabase, auth.user.id);
        if (credError || !creds) {
            return NextResponse.json({ error: credError ?? 'Failed to load credentials' }, { status: 400 });
        }

        // Build checksum and exchange for access token
        const checksum = kiteChecksum(creds.apiKey, requestToken, creds.apiSecret);

        const params = new URLSearchParams({
            api_key: creds.apiKey,
            request_token: requestToken,
            checksum
        });

        const kiteResponse = await fetch(KITE_SESSION_URL, {
            method: 'POST',
            headers: {
                'X-Kite-Version': '3',
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params
        });

        if (!kiteResponse.ok) {
            let detail = '';
            try {
                const errBody = await kiteResponse.json();
                detail = errBody?.message ?? errBody?.error_type ?? '';
            } catch {
                detail = await kiteResponse.text().catch(() => '');
            }
            throw new Error(`Kite token exchange failed (${kiteResponse.status})${detail ? `: ${detail}` : ''}`);
        }

        const kiteData = await kiteResponse.json();

        if (kiteData?.status === 'error') {
            throw new Error(kiteData.message ?? 'Kite returned error status');
        }

        const accessToken: string = kiteData?.data?.access_token ?? '';
        if (!accessToken) {
            throw new Error('Kite response did not include access_token');
        }

        // Persist access token encrypted in DB — never send to client
        await saveAccessToken(supabase, auth.user.id, accessToken);

        // Return only non-sensitive session metadata
        return NextResponse.json(
            {
                ok: true,
                userName: kiteData?.data?.user_name ?? null,
                userId: kiteData?.data?.user_id ?? null,
                loginTime: kiteData?.data?.login_time ?? null
            },
            { status: 200 }
        );
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Zerodha token exchange failed';
        console.error('[auth/zerodha] POST error:', err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

// ── DELETE /api/auth/zerodha ─────────────────────────────────────────────────
// Called on logout or when the token is known to be expired.
export async function DELETE() {
    try {
        const supabase = await createSupabaseServerClient();

        // Auth gate
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError || !auth?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Clear the stored access token
        const { error } = await supabase
            .from(PROFILE_TABLE)
            .update({
                zerodha_access_token: null,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', auth.user.id);

        if (error) {
            console.error('[auth/zerodha] DELETE clear token error:', error.message);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ ok: true }, { status: 200 });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Zerodha session clear failed';
        console.error('[auth/zerodha] DELETE error:', err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
