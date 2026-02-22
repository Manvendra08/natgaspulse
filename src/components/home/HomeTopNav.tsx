'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { Menu, X } from 'lucide-react';

const PREMIUM_ITEMS = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/signals', label: 'Signals' },
    { href: '/nat-gas-mcx', label: 'Nat Gas MCX' },
    { href: '/forecaster', label: 'Forecaster' },
    { href: '/trading-zone', label: 'Trading Zone' }
];

export default function HomeTopNav() {
    const [isAuthed, setIsAuthed] = useState(false);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        let mounted = true;
        try {
            const supabase = createSupabaseBrowserClient();
            supabase.auth.getUser().then(({ data }) => {
                if (!mounted) return;
                setIsAuthed(Boolean(data.user));
            });

            const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
                if (!mounted) return;
                setIsAuthed(Boolean(session?.user));
            });

            return () => {
                mounted = false;
                sub.subscription.unsubscribe();
            };
        } catch {
            setIsAuthed(false);
            return () => {
                mounted = false;
            };
        }
    }, []);

    useEffect(() => {
        if (!open) return;
        const original = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = original;
        };
    }, [open]);

    return (
        <>
            <nav className="flex items-center gap-2 md:gap-3 md:justify-end">
                <div className="hidden md:flex items-center gap-2 md:gap-3">
                    {isAuthed && PREMIUM_ITEMS.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className="inline-flex items-center min-h-11 px-3 rounded-md hover:bg-cyan-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200"
                        >
                            {item.label}
                        </Link>
                    ))}
                    <Link
                        href="#plans"
                        className="inline-flex items-center min-h-11 px-3 rounded-md hover:bg-cyan-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200"
                    >
                        Plans
                    </Link>
                </div>

                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="md:hidden inline-flex items-center justify-center min-h-11 min-w-11 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200"
                    aria-label="Open navigation"
                >
                    <Menu className="w-5 h-5" />
                </button>
            </nav>

            {open && (
                <div className="fixed inset-0 z-[70] md:hidden">
                    <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
                    <div className="absolute inset-0 bg-white dark:bg-zinc-950 p-4 flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                            <div className="text-sm font-black uppercase tracking-wider text-zinc-600 dark:text-zinc-300">Menu</div>
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                className="inline-flex items-center justify-center min-h-11 min-w-11 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200"
                                aria-label="Close navigation"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-2">
                            {isAuthed && PREMIUM_ITEMS.map((item) => (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    onClick={() => setOpen(false)}
                                    className="flex items-center min-h-11 px-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 text-zinc-700 dark:text-zinc-200 text-sm font-bold"
                                >
                                    {item.label}
                                </Link>
                            ))}
                            <Link
                                href="#plans"
                                onClick={() => setOpen(false)}
                                className="flex items-center min-h-11 px-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 text-zinc-700 dark:text-zinc-200 text-sm font-bold"
                            >
                                Plans
                            </Link>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
