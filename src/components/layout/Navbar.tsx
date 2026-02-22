'use client';

import { Activity, ArrowLeft, Clock, LogOut, Menu, Moon, Sun, User, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTheme } from '@/components/providers/ThemeProvider';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

const PUBLIC_PATH_PREFIXES = ['/', '/login', '/signup', '/forgot', '/auth/reset', '/auth/callback'];

function resolveUserName(user: any): string {
    const raw =
        user?.user_metadata?.username ||
        user?.user_metadata?.full_name ||
        user?.user_metadata?.name ||
        user?.user_metadata?.preferred_username ||
        '';
    const normalized = String(raw || '').trim();
    if (normalized) return normalized;
    const email = String(user?.email || '').trim();
    if (email.includes('@')) return email.split('@')[0];
    return email || 'User';
}

function isPublicPath(pathname: string): boolean {
    if (pathname === '/') return true;
    return PUBLIC_PATH_PREFIXES.some((base) => base !== '/' && (pathname === base || pathname.startsWith(`${base}/`)));
}

export default function Navbar() {
    const [currentTime, setCurrentTime] = useState<Date | null>(null);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const { theme, toggleTheme } = useTheme();
    const pathname = usePathname();
    const router = useRouter();
    const [isAuthed, setIsAuthed] = useState<boolean>(false);
    const [authResolved, setAuthResolved] = useState<boolean>(false);
    const [userName, setUserName] = useState<string>('');

    useEffect(() => {
        setCurrentTime(new Date());
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        let mounted = true;
        try {
            const s = createSupabaseBrowserClient();
            const syncUserState = async (user: any) => {
                if (!mounted) return;
                setIsAuthed(Boolean(user));
                setUserName(resolveUserName(user));
                setAuthResolved(true);
                if (!user) return;
                try {
                    const profileRes = await fetch('/api/profile', { cache: 'no-store' });
                    const profileJson = await profileRes.json().catch(() => null);
                    const profileName = String(profileJson?.profile?.fullName || '').trim();
                    if (mounted && profileName) {
                        setUserName(profileName);
                    }
                } catch {
                    // Ignore profile lookup issues.
                }
            };

            s.auth.getUser().then(({ data }) => {
                syncUserState(data.user);
            });

            const { data: sub } = s.auth.onAuthStateChange((_evt, session) => {
                syncUserState(session?.user);
            });

            return () => {
                mounted = false;
                sub.subscription.unsubscribe();
            };
        } catch {
            setIsAuthed(false);
            setAuthResolved(true);
            setUserName('');
            return () => {
                mounted = false;
            };
        }
    }, []);

    useEffect(() => {
        if (!authResolved) return;
        if (isAuthed) return;
        if (isPublicPath(pathname)) return;
        router.replace('/');
    }, [authResolved, isAuthed, pathname, router]);

    useEffect(() => {
        setMobileMenuOpen(false);
    }, [pathname]);

    useEffect(() => {
        if (!mobileMenuOpen) return;
        const original = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = original;
        };
    }, [mobileMenuOpen]);

    const formattedTime = currentTime
        ? currentTime.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        })
        : '--:--:--';

    const formattedDate = currentTime
        ? currentTime.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        })
        : '---';

    const supabase = useMemo(() => {
        try {
            return createSupabaseBrowserClient();
        } catch {
            return null;
        }
    }, []);

    const publicNavItems = [
        { href: '/', label: 'Home' },
        { href: '/#plans', label: 'Plans' }
    ];

    const premiumNavItems = [
        { href: '/', label: 'Home' },
        { href: '/dashboard', label: 'Dashboard' },
        { href: '/signals', label: 'Signals' },
        { href: '/nat-gas-mcx', label: 'Nat Gas MCX' },
        { href: '/forecaster', label: 'Forecaster' },
        { href: '/trading-zone', label: 'Trading Zone' }
    ];

    const navItems = isAuthed ? premiumNavItems : publicNavItems;

    const handleSignOut = async () => {
        try {
            if (supabase) {
                await supabase.auth.signOut();
            }
        } catch {
            // ignore
        }
        setMobileMenuOpen(false);
        router.push('/');
    };

    return (
        <>
            <nav className="h-16 border-b border-zinc-200 dark:border-zinc-800 bg-white/85 dark:bg-zinc-950/85 backdrop-blur-sm flex items-center px-4 md:px-6 justify-between sticky top-0 z-50">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 md:gap-3">
                        <Activity className="w-5 h-5 md:w-6 md:h-6 text-emerald-500" />
                        <div className="font-bold text-base md:text-xl tracking-tight bg-gradient-to-r from-emerald-500 to-cyan-500 bg-clip-text text-transparent">
                            NAT GAS INTEL
                        </div>
                    </div>

                    <div className="hidden md:flex items-center gap-1 md:gap-2">
                        {navItems.map((item) => {
                            const isPlansLink = item.href === '/#plans';
                            const isActive = isPlansLink ? pathname === '/' : pathname === item.href;
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`inline-flex items-center min-h-11 px-3 rounded-md text-sm font-semibold transition-colors border ${isActive
                                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                                        : 'bg-transparent border-transparent text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900'
                                        }`}
                                >
                                    {item.label}
                                </Link>
                            );
                        })}
                    </div>
                </div>

                <div className="flex items-center gap-2 md:gap-3">
                    <div className="hidden lg:flex items-center gap-2">
                        <Clock className="w-4 h-4 text-zinc-400" />
                        <div className="flex flex-col leading-tight">
                            <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-semibold">{formattedDate}</span>
                            <span className="text-sm text-zinc-500 dark:text-zinc-400 font-mono">{formattedTime}</span>
                        </div>
                    </div>

                    {pathname === '/' && !isAuthed && (
                        <div className="hidden md:flex items-center gap-2">
                            <Link
                                href="/login"
                                className="inline-flex items-center min-h-11 px-4 rounded-lg bg-zinc-900 text-white text-sm font-black border border-zinc-800 hover:bg-zinc-800 transition"
                            >
                                Log In
                            </Link>
                            <Link
                                href="/signup"
                                className="inline-flex items-center min-h-11 px-4 rounded-lg bg-emerald-600 text-white text-sm font-black border border-emerald-500/30 hover:bg-emerald-500 transition"
                            >
                                Sign Up
                            </Link>
                        </div>
                    )}

                    {isAuthed && (
                        <div className="relative hidden md:block">
                            <details className="group">
                                <summary className="list-none cursor-pointer inline-flex items-center gap-2 min-h-11 px-3 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-sm font-black hover:bg-zinc-200 dark:hover:bg-zinc-800 transition">
                                    <User className="w-4 h-4" />
                                    Profile
                                </summary>
                                <div className="absolute right-0 mt-2 w-64 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-2xl p-3 z-50">
                                    <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Signed In</div>
                                    <div className="text-sm font-bold text-zinc-700 dark:text-zinc-300 mt-1">{userName || 'User'}</div>
                                    <div className="h-px bg-zinc-200 dark:bg-zinc-800 my-3" />
                                    <button
                                        onClick={() => router.back()}
                                        className="w-full inline-flex items-center gap-2 min-h-11 px-3 rounded-lg text-sm font-bold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                                    >
                                        <ArrowLeft className="w-4 h-4" />
                                        Go Back
                                    </button>
                                    <Link
                                        href="/profile"
                                        className="mt-1 block min-h-11 px-3 py-2 rounded-lg text-sm font-bold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                                    >
                                        Profile
                                    </Link>
                                    <button
                                        onClick={handleSignOut}
                                        className="w-full mt-2 inline-flex items-center justify-center gap-2 min-h-11 px-3 rounded-lg text-sm font-black bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500/15 transition"
                                    >
                                        <LogOut className="w-4 h-4" />
                                        Log Out
                                    </button>
                                </div>
                            </details>
                        </div>
                    )}

                    <button
                        onClick={toggleTheme}
                        className="inline-flex items-center justify-center min-h-11 min-w-11 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                        aria-label="Toggle Theme"
                    >
                        {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                    </button>

                    {isAuthed && (
                        <div className="hidden sm:inline-flex items-center gap-2 min-h-11 px-3 bg-emerald-500/10 border border-emerald-500/30 rounded-full">
                            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse-glow" />
                            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase">LIVE</span>
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={() => setMobileMenuOpen(true)}
                        className="md:hidden inline-flex items-center justify-center min-h-11 min-w-11 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300"
                        aria-label="Open menu"
                    >
                        <Menu className="w-5 h-5" />
                    </button>
                </div>
            </nav>

            {mobileMenuOpen && (
                <div className="fixed inset-0 z-[60] md:hidden">
                    <div className="absolute inset-0 bg-black/40" onClick={() => setMobileMenuOpen(false)} />
                    <div className="absolute inset-0 bg-white dark:bg-zinc-950 p-4 flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                            <div className="text-sm font-black text-zinc-700 dark:text-zinc-200 uppercase tracking-wider">Navigation</div>
                            <button
                                type="button"
                                onClick={() => setMobileMenuOpen(false)}
                                className="inline-flex items-center justify-center min-h-11 min-w-11 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
                                aria-label="Close menu"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 font-semibold mb-4">
                            {formattedDate} • {formattedTime}
                        </div>

                        <div className="space-y-2">
                            {navItems.map((item) => {
                                const isPlansLink = item.href === '/#plans';
                                const isActive = isPlansLink ? pathname === '/' : pathname === item.href;
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        onClick={() => setMobileMenuOpen(false)}
                                        className={`flex items-center min-h-11 px-4 rounded-lg text-sm font-bold border ${isActive
                                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                                            : 'bg-zinc-50 dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300'
                                            }`}
                                    >
                                        {item.label}
                                    </Link>
                                );
                            })}
                        </div>

                        <div className="mt-auto space-y-2 pt-6 border-t border-zinc-200 dark:border-zinc-800">
                            {isAuthed ? (
                                <>
                                    <Link
                                        href="/profile"
                                        onClick={() => setMobileMenuOpen(false)}
                                        className="flex items-center min-h-11 px-4 rounded-lg bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-sm font-bold"
                                    >
                                        {userName || 'Profile'}
                                    </Link>
                                    <button
                                        onClick={handleSignOut}
                                        className="w-full inline-flex items-center justify-center min-h-11 px-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm font-black"
                                    >
                                        Log Out
                                    </button>
                                </>
                            ) : (
                                <div className="grid grid-cols-2 gap-2">
                                    <Link
                                        href="/login"
                                        onClick={() => setMobileMenuOpen(false)}
                                        className="inline-flex items-center justify-center min-h-11 px-4 rounded-lg bg-zinc-900 text-white text-sm font-black border border-zinc-800"
                                    >
                                        Log In
                                    </Link>
                                    <Link
                                        href="/signup"
                                        onClick={() => setMobileMenuOpen(false)}
                                        className="inline-flex items-center justify-center min-h-11 px-4 rounded-lg bg-emerald-600 text-white text-sm font-black border border-emerald-500/30"
                                    >
                                        Sign Up
                                    </Link>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
