'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Logo from '@/components/Logo';
import { cn } from '@/lib/utils/cn';

interface HeaderProps {
    className?: string;
}

const navItems = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/forecaster', label: 'Forecaster' },
    { href: '/nat-gas-mcx', label: 'Nat Gas MCX' }
];

export default function Header({ className }: HeaderProps) {
    const pathname = usePathname();

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
                </nav>
            </div>
        </header>
    );
}
