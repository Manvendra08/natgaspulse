'use client';

import { useMemo, useState } from 'react';
import Navbar from '@/components/layout/Navbar';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { Mail, ArrowRight, KeyRound } from 'lucide-react';

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const supabase = useMemo(() => {
        try {
            return createSupabaseBrowserClient();
        } catch {
            return null;
        }
    }, []);

    const submit = async () => {
        if (!supabase) return;
        setLoading(true);
        setError(null);
        setMessage(null);
        try {
            const origin = window.location.origin;
            const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${origin}/auth/callback?redirect=${encodeURIComponent('/auth/reset')}`
            });
            if (resetError) throw resetError;
            setMessage('Password reset email sent. Check your inbox.');
        } catch (err: any) {
            setError(err?.message || 'Failed to send reset email');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-white to-zinc-100 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 flex flex-col">
            <Navbar />
            <div className="flex-1 flex items-center justify-center p-6">
                <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-7 shadow-2xl">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-3 bg-violet-500/10 rounded-xl border border-violet-500/30">
                            <KeyRound className="w-6 h-6 text-violet-400" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100">Forgot Password</h1>
                            <p className="text-sm text-zinc-500">Send a reset link to your email</p>
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
                            Auth is not configured. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, then restart `npm run dev`.
                        </div>
                    )}

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

                    <button
                        onClick={submit}
                        disabled={loading || !supabase || !email}
                        className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-black transition disabled:opacity-50"
                    >
                        Send Reset Link
                        <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}

