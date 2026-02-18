import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { EmailOtpType } from '@supabase/supabase-js';

function getSafeRedirect(redirectParam: string | null): string {
    return redirectParam && redirectParam.startsWith('/') ? redirectParam : '/dashboard';
}

function redirectToLogin(origin: string, redirect: string, errorMessage?: string, errorCode?: string) {
    const failUrl = new URL('/login', origin);
    failUrl.searchParams.set('redirect', redirect);
    if (errorMessage) failUrl.searchParams.set('error', errorMessage);
    if (errorCode) failUrl.searchParams.set('error_code', errorCode);
    return NextResponse.redirect(failUrl);
}

export async function GET(request: Request) {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const tokenHash = url.searchParams.get('token_hash');
    const otpType = url.searchParams.get('type') as EmailOtpType | null;
    const redirect = getSafeRedirect(url.searchParams.get('redirect'));
    const callbackError = url.searchParams.get('error');
    const callbackErrorCode = url.searchParams.get('error_code');
    const callbackErrorDescription = url.searchParams.get('error_description');

    if (callbackError || callbackErrorDescription) {
        const message = callbackErrorDescription || callbackError || 'Authentication failed';
        return redirectToLogin(url.origin, redirect, message, callbackErrorCode || undefined);
    }

    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!baseUrl || !anonKey || (!code && !tokenHash)) {
        return redirectToLogin(url.origin, redirect, 'Authentication callback is missing required parameters.');
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(baseUrl, anonKey, {
        cookies: {
            getAll() {
                return cookieStore.getAll();
            },
            setAll(cookiesToSet) {
                cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
            }
        }
    });

    if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
            return redirectToLogin(url.origin, redirect, error.message);
        }
    } else if (tokenHash && otpType) {
        const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: otpType
        });

        if (error) {
            return redirectToLogin(url.origin, redirect, error.message);
        }
    }

    const dest = new URL(redirect, url.origin);
    return NextResponse.redirect(dest);
}
