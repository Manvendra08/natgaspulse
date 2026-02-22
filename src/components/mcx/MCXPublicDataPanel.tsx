'use client';

import { useMemo, useState } from 'react';
import { Clock, Database, CalendarRange, Package, BarChart3 } from 'lucide-react';
import type { McxPublicDataResponse } from '@/lib/types/mcx';

interface MCXPublicDataPanelProps {
    data: McxPublicDataResponse;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(value: string) {
    return new Date(value).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

function formatTime(value: string | null) {
    if (!value) return '--:--';
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return '--:--';
    return d.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
}

function tradingDaysUntil(isoDate: string): number {
    const target = new Date(isoDate);
    if (!Number.isFinite(target.getTime())) return Number.POSITIVE_INFINITY;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);

    if (target.getTime() < today.getTime()) return -1;

    let count = 0;
    const cursor = new Date(today);
    while (cursor.getTime() < target.getTime()) {
        cursor.setDate(cursor.getDate() + 1);
        const day = cursor.getDay();
        if (day !== 0 && day !== 6) {
            count += 1;
        }
    }

    return count;
}

export default function MCXPublicDataPanel({ data }: MCXPublicDataPanelProps) {
    const recentRows = data.historical.slice(-8).reverse();
    const isPositive = data.delayedPrice.change >= 0;
    const provider = data.sourceStatus.provider;
    const isLiveReference = provider === 'rupeezy-active-future';
    const sourceBadgeClass = isLiveReference
        ? 'text-cyan-600 dark:text-cyan-400 border-cyan-500/40 bg-cyan-500/10'
        : provider === 'moneycontrol-scrape'
            ? 'text-indigo-600 dark:text-indigo-300 border-indigo-500/40 bg-indigo-500/10'
            : provider === 'mcx-official'
                ? 'text-green-600 dark:text-green-400 border-green-500/40 bg-green-500/10'
                : 'text-amber-600 dark:text-amber-400 border-amber-500/40 bg-amber-500/10';
    const sourceBadgeLabel = isLiveReference
        ? 'Live Active Future'
        : provider === 'moneycontrol-scrape'
            ? 'Moneycontrol Structured Feed'
            : provider === 'mcx-official'
                ? 'Official MCX Source'
                : 'Fallback Public Source';

    const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());

    const selectedContractLabel = useMemo(() => {
        const year = Number(data.expiryCalendar?.[0]?.contract?.split(' ')[1]) || new Date().getFullYear();
        return `${MONTH_NAMES[selectedMonth]} ${year}`;
    }, [data.expiryCalendar, selectedMonth]);

    const selectedExpiry = useMemo(() => {
        const rows = data.expiryCalendar.filter((item) => item.contract === selectedContractLabel);
        return {
            fut: rows.find((row) => row.expiryType === 'FUT') || null,
            opt: rows.find((row) => row.expiryType === 'OPT') || null
        };
    }, [data.expiryCalendar, selectedContractLabel]);

    const daysToFut = selectedExpiry.fut ? tradingDaysUntil(selectedExpiry.fut.expiryDate) : Number.POSITIVE_INFINITY;
    const nearExpiry = Number.isFinite(daysToFut) && daysToFut >= 0 && daysToFut <= 5;

