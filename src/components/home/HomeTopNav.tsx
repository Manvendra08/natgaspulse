'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

const PREMIUM_ITEMS = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/signals', label: 'Signals' },
    { href: '/nat-gas-mcx', label: 'Nat Gas MCX' },
    { href: '/forecaster', label: 'Forecaster' },
    { href: '/trading-zone', label: 'Trading Zone' }
];

export default function HomeTopNav() {
    const [isAuthed, setIsAuthed] = useState(false);

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

    return (
        <nav className="flex flex-wrap items-center gap-2 md:gap-3 md:justify-end">
            {isAuthed && PREMIUM_ITEMS.map((item) => (
                <Link
                    key={item.href}
                    href={item.href}
                    className="px-3 py-1.5 rounded-md hover:bg-cyan-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200"
                >
                    {item.label}
                </Link>
            ))}
            <Link
                href="#plans"
                className="px-3 py-1.5 rounded-md hover:bg-cyan-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200"
            >
                Plans
            </Link>
        </nav>
    );
}
