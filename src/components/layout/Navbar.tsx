'use client';

import { Activity, Clock, Sun, Moon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTheme } from '@/components/providers/ThemeProvider';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navbar() {
    const [currentTime, setCurrentTime] = useState<Date | null>(null);
    const { theme, toggleTheme } = useTheme();
    const pathname = usePathname();

    useEffect(() => {
        setCurrentTime(new Date());
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const formattedTime = currentTime ? currentTime.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    }) : '--:--:--';

    const navItems = [
        { href: '/dashboard', label: 'Dashboard' },
        { href: '/nat-gas-mcx', label: 'Nat Gas MCX' },
        { href: '/forecaster', label: 'Forecaster' }
    ];

    return (
        <nav className="h-16 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-sm flex items-center px-4 md:px-6 justify-between sticky top-0 z-50">
            <div className="flex items-center gap-4 md:gap-6">
                <div className="flex items-center gap-2 md:gap-3">
                <Activity className="w-5 h-5 md:w-6 md:h-6 text-emerald-500" />
                <div className="font-bold text-lg md:text-xl tracking-tight bg-gradient-to-r from-emerald-500 to-cyan-500 bg-clip-text text-transparent">
                    NAT GAS INTEL
                </div>
            </div>
                <div className="flex items-center gap-1 md:gap-2">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`px-2 md:px-3 py-1.5 rounded-md text-[11px] md:text-sm font-semibold transition-colors border ${
                                    isActive
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

            <div className="flex items-center gap-3 md:gap-6">
                <div className="hidden sm:flex items-center gap-2">
                    <Clock className="w-4 h-4 text-zinc-400" />
                    <span className="text-sm text-zinc-500 dark:text-zinc-400 font-mono">{formattedTime}</span>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={toggleTheme}
                        className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                        aria-label="Toggle Theme"
                    >
                        {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                    </button>

                    <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-full">
                        <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse-glow" />
                        <span className="text-[10px] md:text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase">LIVE</span>
                    </div>
                </div>
            </div>
        </nav>
    );
}
