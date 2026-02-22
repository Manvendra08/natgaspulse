/**
 * /api/profile/zerodha
 *
 * GET  — return decrypted Zerodha credentials (apiKey masked, apiSecret masked,
 *         accessToken presence flag) for the authenticated user.
 * POST — save / clear Zerodha credentials (apiKey + apiSecret) encrypted at rest.
 *
 * Access token is written separately by /api/auth/zerodha after OAuth completes.
 * API keys are NEVER stored in .env; they live only in user_profiles.zerodha_credentials.
 */

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { decryptJson, encryptJson } from '@/lib/utils/encryption';

// ── Constants ────────────────────────────────────────────────────────────────
const PROFILE_TABLE = 'user_profiles';

// ── Types ────────────────────────────────────────────────────────────────────
/** Shape stored (encrypted) in user_profiles.zerodha_credentials */
type ZerodhaCredentials = {
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

/** Mask all but last 4 chars so the UI can confirm a key is saved without exposing it */
function maskSecret(value: string): string {
    if (!value || value.length <= 4) return '****';
    return '*'.repeat(value.length - 4) + value.slice(-4);
}

// ── GET /api/profile/zerodha ─────────────────────────────────────────────────
export async function GET() {
    try {
        const supabase = await createSupabaseServerClient();

        // Auth guard — Zerodha connect is only available post-login
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError || !auth?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data, error } = await supabase
            .from(PROFILE_TABLE)
            .select('zerodha_credentials, zerodha_access_token')
            .eq('user_id', auth.user.id)
            .maybeSingle();

        if (error) {
            if (isMissingTableError(error)) {
                return NextResponse.json(
                    { credentials: null, warning: 'Profile storage not initialized. Run migration 001_user_profiles.sql.' },
                    { status: 200 }
                );
            }
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // No row yet — profile not initialized
        if (!data) {
            return NextResponse.json({ credentials: null }, { status: 200 });
        }

        // No credentials saved yet
        if (!data.zerodha_credentials) {
            return NextResponse.json(
                {
                    credentials: null,
                    hasAccessToken: Boolean(data.zerodha_access_token)
                },
                { status: 200 }
            );
        }

        if (!hasEncryptionKey()) {
            return NextResponse.json(
                { credentials: null, warning: 'APP_ENCRYPTION_KEY not configured on server.' },
                { status: 200 }
            );
        }

        // Decrypt and return masked values — never expose raw secrets to frontend
        try {
            const creds = decryptJson<ZerodhaCredentials>(data.zerodha_credentials);
            return NextResponse.json(
                {
                    credentials: {
                        apiKeyMasked: maskSecret(creds.apiKey ?? ''),
                        // apiSecret is never returned — only presence flag
                        hasApiSecret: Boolean(creds.apiSecret),
                        hasAccessToken: Boolean(data.zerodha_access_token)
                    }
                },
                { status: 200 }
            );
        } catch {
            return NextResponse.json(
                { credentials: null, warning: 'Saved credentials could not be decrypted. Re-enter API Key/Secret.' },
                { status: 200 }
            );
        }
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Zerodha profile fetch failed';
        console.error('[profile/zerodha] GET error:', err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

// ── POST /api/profile/zerodha ────────────────────────────────────────────────
export async function POST(request: Request) {
    try {
        const supabase = await createSupabaseServerClient();

        // Auth guard
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError || !auth?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        let body: {
            apiKey?: unknown;
            apiSecret?: unknown;
            accessToken?: unknown;
            clear?: unknown;
            credentials?: { apiKey?: unknown; apiSecret?: unknown; accessToken?: unknown };
        } | null = null;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }

        // Support both flat fields and nested { credentials: { ... } } shape
        const nested = body?.credentials;
        const apiKey = normalise(body?.apiKey ?? nested?.apiKey);
        const apiSecret = normalise(body?.apiSecret ?? nested?.apiSecret);
        const accessToken = normalise(body?.accessToken ?? nested?.accessToken);
        const shouldClear = body?.clear === true;

        if (!hasEncryptionKey()) {
            return NextResponse.json(
                { error: 'APP_ENCRYPTION_KEY is not configured on the server. Cannot store credentials safely.' },
                { status: 500 }
            );
        }

        const upsertPayload: Record<string, unknown> = {
            user_id: auth.user.id,
            updated_at: new Date().toISOString()
        };

        if (shouldClear) {
            // Clear everything
            upsertPayload.zerodha_credentials = null;
            upsertPayload.zerodha_access_token = null;
        } else {
            // Update credentials blob only if api_key provided
            if (apiKey && apiSecret) {
                upsertPayload.zerodha_credentials = encryptJson({ apiKey, apiSecret } satisfies ZerodhaCredentials);
            } else if (apiKey && !apiSecret) {
                // api_key only — merge with existing secret if possible
                // (best-effort: if no existing secret, require both)
                const { data: existing } = await supabase
                    .from(PROFILE_TABLE)
                    .select('zerodha_credentials')
                    .eq('user_id', auth.user.id)
                    .maybeSingle();
                let existingSecret = '';
                if (existing?.zerodha_credentials) {
                    try {
                        const dec = decryptJson<ZerodhaCredentials>(existing.zerodha_credentials);
                        existingSecret = dec?.apiSecret ?? '';
                    } catch { /* ignore */ }
                }
                if (!existingSecret) {
                    return NextResponse.json({ error: 'apiSecret is required when saving API credentials' }, { status: 400 });
                }
                upsertPayload.zerodha_credentials = encryptJson({ apiKey, apiSecret: existingSecret } satisfies ZerodhaCredentials);
            }
            // Update access token if provided
            if (accessToken) {
                upsertPayload.zerodha_access_token = encryptJson({ accessToken });
            }
        }

        const { error } = await supabase
            .from(PROFILE_TABLE)
            .upsert(upsertPayload, { onConflict: 'user_id' });

        if (error) {
            if (isMissingTableError(error)) {
                return NextResponse.json(
                    { error: 'Profile storage not initialized. Run migration 001_user_profiles.sql.' },
                    { status: 500 }
                );
            }
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ ok: true }, { status: 200 });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Zerodha profile update failed';
        console.error('[profile/zerodha] POST error:', err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
