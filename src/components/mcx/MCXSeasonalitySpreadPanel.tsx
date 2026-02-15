'use client';

import { useMemo } from 'react';
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
    ComposedChart,
    Bar
} from 'recharts';
import type { McxPricePoint } from '@/lib/types/mcx';

interface MCXSeasonalitySpreadPanelProps {
    historical: McxPricePoint[];
    eiaHenryHub: Array<{ date: string; value: number }>;
    usdinr: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function MCXSeasonalitySpreadPanel({ historical, eiaHenryHub, usdinr }: MCXSeasonalitySpreadPanelProps) {
    const seasonalData = useMemo(() => {
        const nowYear = new Date().getUTCFullYear();
        const allMonthSums = new Array(12).fill(0);
        const allMonthCounts = new Array(12).fill(0);
        const currentYearSums = new Array(12).fill(0);
        const currentYearCounts = new Array(12).fill(0);

        historical.forEach((row) => {
            const d = new Date(row.date);
            const m = d.getUTCMonth();
            allMonthSums[m] += row.close;
            allMonthCounts[m] += 1;

            if (d.getUTCFullYear() === nowYear) {
                currentYearSums[m] += row.close;
                currentYearCounts[m] += 1;
            }
        });

        return MONTHS.map((month, i) => ({
            month,
            seasonalAvg: allMonthCounts[i] > 0 ? Number((allMonthSums[i] / allMonthCounts[i]).toFixed(2)) : null,
            currentYear: currentYearCounts[i] > 0 ? Number((currentYearSums[i] / currentYearCounts[i]).toFixed(2)) : null
        }));
    }, [historical]);

    const spreadData = useMemo(() => {
        const sortedMcx = historical.slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const sortedEia = eiaHenryHub.slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        if (sortedMcx.length === 0 || sortedEia.length === 0) return [];

        const result: Array<{ label: string; spread: number; ratio: number; settlement: number; parity: number }> = [];
        let eiaIndex = 0;

        for (const row of sortedMcx) {
            const rowTime = new Date(row.date).getTime();
            while (eiaIndex + 1 < sortedEia.length && new Date(sortedEia[eiaIndex + 1].date).getTime() <= rowTime) {
                eiaIndex += 1;
            }

            const eia = sortedEia[eiaIndex];
            if (!eia) continue;

            const parity = eia.value * usdinr;
            if (parity <= 0) continue;

            const spread = row.settlement - parity;
            const ratio = row.settlement / parity;

            result.push({
                label: new Date(row.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                spread: Number(spread.toFixed(2)),
                ratio: Number(ratio.toFixed(3)),
                settlement: row.settlement,
                parity: Number(parity.toFixed(2))
            });
        }

        return result.slice(-120);
    }, [historical, eiaHenryHub, usdinr]);

    const latestSpread = spreadData[spreadData.length - 1];

    return (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl dark:shadow-2xl overflow-hidden">
                <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40">
                    <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-100 tracking-tight">Seasonal Pattern Overlay</h3>
                    <p className="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-bold">
                        Historical monthly seasonal average vs current year
                    </p>
                </div>
                <div className="p-4 h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={seasonalData}>
                            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} width={42} />
                            <Tooltip />
                            <Line type="monotone" dataKey="seasonalAvg" stroke="#06b6d4" strokeWidth={2.2} dot={false} name="Seasonal Avg" />
                            <Line type="monotone" dataKey="currentYear" stroke="#f59e0b" strokeWidth={2} dot={false} name="Current Year" />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl dark:shadow-2xl overflow-hidden">
                <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40">
                    <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-100 tracking-tight">EIA Spread and Ratio</h3>
                    <p className="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-bold">
                        MCX settlement minus EIA Henry Hub parity, plus settlement/parity ratio
                    </p>
                </div>
                <div className="px-4 pt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50/50 dark:bg-zinc-900/30">
                        <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Latest Spread</div>
                        <div className={`text-xl font-black ${latestSpread && latestSpread.spread >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {latestSpread ? `INR ${latestSpread.spread.toFixed(2)}` : '-'}
                        </div>
                    </div>
                    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50/50 dark:bg-zinc-900/30">
                        <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Latest Ratio</div>
                        <div className="text-xl font-black text-zinc-900 dark:text-zinc-100">
                            {latestSpread ? latestSpread.ratio.toFixed(3) : '-'}
                        </div>
                    </div>
                    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50/50 dark:bg-zinc-900/30">
                        <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Latest Parity</div>
                        <div className="text-xl font-black text-zinc-900 dark:text-zinc-100">
                            {latestSpread ? `INR ${latestSpread.parity.toFixed(2)}` : '-'}
                        </div>
                    </div>
                </div>
                <div className="p-4 h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={spreadData}>
                            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                            <YAxis yAxisId="left" tick={{ fontSize: 10 }} width={44} />
                            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} width={36} />
                            <Tooltip />
                            <Bar yAxisId="left" dataKey="spread" fill="#94a3b8" name="Spread (INR)" />
                            <Line yAxisId="right" type="monotone" dataKey="ratio" stroke="#8b5cf6" dot={false} strokeWidth={2} name="Ratio" />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}


