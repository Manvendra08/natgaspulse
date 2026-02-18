'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { Activity, Mail, Lock, ArrowRight, Chrome } from 'lucide-react';

function toAuthErrorMessage(err: any): string {
    const message = String(err?.message || err?.msg || 'Sign up failed');
    if (/unsupported provider/i.test(message)) {
        return 'Google sign up is not enabled in your Supabase project. Enable Google under Authentication > Providers.';
    }
    if (/unable to exchange external code/i.test(message)) {
        return 'Google OAuth exchange failed in Supabase. Verify Google provider settings: use a Web OAuth client, set correct Client Secret, and add https://<project-ref>.supabase.co/auth/v1/callback as an authorized redirect URI.';
    }
    return message;
}

export default function SignupPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [canResend, setCanResend] = useState(false);
    const router = useRouter();
    const [redirectTo, setRedirectTo] = useState('/dashboard');

    const supabase = useMemo(() => {
        try {
            return createSupabaseBrowserClient();
        } catch {
            return null;
        }
    }, []);

    useEffect(() => {
        if (!supabase) return;
        supabase.auth.getUser().then(({ data }) => {
            if (data.user) router.replace(redirectTo);
        });
    }, [router, redirectTo, supabase]);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const redirect = params.get('redirect');
        setRedirectTo(redirect && redirect.startsWith('/') ? redirect : '/dashboard');

        const callbackError = params.get('error');
        if (callbackError) {
            setError(toAuthErrorMessage({ message: callbackError }));
        }
    }, []);

    const resendVerification = async () => {
        if (!supabase || !email) return;
        setLoading(true);
        setError(null);
        try {
            const origin = window.location.origin;
            const { error: resendError } = await supabase.auth.resend({
                type: 'signup',
                email,
                options: {
                    emailRedirectTo: `${origin}/auth/callback?redirect=${encodeURIComponent(redirectTo)}`
                }
            });
            if (resendError) throw resendError;
            setMessage('Verification email re-sent. Check inbox/spam folder.');
        } catch (err: any) {
            setError(toAuthErrorMessage(err));
        } finally {
            setLoading(false);
        }
    };

    const signUpWithEmail = async () => {
        if (!supabase) return;
        setLoading(true);
        setError(null);
        setMessage(null);
        setCanResend(false);
        try {
            const origin = window.location.origin;
            const { data, error: signUpError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: `${origin}/auth/callback?redirect=${encodeURIComponent(redirectTo)}`
                }
            });
            if (signUpError) throw signUpError;

            // If email confirmation is enabled, session is usually null until verified.
            if (!data.session) {
                setCanResend(true);
                setMessage('Account created. Verification email sent. Check inbox/spam, then verify before login.');
            } else {
                setMessage('Account created and logged in successfully.');
                router.replace(redirectTo);
            }
        } catch (err: any) {
            setError(toAuthErrorMessage(err));
        } finally {
            setLoading(false);
        }
    };

    const signUpWithGoogle = async () => {
        if (!supabase) return;
        setLoading(true);
        setError(null);
        setMessage(null);
        try {
            const origin = window.location.origin;
            const { error: oauthError } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: `${origin}/auth/callback?redirect=${encodeURIComponent(redirectTo)}`
                }
            });
            if (oauthError) throw oauthError;
        } catch (err: any) {
            setError(toAuthErrorMessage(err));
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-white to-zinc-100 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 flex flex-col">
            <Navbar />
            <div className="flex-1 flex items-center justify-center p-6">
                <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-7 shadow-2xl">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-3 bg-cyan-500/10 rounded-xl border border-cyan-500/30">
                            <Activity className="w-6 h-6 text-cyan-400" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100">Create Account</h1>
                            <p className="text-sm text-zinc-500">Google or email and password</p>
                        </div>
                    </div>

                    {error && (
                        <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm text-red-400 font-semibold">
                            {error}
                        </div>
                    )}
                    {message && (
                        <div className="mb-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-sm text-emerald-500 font-semibold">
                            {message}
                        </div>
                    )}

                    {!supabase && (
                        <div className="mb-4 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-sm text-amber-500 font-semibold">
                            Auth is not configured. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` (and Vercel env), then restart `npm run dev`.
                        </div>
                    )}

                    <button
                        onClick={signUpWithGoogle}
                        disabled={loading || !supabase}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 text-white font-bold border border-zinc-800 hover:bg-zinc-800 transition disabled:opacity-50"
                    >
                        <Chrome className="w-4 h-4" />
                        Continue with Google
                    </button>

                    <div className="flex items-center gap-3 my-5">
                        <div className="h-px bg-zinc-200 dark:bg-zinc-800 flex-1" />
                        <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">or</span>
                        <div className="h-px bg-zinc-200 dark:bg-zinc-800 flex-1" />
                    </div>

                    <div className="space-y-3">
                        <label className="block">
                            <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Email</span>
                            <div className="mt-1 flex items-center gap-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2">
                                <Mail className="w-4 h-4 text-zinc-400" />
                                <input
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    type="email"
                                    className="w-full bg-transparent outline-none text-sm text-zinc-900 dark:text-zinc-100"
                                    placeholder="you@example.com"
                                    autoComplete="email"
                                />
                            </div>
                        </label>

                        <label className="block">
                            <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Password</span>
                            <div className="mt-1 flex items-center gap-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2">
                                <Lock className="w-4 h-4 text-zinc-400" />
                                <input
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    type="password"
                                    className="w-full bg-transparent outline-none text-sm text-zinc-900 dark:text-zinc-100"
                                    placeholder="At least 8 characters"
                                    autoComplete="new-password"
                                />
                            </div>
                        </label>

                        <button
                            onClick={signUpWithEmail}
                            disabled={loading || !supabase || !email || password.length < 8}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-black transition disabled:opacity-50"
                        >
                            Sign Up
                            <ArrowRight className="w-4 h-4" />
                        </button>

                        {canResend && (
                            <button
                                onClick={resendVerification}
                                disabled={loading || !email}
                                className="w-full px-4 py-2.5 rounded-xl bg-transparent border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold hover:bg-zinc-100 dark:hover:bg-zinc-800 transition disabled:opacity-50"
                            >
                                Resend Verification Email
                            </button>
                        )}
                    </div>

                    <div className="mt-5 text-xs text-zinc-500">
                        Already have an account?{' '}
                        <a className="font-bold text-cyan-600 dark:text-cyan-400 hover:underline" href={`/login?redirect=${encodeURIComponent(redirectTo)}`}>
                            Log in
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}
