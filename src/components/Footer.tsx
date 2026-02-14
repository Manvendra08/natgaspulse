import Logo from '@/components/Logo';
import { cn } from '@/lib/utils/cn';

interface FooterProps {
    className?: string;
}

export default function Footer({ className }: FooterProps) {
    return (
        <footer className={cn('w-full border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950', className)}>
            <div className="mx-auto max-w-[1600px] px-4 md:px-8 py-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Logo variant="icon" iconSize={34} />
                    <div>
                        <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">NatGasPulse</div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400">Real-time natural gas market intelligence</div>
                    </div>
                </div>

                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    {new Date().getFullYear()} NatGasPulse. Market data for research and monitoring.
                </div>
            </div>
        </footer>
    );
}

