'use client';

import { TrendingUp, TrendingDown, Calendar, Sparkles, Activity } from 'lucide-react';

interface StorageWidgetProps {
    current: number;
    change?: number;
    yearAgo: number;
    fiveYearAvg: number;
    deviation: number;
    deviationPercent: string;
    weekEndingDate: string;
    releaseDate: string;
    nextReleaseDate?: string;
    forecastChange?: number;
    isLoading?: boolean;
}

export default function StorageWidget({
    current,
    change = 0,
    yearAgo,
    fiveYearAvg,
    deviation,
    deviationPercent,
    weekEndingDate,
    releaseDate,
    nextReleaseDate,
    forecastChange = 0,
    isLoading = false
}: StorageWidgetProps) {
    const isPositiveDeviation = deviation > 0;
    const isPositiveChange = change > 0;
    const isPositiveForecast = forecastChange > 0;

    const today = new Date();
    const isReportDay = nextReleaseDate ? (
        new Date(nextReleaseDate).toDateString() === today.toDateString()
    ) : false;

    const formattedWeekEnding = new Date(weekEndingDate).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    });

    const releaseObj = new Date(releaseDate);
    const formattedRelease = releaseObj.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    }) + ` at ${releaseObj.getHours() > 12 ? releaseObj.getHours() - 12 : releaseObj.getHours()}:${releaseObj.getMinutes().toString().padStart(2, '0')} a.m.`;

    const formattedNextRelease = nextReleaseDate
        ? new Date(nextReleaseDate).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        })
        : 'Calculating...';

    if (isLoading) {
        return (
            <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 rounded-xl p-6 shadow-2xl">
                <div className="animate-pulse space-y-4">
                    <div className="h-6 bg-zinc-800 rounded w-1/2"></div>
                    <div className="h-12 bg-zinc-800 rounded"></div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="h-16 bg-zinc-800 rounded"></div>
                        <div className="h-16 bg-zinc-800 rounded"></div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 md:p-6 shadow-xl dark:shadow-2xl hover:border-green-500/30 transition-all duration-300 relative overflow-hidden h-full">
            {isReportDay && (
                <div className="absolute top-0 right-0 px-4 py-1 bg-red-600 animate-pulse transition-all">
                    <span className="text-[10px] font-black text-white uppercase tracking-widest">Report Day</span>
                </div>
            )}

            <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-green-500/10 rounded-lg border border-green-500/30">
                        <Activity className="w-5 h-5 text-green-500" />
                    </div>
                    <h2 className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">Natural Gas Storage Data</h2>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 md:gap-x-4 gap-y-1 text-[10px] md:text-[11px] font-bold text-zinc-500 dark:text-zinc-400">
                    <div className="flex items-center gap-1">
                        <span>for</span>
                        <span className="text-zinc-800 dark:text-zinc-200">week ending {formattedWeekEnding}</span>
                    </div>
                    <div className="hidden sm:block text-zinc-300 dark:text-zinc-700">|</div>
                    <div className="flex items-center gap-1">
                        <span>Released:</span>
                        <span className="text-zinc-800 dark:text-zinc-200">{formattedRelease}</span>
                    </div>
                </div>
            </div>

            {/* Current Storage - Hero Number */}
            <div className="flex flex-col sm:flex-row items-baseline sm:items-end justify-between mb-6 gap-4">
                <div>
                    <div className="text-xs md:text-sm font-bold text-zinc-500 mb-1 uppercase tracking-wider">Current Inventory</div>
                    <div className="text-4xl md:text-5xl font-black bg-gradient-to-r from-green-600 to-cyan-600 dark:from-green-400 dark:to-cyan-400 bg-clip-text text-transparent">
                        {current.toLocaleString()}
                    </div>
                    <div className="text-[9px] md:text-xs text-zinc-400 dark:text-zinc-500 mt-1 uppercase font-bold tracking-tighter">Billion Cubic Feet (BCF)</div>
                </div>
                <div className="sm:text-right w-full sm:w-auto p-3 sm:p-0 bg-zinc-50 dark:bg-transparent rounded-lg">
                    <div className="text-[10px] md:text-xs font-bold text-zinc-500 mb-1 uppercase tracking-wider">Weekly Change</div>
                    <div className={`text-xl md:text-2xl font-black flex items-center sm:justify-end gap-1 ${isPositiveChange ? 'text-green-500' : 'text-red-500'}`}>
                        {isPositiveChange ? '+' : ''}{change.toLocaleString()}
                        <span className="text-xs font-bold text-zinc-400 ml-1">BCF</span>
                    </div>
                </div>
            </div>

            {/* Deviation & Metrics Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {/* Deviation Badge */}
                <div className={`flex flex-col justify-center px-4 py-3 rounded-lg border ${isPositiveDeviation
                    ? 'bg-green-500/5 dark:bg-green-500/10 border-green-500/20 dark:border-green-500/30'
                    : 'bg-red-500/5 dark:bg-red-500/10 border-red-500/20 dark:border-red-500/30'
                    }`}>
                    <div className="flex items-center gap-2 mb-1">
                        {isPositiveDeviation ? (
                            <TrendingUp className="w-4 h-4 text-green-500" />
                        ) : (
                            <TrendingDown className="w-4 h-4 text-red-500" />
                        )}
                        <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase">vs. 5yr Average</span>
                    </div>
                    <div className={`text-xl font-black ${isPositiveDeviation ? 'text-green-500' : 'text-red-500'}`}>
                        {isPositiveDeviation ? '+' : ''}{deviation.toLocaleString()} BCF
                        <span className="text-xs font-bold ml-2 opacity-80 uppercase">({deviationPercent}%)</span>
                    </div>
                </div>

                {/* Next Release & Forecast */}
                <div className="bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                            <Calendar className="w-3.5 h-3.5" />
                            <span className="text-[9px] uppercase font-black tracking-widest">Next Release</span>
                        </div>
                        <span className="text-[10px] font-bold text-zinc-800 dark:text-zinc-200 uppercase">{formattedNextRelease}</span>
                    </div>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-200 dark:border-zinc-800/50">
                        <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                            <Sparkles className="w-3.5 h-3.5" />
                            <span className="text-[9px] uppercase font-black tracking-widest">Est. Change</span>
                        </div>
                        <span className={`text-sm font-black ${isPositiveForecast ? 'text-green-500' : 'text-red-500'}`}>
                            {isPositiveForecast ? '+' : ''}{forecastChange.toLocaleString()} BCF
                        </span>
                    </div>
                </div>
            </div>

            {/* Comparison Grid */}
            <div className="grid grid-cols-2 gap-3 md:gap-4">
                <div className="bg-zinc-50 dark:bg-zinc-900/40 rounded-lg p-3 border border-zinc-200 dark:border-zinc-800/50">
                    <div className="text-[9px] md:text-[10px] uppercase font-black text-zinc-500 mb-1 tracking-widest">Year Ago</div>
                    <div className="text-base md:text-lg font-black text-zinc-800 dark:text-zinc-200">
                        {yearAgo.toLocaleString()} <span className="text-[10px] font-bold text-zinc-400">BCF</span>
                    </div>
                </div>

                <div className="bg-zinc-50 dark:bg-zinc-900/40 rounded-lg p-3 border border-zinc-200 dark:border-zinc-800/50">
                    <div className="text-[9px] md:text-[10px] uppercase font-black text-zinc-500 mb-1 tracking-widest">5-Yr Avg</div>
                    <div className="text-base md:text-lg font-black text-zinc-800 dark:text-zinc-200">
                        {fiveYearAvg.toLocaleString()} <span className="text-[10px] font-bold text-zinc-400">BCF</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

