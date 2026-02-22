'use client';

import { useEffect, useState } from 'react';
import { Activity, Clock, TrendingDown, TrendingUp } from 'lucide-react';

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

interface McxMonthQuote {
    contract: string;
    price: number;
    change: number;
    changePercent: number;
    asOf: string;
}

interface McxAnalyticsResponse {
    sourceStatus: {
        provider: 'rupeezy-active-future' | 'tradingview-scanner' | 'moneycontrol-scrape' | 'mcx-official' | 'fallback-yahoo';
        lastSyncAt: string;
        message: string;
    };
    henryHubLive: {
        price: number;
        change: number;
        changePercent: number;
        asOf: string;
        source: 'yahoo-finance-ng-f' | 'eia-futures-daily';
    };
    activeMonth: McxMonthQuote;
    nextMonth: McxMonthQuote | null;
}

interface MarketOverviewWidgetProps {
    data: PriceData | null;
    isLoading?: boolean;
}

function formatAsOf(value: string | null): string {
    if (!value) return '--:--:--';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '--:--:--';
    return date.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
}

export default function MarketOverviewWidget({ data: _legacyData, isLoading }: MarketOverviewWidgetProps) {
    void _legacyData;
    const [mcxData, setMcxData] = useState<McxAnalyticsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;

        const fetchMcxAnalytics = async () => {
            try {
                if (!mcxData) {
                    setLoading(true);
                }
                const res = await fetch('/api/mcx/public?range=1y', { cache: 'no-store' });
                const json = await res.json();
                if (!res.ok || json?.error) {
                    throw new Error(json?.error || `HTTP ${res.status}`);
                }
                if (active) {
                    setMcxData(json as McxAnalyticsResponse);
                    setError(null);
                }
            } catch (err: any) {
                if (active) {
                    setError(err?.message || 'Failed to load MCX futures analytics');
                }
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        };

        fetchMcxAnalytics();
        const interval = setInterval(fetchMcxAnalytics, 20 * 1000);

        return () => {
            active = false;
            clearInterval(interval);
        };
    }, []);

    if ((loading || isLoading) && !mcxData) {
        return (
            <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 rounded-xl p-6 shadow-2xl h-[240px] animate-pulse">
                <div className="flex justify-between mb-4">
                    <div className="h-6 bg-zinc-800 rounded w-1/3"></div>
                    <div className="h-6 bg-zinc-800 rounded w-1/4"></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="h-24 bg-zinc-800 rounded"></div>
                    <div className="h-24 bg-zinc-800 rounded"></div>
                </div>
            </div>
        );
    }

    const activeMonth = mcxData?.activeMonth;
    const nextMonth = mcxData?.nextMonth;
    const henryHub = mcxData?.henryHubLive;

    return (
        <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 md:p-6 shadow-xl dark:shadow-2xl h-full">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-pink-500/10 rounded-lg border border-pink-500/30">
                        <Activity className="w-5 h-5 text-pink-500" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 italic tracking-tight">Market Analytics</h2>
                        <p className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase tracking-widest font-bold">Henry Hub + MCX Natural Gas Futures</p>
                    </div>
                </div>
                <div className="flex flex-col items-end gap-1 text-[11px] text-zinc-500">
                    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
                        <Clock className="w-3 h-3 text-emerald-500" />
                        Last sync {formatAsOf(mcxData?.sourceStatus?.lastSyncAt || null)}
                    </div>
                    <div className="text-[9px] uppercase tracking-widest font-black text-zinc-400 dark:text-zinc-500">20s poll</div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <HenryHubCard quote={henryHub || null} />
                <MonthCard label="MCX Active Month" quote={activeMonth || null} />
                <MonthCard label="MCX Next Month" quote={nextMonth || null} />
            </div>

            <div className="pt-4 mt-4 border-t border-zinc-200 dark:border-zinc-800/60 text-[10px] uppercase tracking-wider font-bold text-zinc-500 flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Source: {mcxData?.sourceStatus?.provider || 'mcx-proxy'}
                </span>
                <span>Henry Hub: {henryHub?.source || 'unavailable'}</span>
                <span>Proxy: /api/mcx/public</span>
                {error && <span className="text-amber-500">{error}</span>}
            </div>
        </div>
    );
}

function HenryHubCard({ quote }: {
    quote: {
        price: number;
        change: number;
        changePercent: number;
        asOf: string;
        source: 'yahoo-finance-ng-f' | 'eia-futures-daily';
    } | null
}) {
    const isPositive = (quote?.change || 0) >= 0;

    if (!quote) {
        return (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 p-4">
                <p className="text-[11px] uppercase tracking-wider font-black text-zinc-500">Henry Hub Live</p>
                <p className="mt-4 text-sm text-zinc-500">Price unavailable</p>
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 p-4">
            <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] uppercase tracking-wider font-black text-zinc-500">Henry Hub Live</p>
                <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-400">USD/MMBtu</span>
            </div>

            <p className="mt-2 text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-100">${quote.price.toFixed(4)}</p>

            <div className={`mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-black ${isPositive ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/10 text-red-600 dark:text-red-400'}`}>
                {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {isPositive ? '+' : ''}{quote.change.toFixed(4)} ({isPositive ? '+' : ''}{quote.changePercent.toFixed(4)}%)
            </div>

            <p className="mt-2 text-[10px] uppercase tracking-wider text-zinc-500">Updated {formatAsOf(quote.asOf)}</p>
        </div>
    );
}

function MonthCard({ label, quote }: { label: string; quote: McxMonthQuote | null }) {
    const isPositive = (quote?.change || 0) >= 0;

    if (!quote) {
        return (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 p-4">
                <p className="text-[11px] uppercase tracking-wider font-black text-zinc-500">{label}</p>
                <p className="mt-4 text-sm text-zinc-500">Price unavailable</p>
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 p-4">
            <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] uppercase tracking-wider font-black text-zinc-500">{label}</p>
                <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-400">{quote.contract}</span>
            </div>

            <p className="mt-2 text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-100">INR {quote.price.toFixed(2)}</p>

            <div className={`mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-black ${isPositive ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/10 text-red-600 dark:text-red-400'}`}>
                {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {isPositive ? '+' : ''}{quote.change.toFixed(2)} ({isPositive ? '+' : ''}{quote.changePercent.toFixed(2)}%)
            </div>

            <p className="mt-2 text-[10px] uppercase tracking-wider text-zinc-500">Updated {formatAsOf(quote.asOf)}</p>
        </div>
    );
}
