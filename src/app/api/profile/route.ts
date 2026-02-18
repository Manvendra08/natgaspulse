import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const PROFILE_TABLE = 'user_profiles';
const PROFILE_STORAGE_WARNING = 'Profile storage is not initialized. Run the user_profiles SQL setup in Supabase.';

type ProfileRow = {
    user_id: string;
    full_name: string | null;
    subscription_status: string | null;
};

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
            .select('user_id, full_name, subscription_status')
            .eq('user_id', auth.user.id)
            .maybeSingle();

        if (error) {
            if (isMissingProfileTableError(error)) {
                return NextResponse.json(
                    {
                        profile: {
                            fullName: null,
                            subscriptionStatus: 'PROMO'
                        },
                        warning: PROFILE_STORAGE_WARNING
                    },
                    { status: 200 }
                );
            }
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const row = (data || { user_id: auth.user.id, full_name: null, subscription_status: 'PROMO' }) as ProfileRow;
        return NextResponse.json(
            {
                profile: {
                    fullName: row.full_name,
                    subscriptionStatus: row.subscription_status || 'PROMO'
                }
            },
            { status: 200 }
        );
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

        const body = (await request.json()) as { fullName?: string } | null;
        const fullName = typeof body?.fullName === 'string' ? body.fullName.trim() : '';

        const { error } = await supabase.from(PROFILE_TABLE).upsert({
            user_id: auth.user.id,
            full_name: fullName || null,
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
