'use client';

import { Clock, Database, CalendarRange, Package, BarChart3 } from 'lucide-react';
import type { McxPublicDataResponse } from '@/lib/types/mcx';

interface MCXPublicDataPanelProps {
    data: McxPublicDataResponse;
}

function formatDate(value: string) {
    return new Date(value).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

export default function MCXPublicDataPanel({ data }: MCXPublicDataPanelProps) {
    const recentRows = data.historical.slice(-8).reverse();
    const isPositive = data.delayedPrice.change >= 0;

    return (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl dark:shadow-2xl">
                <div className="p-4 md:p-5 border-b border-zinc-100 dark:border-zinc-800 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-100 tracking-tight">MCX Public Data Feed</h2>
                        <p className="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-bold">
                            Delayed quote, settlement, volume and open interest
                        </p>
                    </div>
                    <div className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded border ${data.sourceStatus.officialAvailable
                        ? 'text-emerald-600 dark:text-emerald-400 border-emerald-500/40 bg-emerald-500/10'
                        : 'text-amber-600 dark:text-amber-400 border-amber-500/40 bg-amber-500/10'
                        }`}>
                        {data.sourceStatus.provider === 'mcx-official' ? 'Official MCX Source' : 'Fallback Public Source'}
                    </div>
                </div>

                <div className="p-4 md:p-5">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50/50 dark:bg-zinc-900/40">
                            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Delayed Price</div>
                            <div className="text-2xl font-black text-zinc-900 dark:text-zinc-100">INR {data.delayedPrice.lastPrice.toFixed(2)}</div>
                            <div className={`text-xs font-black ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
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
                            <div className={`text-xs font-black ${data.latestSettlement.oiChange >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                                {data.latestSettlement.oiChange >= 0 ? '+' : ''}{data.latestSettlement.oiChange.toLocaleString()} d/d
                            </div>
                        </div>
                    </div>

                    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
                        <div className="px-3 py-2 text-[11px] uppercase tracking-wider font-black text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900/40">
                            Daily Settlement and OI
                        </div>
                        <div className="overflow-auto">
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
                                            <td className={`px-3 py-2 text-right font-bold ${row.oiChange >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
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
                        <Package className="w-4 h-4 text-cyan-500" />
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

                <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-xl dark:shadow-2xl">
                    <div className="flex items-center gap-2 mb-3">
                        <CalendarRange className="w-4 h-4 text-fuchsia-500" />
                        <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100">Expiry Calendar</h3>
                    </div>
                    <div className="space-y-2 text-xs">
                        {data.expiryCalendar.slice(0, 6).map((item) => (
                            <div key={`${item.contract}-${item.expiryDate}`} className="flex justify-between gap-3">
                                <span className="text-zinc-700 dark:text-zinc-200 font-semibold">{item.contract}</span>
                                <span className="text-zinc-500">{formatDate(item.expiryDate)}</span>
                            </div>
                        ))}
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
                        Delayed by {data.sourceStatus.delayedByMinutes} minutes
                    </div>
                </div>
            </div>
        </div>
    );
}

