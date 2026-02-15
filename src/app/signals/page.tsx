'use client';

import Navbar from '@/components/layout/Navbar';
import TradingSignalBot from '@/components/widgets/TradingSignalBot';
import { Zap } from 'lucide-react';

export default function SignalsPage() {
    return (
        <div className="min-h-screen bg-white dark:bg-zinc-950 transition-colors duration-300">
            <Navbar />

            <div className="p-4 md:p-8 max-w-[1600px] mx-auto">
                {/* Header */}
                <div className="mb-6 md:mb-8 text-center md:text-left">
                    <div className="flex flex-col md:flex-row items-center gap-3 mb-2 md:mb-1">
                        <Zap className="w-8 h-8 md:w-10 md:h-10 text-violet-500" />
                        <h1 className="text-3xl md:text-4xl font-black bg-gradient-to-r from-violet-500 to-pink-500 bg-clip-text text-transparent tracking-tighter">
                            SIGNAL BOT
                        </h1>
                    </div>
                    <p className="text-zinc-500 dark:text-zinc-400 text-xs md:text-sm font-medium uppercase tracking-widest">
                        Multi-Timeframe Analysis • Buy/Sell Signals • Options & Futures Advisor
                    </p>
                </div>

                <TradingSignalBot />
            </div>
        </div>
    );
}
