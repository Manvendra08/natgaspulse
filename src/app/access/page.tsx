'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import Link from 'next/link';
import { Lock, ArrowRight } from 'lucide-react';

export default function AccessPage() {
    const router = useRouter();
    const [redirectTo, setRedirectTo] = useState('/dashboard');

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const redirect = params.get('redirect');
        setRedirectTo(redirect && redirect.startsWith('/') ? redirect : '/dashboard');
    }, []);

    return (
        <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-white to-zinc-100 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 flex flex-col">
            <Navbar />
            <div className="flex-1 flex items-center justify-center p-6">
                <div className="w-full max-w-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-7 shadow-2xl">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/30">
                            <Lock className="w-6 h-6 text-amber-500" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100">Premium Access</h1>
                            <p className="text-sm text-zinc-500">Create an account to continue</p>
                        </div>
                    </div>

                    <div className="mt-5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
                        <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Requested Page</div>
                        <div className="text-sm font-mono text-zinc-700 dark:text-zinc-300 break-all">{redirectTo}</div>
                    </div>

                    <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Link
                            href={`/signup?redirect=${encodeURIComponent(redirectTo)}`}
                            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black transition"
                        >
                            Sign Up
                            <ArrowRight className="w-4 h-4" />
                        </Link>
                        <Link
                            href={`/login?redirect=${encodeURIComponent(redirectTo)}`}
                            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-black transition dark:bg-zinc-800 dark:hover:bg-zinc-700"
                        >
                            Log In
                            <ArrowRight className="w-4 h-4" />
                        </Link>
                    </div>

                    <div className="mt-3">
                        <button
                            onClick={() => router.push('/')}
                            className="w-full px-4 py-2.5 rounded-xl bg-transparent border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