    return (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl dark:shadow-2xl">
                <div className="p-4 md:p-5 border-b border-zinc-100 dark:border-zinc-800 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-100 tracking-tight">MCX Public Data Feed</h2>
                        <p className="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-bold">
                            {isLiveReference
                                ? 'Active-month future price reference with settlement, volume and open interest'
                                : 'Delayed quote, settlement, volume and open interest'}
                        </p>
                    </div>
                    <div className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded border ${sourceBadgeClass}`}>
                        {sourceBadgeLabel}
                    </div>
                </div>

                <div className="p-4 md:p-5">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50/50 dark:bg-zinc-900/40">
                            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">
                                {isLiveReference ? 'Active Month Future' : 'Delayed Price'}
                            </div>
                            <div className="text-2xl font-black text-zinc-900 dark:text-zinc-100">INR {data.delayedPrice.lastPrice.toFixed(2)}</div>
                            <div className={`text-xs font-black ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {isPositive ? '+' : ''}{data.delayedPrice.change.toFixed(2)} ({data.delayedPrice.changePercent}%)
                            </div>
                        </div>
                        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50/50 dark:bg-zinc-900/40">
                            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Latest Settlement</div>
                            <div className="text-2xl font-black text-zinc-900 dark:text-zinc-100">INR {data.latestSettlement.settlementPrice.toFixed(2)}</div>
                            <div className="text-xs text-zinc-500 dark:text-zinc-400">Date: {formatDate(data.latestSettlement.date)}</div>
                        </div>
                        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50/50 dark:bg-zinc-900/40">
                            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Open Interest</div>
                            <div className="text-2xl font-black text-zinc-900 dark:text-zinc-100">{data.latestSettlement.openInterest.toLocaleString()}</div>
                            <div className={`text-xs font-black ${data.latestSettlement.oiChange >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {data.latestSettlement.oiChange >= 0 ? '+' : ''}{data.latestSettlement.oiChange.toLocaleString()} d/d
                            </div>
                        </div>
                    </div>

                    {data.moneycontrolLive.available && (
                        <div className="mb-5 rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                <h4 className="text-[11px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-300">Moneycontrol MCX Live Snapshot</h4>
                                <span className="text-[10px] text-zinc-500">Updated {formatTime(data.moneycontrolLive.asOf)}</span>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                <div className="rounded border border-indigo-500/20 bg-white/70 dark:bg-zinc-950/50 p-2">
                                    <div className="text-zinc-500">Price</div>
                                    <div className="font-black text-zinc-900 dark:text-zinc-100">INR {(data.moneycontrolLive.price || 0).toFixed(2)}</div>
                                </div>
                                <div className="rounded border border-indigo-500/20 bg-white/70 dark:bg-zinc-950/50 p-2">
                                    <div className="text-zinc-500">OI</div>
                                    <div className="font-black text-zinc-900 dark:text-zinc-100">{Math.round(data.moneycontrolLive.openInterest || 0).toLocaleString()}</div>
                                </div>
                                <div className="rounded border border-indigo-500/20 bg-white/70 dark:bg-zinc-950/50 p-2">
                                    <div className="text-zinc-500">Volume</div>
                                    <div className="font-black text-zinc-900 dark:text-zinc-100">{Math.round(data.moneycontrolLive.volume || 0).toLocaleString()}</div>
                                </div>
                                <div className="rounded border border-indigo-500/20 bg-white/70 dark:bg-zinc-950/50 p-2">
                                    <div className="text-zinc-500">Bid / Ask</div>
                                    <div className="font-black text-zinc-900 dark:text-zinc-100">{(data.moneycontrolLive.bid || 0).toFixed(2)} / {(data.moneycontrolLive.ask || 0).toFixed(2)}</div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
                        <div className="px-3 py-2 text-[11px] uppercase tracking-wider font-black text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900/40">
                            Daily Settlement and OI
                        </div>
                        <div className="md:hidden space-y-2 p-3">
                            {recentRows.map((row) => (
                                <div key={`card-${row.date}`} className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 p-3 text-xs">
                                    <div className="font-bold text-zinc-700 dark:text-zinc-200">{formatDate(row.date)}</div>
                                    <div className="mt-2 grid grid-cols-2 gap-2">
                                        <div className="text-zinc-500">Settle</div>
                                        <div className="text-right font-semibold text-zinc-900 dark:text-zinc-100">INR {row.settlement.toFixed(2)}</div>
                                        <div className="text-zinc-500">Volume</div>
                                        <div className="text-right text-zinc-600 dark:text-zinc-300">{row.volume.toLocaleString()}</div>
                                        <div className="text-zinc-500">Open Interest</div>
                                        <div className="text-right text-zinc-600 dark:text-zinc-300">{row.openInterest.toLocaleString()}</div>
                                        <div className="text-zinc-500">OI Change</div>
                                        <div className={`text-right font-bold ${row.oiChange >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                            {row.oiChange >= 0 ? '+' : ''}{row.oiChange.toLocaleString()}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="hidden md:block overflow-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">
                                        <th className="text-left px-3 py-2 font-bold">Date</th>
                                        <th className="text-right px-3 py-2 font-bold">Settle</th>
                                        <th className="text-right px-3 py-2 font-bold">Volume</th>
                                        <th className="text-right px-3 py-2 font-bold">Open Interest</th>
                                        <th className="text-right px-3 py-2 font-bold">OI Change</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recentRows.map((row) => (
                                        <tr key={row.date} className="border-b border-zinc-100 dark:border-zinc-900 last:border-0">
                                            <td className="px-3 py-2 text-zinc-700 dark:text-zinc-200">{formatDate(row.date)}</td>
                                            <td className="px-3 py-2 text-right text-zinc-900 dark:text-zinc-100 font-semibold">INR {row.settlement.toFixed(2)}</td>
                                            <td className="px-3 py-2 text-right text-zinc-600 dark:text-zinc-300">{row.volume.toLocaleString()}</td>
                                            <td className="px-3 py-2 text-right text-zinc-600 dark:text-zinc-300">{row.openInterest.toLocaleString()}</td>
                                            <td className={`px-3 py-2 text-right font-bold ${row.oiChange >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                                {row.oiChange >= 0 ? '+' : ''}{row.oiChange.toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-xl dark:shadow-2xl">
                    <div className="flex items-center gap-2 mb-3">
                        <Package className="w-4 h-4 text-primary" />
                        <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100">Contract Specs</h3>
                    </div>
                    <div className="space-y-2 text-xs">
                        <div className="flex justify-between gap-3"><span className="text-zinc-500">Symbol</span><span className="font-bold text-zinc-900 dark:text-zinc-100">{data.contractSpec.symbol}</span></div>
                        <div className="flex justify-between gap-3"><span className="text-zinc-500">Lot Size</span><span className="font-bold text-zinc-900 dark:text-zinc-100">{data.contractSpec.lotSize}</span></div>
                        <div className="flex justify-between gap-3"><span className="text-zinc-500">Tick Size</span><span className="font-bold text-zinc-900 dark:text-zinc-100">{data.contractSpec.tickSize}</span></div>
                        <div className="flex justify-between gap-3"><span className="text-zinc-500">Tick Value</span><span className="font-bold text-zinc-900 dark:text-zinc-100">INR {data.contractSpec.tickValueInr}</span></div>
                        <div className="flex justify-between gap-3"><span className="text-zinc-500">Margin</span><span className="font-bold text-zinc-900 dark:text-zinc-100">{data.contractSpec.marginRequirementPercent}%</span></div>
                    </div>
                </div>

                <div className={`bg-white dark:bg-zinc-950 border rounded-xl p-4 shadow-xl dark:shadow-2xl ${nearExpiry ? 'border-amber-500/50' : 'border-zinc-200 dark:border-zinc-800'}`}>
                    <div className="flex items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2">
                            <CalendarRange className="w-4 h-4 text-fuchsia-500" />
                            <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100">Expiry Calendar</h3>
                        </div>
                        {nearExpiry && (
                            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded border border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-300">
                                {daysToFut} trading days left
                            </span>
                        )}
                    </div>

                    <div className="mb-3">
                        <label className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Contract Month</label>
                        <select
                            value={selectedMonth}
                            onChange={(event) => setSelectedMonth(Number(event.target.value))}
                            className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-2.5 py-2 text-xs font-semibold text-zinc-800 dark:text-zinc-100"
                        >
                            {MONTH_NAMES.map((month, idx) => (
                                <option value={idx} key={month}>{month}</option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-3">
                            <div className="text-[10px] font-black uppercase tracking-wider text-cyan-700 dark:text-cyan-300 mb-1">Futures Expiry</div>
                            <div className="font-semibold text-zinc-900 dark:text-zinc-100">{selectedExpiry.fut ? formatDate(selectedExpiry.fut.expiryDate) : 'N/A'}</div>
                        </div>
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                            <div className="text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-300 mb-1">Options Expiry</div>
                            <div className="font-semibold text-zinc-900 dark:text-zinc-100">{selectedExpiry.opt ? formatDate(selectedExpiry.opt.expiryDate) : 'N/A'}</div>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-xl dark:shadow-2xl">
                    <div className="flex items-center gap-2 mb-2">
                        <Database className="w-4 h-4 text-amber-500" />
                        <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100">Source Status</h3>
                    </div>
                    <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">{data.sourceStatus.message}</p>
                    <div className="mt-3 flex items-center gap-2 text-[11px] text-zinc-500">
                        <Clock className="w-3 h-3" />
                        Last sync: {new Date(data.sourceStatus.lastSyncAt).toLocaleTimeString()}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-500">
                        <BarChart3 className="w-3 h-3" />
                        {data.sourceStatus.delayedByMinutes > 0
                            ? `Delayed by ${data.sourceStatus.delayedByMinutes} minutes`
                            : 'Live reference (no intentional delay)'}
                    </div>
                </div>
            </div>
        </div>
    );
}
