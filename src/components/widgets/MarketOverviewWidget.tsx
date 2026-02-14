'use client';
import { useState, useEffect } from 'react';
import {
    DollarSign,
    IndianRupee,
    Clock,
    TrendingUp,
    TrendingDown,
    ArrowRightLeft,
    Activity
} from 'lucide-react';

interface PriceData {
    current: number;
    change: number;
    changePercent: string;
    date: string;
    historicalPrices?: { period: string; value: number }[];
    nextMonth?: {
        current: number;
        change: number;
        changePercent: string;
    };
}

interface MarketOverviewWidgetProps {
    data: PriceData | null;
    isLoading?: boolean;
}

export default function MarketOverviewWidget({ data, isLoading }: MarketOverviewWidgetProps) {
    const [usdinr, setUsdinr] = useState<number>(83.50);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    const fetchCurrency = async () => {
        try {
            const curRes = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
            const curJson = await curRes.json();
            if (curJson.rates && curJson.rates.INR) {
                setUsdinr(curJson.rates.INR);
                setLastUpdated(new Date());
            }
        } catch (err) {
            console.error('Currency fetch error:', err);
        }
    };

    useEffect(() => {
        fetchCurrency();
        const interval = setInterval(fetchCurrency, 300000); // 5m refresh
        return () => clearInterval(interval);
    }, []);

    if (isLoading && !data) {
        return (
            <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 rounded-xl p-6 shadow-2xl h-[240px] animate-pulse">
                <div className="flex justify-between mb-4">
                    <div className="h-6 bg-zinc-800 rounded w-1/3"></div>
                    <div className="h-6 bg-zinc-800 rounded w-1/4"></div>
                </div>
                <div className="grid grid-cols-2 gap-6">
                    <div className="h-24 bg-zinc-800 rounded"></div>
                    <div className="h-24 bg-zinc-800 rounded"></div>
                </div>
            </div>
        );
    }

    const active = {
        current: data?.current || 0,
        change: data?.change || 0,
        changePercent: parseFloat(data?.changePercent || '0')
    };

    const next = data?.nextMonth ? {
        current: data.nextMonth.current,
        change: data.nextMonth.change,
        changePercent: parseFloat(data.nextMonth.changePercent)
    } : null;

    const isPositive = active.change >= 0;

    // MCX Parity Calculations
    const mcxActive = active.current * usdinr;
    const mcxActiveChange = active.change * usdinr;

    const mcxNext = next ? next.current * usdinr : 0;
    const mcxNextChange = next ? next.change * usdinr : 0;

    return (
        <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 md:p-6 shadow-xl dark:shadow-2xl hover:border-pink-500/30 transition-all duration-300 h-full">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-pink-500/10 rounded-lg border border-pink-500/30">
                        <Activity className="w-5 h-5 text-pink-500" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 italic tracking-tight">Market Analytics</h2>
                        <p className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase tracking-widest font-bold">NYMEX Futures | MCX Parity</p>
                    </div>
                </div>
                {lastUpdated && (
                    <div className="hidden sm:flex flex-col items-end">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-500 bg-zinc-50 dark:bg-zinc-900/50 px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-800">
                            <Clock className="w-3 h-3 text-emerald-500" />
                            <span>{lastUpdated.toLocaleTimeString()}</span>
                        </div>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-4">
                {/* Henry Hub Column */}
                <div className="relative">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold text-amber-600 dark:text-amber-500/80 uppercase flex items-center gap-1">
                            <DollarSign className="w-3 h-3" /> NYMEX Active
                        </span>
                        <div className={`flex items-center gap-1 text-[11px] font-black px-1.5 py-0.5 rounded ${isPositive ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/10 text-red-600 dark:text-red-400'}`}>
                            {isPositive ? '+' : ''}{active.changePercent.toFixed(2)}%
                        </div>
                    </div>

                    <div className="flex flex-col mb-4">
                        <div className="flex flex-col">
                            <span className="text-3xl md:text-4xl font-black text-zinc-900 dark:text-zinc-100 tracking-tighter leading-tight">
                                ${active.current.toFixed(3)}
                            </span>
                            <span className="text-[9px] text-zinc-400 dark:text-zinc-500 font-black uppercase tracking-widest mt-0.5">Active Contract | Mar 2026</span>
                        </div>
                        <span className={`text-[10px] font-black mt-2 flex items-center gap-1 ${isPositive ? 'text-emerald-600 dark:text-emerald-500/80' : 'text-red-600 dark:text-red-500/80'}`}>
                            {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {active.change.toFixed(3)} move from prev close
                        </span>
                    </div>

                    {next && (
                        <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800/50 flex items-center justify-between">
                            <div className="flex flex-col">
                                <span className="text-[9px] text-zinc-400 dark:text-zinc-500 font-black uppercase tracking-tighter">Next Cycle (Apr)</span>
                                <span className="text-sm font-black text-zinc-700 dark:text-zinc-300 tracking-tight">${next.current.toFixed(3)}</span>
                            </div>
                            <div className={`text-[10px] font-black px-2 py-0.5 rounded-full ${next.change >= 0 ? 'bg-emerald-500/5 text-emerald-600 dark:text-emerald-500' : 'bg-red-500/5 text-red-600 dark:text-red-500'}`}>
                                {next.change >= 0 ? '+' : ''}{next.change.toFixed(3)} ({next.changePercent}%)
                            </div>
                        </div>
                    )}
                </div>

                {/* MCX Column */}
                <div className="relative pl-0 md:pl-8 border-l-0 md:border-l border-zinc-200 dark:border-zinc-800/50">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold text-sky-600 dark:text-sky-500/80 uppercase flex items-center gap-1">
                            <IndianRupee className="w-3 h-3" /> MCX Equivalent
                        </span>
                        <div className="text-[9px] text-zinc-500 font-bold bg-zinc-50 dark:bg-zinc-900/50 px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-800/50">
                            1 USD = INR {usdinr.toFixed(2)}
                        </div>
                    </div>

                    <div className="flex flex-col mb-4">
                        <div className="flex flex-col">
                            <span className="text-3xl md:text-4xl font-black text-zinc-900 dark:text-zinc-100 tracking-tighter leading-tight">
                                INR {mcxActive.toFixed(1)}
                            </span>
                            <span className="text-[9px] text-zinc-400 dark:text-zinc-500 font-black uppercase tracking-widest mt-0.5">Settlement (Theoretical)</span>
                        </div>
                        <span className={`text-[10px] font-black mt-2 flex items-center gap-1 ${mcxActiveChange >= 0 ? 'text-emerald-600 dark:text-emerald-500/80' : 'text-red-600 dark:text-red-500/80'}`}>
                            {mcxActiveChange >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            INR {Math.abs(mcxActiveChange).toFixed(1)} volatility offset
                        </span>
                    </div>

                    {next && (
                        <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800/50 flex items-center justify-between">
                            <div className="flex flex-col">
                                <span className="text-[9px] text-zinc-400 dark:text-zinc-500 font-black uppercase tracking-tighter">Apr Parity Estimate</span>
                                <span className="text-sm font-black text-zinc-700 dark:text-zinc-300 tracking-tight">INR {mcxNext.toFixed(1)}</span>
                            </div>
                            <div className={`text-[10px] font-black px-2 py-0.5 rounded-full ${mcxNextChange >= 0 ? 'bg-emerald-500/5 text-emerald-600 dark:text-emerald-500' : 'bg-red-500/5 text-red-600 dark:text-red-500'}`}>
                                {mcxNextChange >= 0 ? '+' : '-'} INR {Math.abs(mcxNextChange).toFixed(1)}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="pt-4 border-t border-zinc-800/50 flex flex-wrap items-center gap-4 text-[10px] text-zinc-500 font-medium uppercase tracking-wider">
                <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                    Source: Live Market Feed
                </div>
                <div className="flex items-center gap-1.5">
                    <ArrowRightLeft className="w-3 h-3" />
                    Theoretical Conversion (No Premium)
                </div>
                <div className="ml-auto flex items-center gap-1.5 text-zinc-400">
                    {data?.date && (
                        <span className={(new Date().getTime() - new Date(data.date).getTime()) > 172800000 ? 'text-amber-500/80 font-bold' : ''}>
                            {`Report Date: ${new Date(data.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`}
                            {(new Date().getTime() - new Date(data.date).getTime()) > 172800000 && ' (EIA Lag)'}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
