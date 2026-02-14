'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/layout/Navbar';
import { IndianRupee, AlertCircle } from 'lucide-react';
import MCXPublicDataPanel from '@/components/mcx/MCXPublicDataPanel';
import MCXAdvancedChart from '@/components/mcx/MCXAdvancedChart';
import MCXSeasonalitySpreadPanel from '@/components/mcx/MCXSeasonalitySpreadPanel';
import type { McxPublicDataResponse } from '@/lib/types/mcx';

export default function NatGasMcxPage() {
    const [mcxData, setMcxData] = useState<McxPublicDataResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch('/api/mcx/public?range=5y')
            .then((res) => res.json())
            .then((data) => {
                if (data.error) throw new Error(data.error);
                setMcxData(data);
            })
            .catch((err) => {
                console.error('MCX fetch error:', err);
                setError('Failed to load MCX data panel');
            })
            .finally(() => setIsLoading(false));
    }, []);

    return (
        <div className="min-h-screen bg-white dark:bg-zinc-950 transition-colors duration-300">
            <Navbar />

            <div className="p-4 md:p-8 max-w-[1600px] mx-auto">
                <div className="mb-6 md:mb-8 text-center md:text-left">
                    <div className="flex flex-col md:flex-row items-center gap-3 mb-2 md:mb-1">
                        <IndianRupee className="w-8 h-8 md:w-10 md:h-10 text-pink-500" />
                        <h1 className="text-3xl md:text-4xl font-black bg-gradient-to-r from-pink-500 to-cyan-500 bg-clip-text text-transparent tracking-tighter">
                            NAT GAS MCX
                        </h1>
                    </div>
                    <p className="text-zinc-500 dark:text-zinc-400 text-xs md:text-sm font-medium uppercase tracking-widest">
                        Public MCX data, technical analysis terminal, seasonality and EIA spread tools
                    </p>
                </div>

                {error && (
                    <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 text-red-400" />
                        <span className="text-red-500 dark:text-red-400 text-sm font-medium">{error}</span>
                    </div>
                )}

                {isLoading && (
                    <div className="grid grid-cols-1 gap-6">
                        <div className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl h-[300px] animate-pulse" />
                        <div className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl h-[640px] animate-pulse" />
                        <div className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl h-[360px] animate-pulse" />
                    </div>
                )}

                {!isLoading && mcxData && (
                    <div className="grid grid-cols-1 gap-6">
                        <MCXPublicDataPanel data={mcxData} />
                        <MCXAdvancedChart data={mcxData.historical} />
                        <MCXSeasonalitySpreadPanel
                            historical={mcxData.historical}
                            eiaHenryHub={mcxData.eiaHenryHub}
                            usdinr={mcxData.usdinr}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
