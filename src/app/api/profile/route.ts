import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// ── Constants ────────────────────────────────────────────────────────────────
const PROFILE_TABLE = 'user_profiles';

// ── Types ────────────────────────────────────────────────────────────────────
type ProfileRow = {
    user_id: string;
    email: string | null;
    full_name: string | null;
    subscription_status: string | null;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Detect "table does not exist yet" errors from PostgREST / Supabase */
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

/**
 * Ensure a profile row exists for the authenticated user.
 * Called on every GET so first-login users get a row automatically.
 * Errors here are non-fatal — we log and continue.
 */
async function ensureProfileRow(
    supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
    userId: string,
    email: string | null | undefined
): Promise<void> {
    try {
        const { error } = await supabase.from(PROFILE_TABLE).upsert(
            {
                user_id: userId,
                email: email ?? null,
                subscription_status: 'PROMO',
                updated_at: new Date().toISOString()
            },
            { onConflict: 'user_id', ignoreDuplicates: true }
        );
        if (error && !isMissingTableError(error)) {
            console.warn('[profile] ensureProfileRow upsert warning:', error.message);
        }
    } catch (err) {
        console.warn('[profile] ensureProfileRow threw:', err);
    }
}

// ── GET /api/profile ─────────────────────────────────────────────────────────
export async function GET() {
    try {
        const supabase = await createSupabaseServerClient();

        // Auth guard
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError || !auth?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user = auth.user;

        // Guarantee a row exists (first-login initialisation)
        await ensureProfileRow(supabase, user.id, user.email);

        // Fetch profile — select only non-sensitive columns
        const { data, error } = await supabase
            .from(PROFILE_TABLE)
            .select('user_id, email, full_name, subscription_status')
            .eq('user_id', user.id)
            .maybeSingle();

        if (error) {
            if (isMissingTableError(error)) {
                // Table not yet created — return safe defaults with a warning
                return NextResponse.json(
                    {
                        profile: {
                            fullName: null,
                            email: user.email ?? null,
                            subscriptionStatus: 'PROMO'
                        },
                        warning: 'Profile storage is not initialized. Run supabase/migrations/001_user_profiles.sql in Supabase SQL Editor.'
                    },
                    { status: 200 }
                );
            }
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Null-check: row may still be null if upsert was skipped due to RLS
        const row = data as ProfileRow | null;
        return NextResponse.json(
            {
                profile: {
                    fullName: row?.full_name ?? null,
                    email: row?.email ?? user.email ?? null,
                    subscriptionStatus: row?.subscription_status ?? 'PROMO'
                }
            },
            { status: 200 }
        );
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Profile fetch failed';
        console.error('[profile] GET error:', err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

// ── POST /api/profile ────────────────────────────────────────────────────────
export async function POST(request: Request) {
    try {
        const supabase = await createSupabaseServerClient();

        // Auth guard
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError || !auth?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user = auth.user;

        // Parse body — only allow safe fields; never accept API keys here
        let body: { fullName?: unknown } | null = null;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }

        const fullName =
            typeof body?.fullName === 'string' ? body.fullName.trim().slice(0, 200) : null;

        const { error } = await supabase.from(PROFILE_TABLE).upsert(
            {
                user_id: user.id,
                email: user.email ?? null,
                full_name: fullName,
                updated_at: new Date().toISOString()
            },
            { onConflict: 'user_id' }
        );

        if (error) {
            if (isMissingTableError(error)) {
                return NextResponse.json(
                    { error: 'Profile storage is not initialized. Run supabase/migrations/001_user_profiles.sql in Supabase SQL Editor.' },
                    { status: 500 }
                );
            }
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ ok: true }, { status: 200 });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Profile update failed';
        console.error('[profile] POST error:', err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
