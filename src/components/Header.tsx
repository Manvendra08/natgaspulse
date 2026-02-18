'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Logo from '@/components/Logo';
import { cn } from '@/lib/utils/cn';
import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

interface HeaderProps {
    className?: string;
}

export default function Header({ className }: HeaderProps) {
    const pathname = usePathname();
    const router = useRouter();
    const [isAuthed, setIsAuthed] = useState<boolean>(false);

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

    const navItems = isAuthed
        ? [
            { href: '/dashboard', label: 'Dashboard' },
            { href: '/forecaster', label: 'Forecaster' },
            { href: '/nat-gas-mcx', label: 'Nat Gas MCX' }
        ]
        : [];

    return (
        <header className={cn('w-full border-b border-zinc-200 dark:border-zinc-800 bg-white/85 dark:bg-zinc-950/85 backdrop-blur-sm', className)}>
            <div className="mx-auto max-w-[1600px] px-4 md:px-8 py-3 flex items-center justify-between gap-4">
                <Logo variant="text" textWidth={220} priority />

                <nav className="flex items-center gap-2">
                    {navItems.map((item) => {
                        const active = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    'px-3 py-1.5 rounded-md border text-xs md:text-sm font-semibold transition-colors',
                                    active
                                        ? 'bg-primary/10 text-primary border-primary/30'
                                        : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900'
                                )}
                            >
                                {item.label}
                            </Link>
                        );
                    })}
                    {!isAuthed ? (
                        <Link
                            href="/login"
                            className="ml-2 px-3 py-1.5 rounded-md border text-xs md:text-sm font-bold transition-colors bg-zinc-900 text-white border-zinc-800 hover:bg-zinc-800"
                        >
                            Log In
                        </Link>
                    ) : (
                        <button
                            onClick={async () => {
                                try {
                                    const supabase = createSupabaseBrowserClient();
                                    await supabase.auth.signOut();
                                } catch {
                                    // ignore
                                }
                                router.push('/');
                            }}
                            className="ml-2 px-3 py-1.5 rounded-md border text-xs md:text-sm font-bold transition-colors bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                        >
                            Sign Out
                        </button>
                    )}
                </nav>
            </div>
        </header>
    );
}
