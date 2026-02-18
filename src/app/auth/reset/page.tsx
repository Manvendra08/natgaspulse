'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { Lock, ArrowRight, CheckCircle2 } from 'lucide-react';

export default function ResetPasswordPage() {
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    const supabase = useMemo(() => {
        try {
            return createSupabaseBrowserClient();
        } catch {
            return null;
        }
    }, []);

    useEffect(() => {
        if (!supabase) return;
        supabase.auth.getSession().then(({ data }) => {
            if (!data.session) {
                setError('Reset session not found. Please re-open the reset link from your email.');
            }
        });
    }, [supabase]);

    const submit = async () => {
        if (!supabase) return;
        setLoading(true);
        setError(null);
        setMessage(null);
        try {
            const { error: updateError } = await supabase.auth.updateUser({ password });
            if (updateError) throw updateError;
            setMessage('Password updated. You can now continue.');
            setTimeout(() => router.push('/dashboard'), 800);
        } catch (err: any) {
            setError(err?.message || 'Failed to update password');
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
                        <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/30">
                            <Lock className="w-6 h-6 text-emerald-400" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100">Reset Password</h1>
                            <p className="text-sm text-zinc-500">Set a new password for your account</p>
                        </div>
                    </div>

                    {error && (
                        <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm text-red-400 font-semibold">
                            {error}
                        </div>
                    )}
                    {message && (
                        <div className="mb-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-sm text-emerald-500 font-semibold flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4" />
                            {message}
                        </div>
                    )}

                    {!supabase && (
                        <div className="mb-4 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-sm text-amber-500 font-semibold">
                            Auth is not configured. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, then restart `npm run dev`.
                        </div>
                    )}

                    <label className="block">
                        <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">New Password</span>
                        <input
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            type="password"
                            className="mt-1 w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 outline-none"
                            placeholder="At least 8 characters"
                            autoComplete="new-password"
                        />
                    </label>

                    <button
                        onClick={submit}
                        disabled={loading || !supabase || password.length < 8}
                        className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black transition disabled:opacity-50"
                    >
                        Update Password
                        <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}

