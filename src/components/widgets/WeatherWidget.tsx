'use client';

import { CloudSun, ThermometerSun, Snowflake } from 'lucide-react';

interface WeatherRegion {
    region: string;
    todayHDD: number;
    todayCDD: number;
    total7DayHDD: number;
    total7DayCDD: number;
    error?: boolean;
}

interface WeatherWidgetProps {
    data: WeatherRegion[];
    isLoading?: boolean;
}

export default function WeatherWidget({ data, isLoading = false }: WeatherWidgetProps) {
    if (isLoading) {
        return (
            <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 rounded-xl p-6 shadow-2xl h-full">
                <div className="animate-pulse space-y-4">
                    <div className="h-6 bg-zinc-800 rounded w-1/3"></div>
                    <div className="space-y-2">
                        {[1, 2, 3, 4, 5].map(i => (
                            <div key={i} className="h-10 bg-zinc-800 rounded"></div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 md:p-6 shadow-xl dark:shadow-2xl hover:border-primary/30 transition-all duration-300">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-primary/10 rounded-lg border border-primary/30">
                        <CloudSun className="w-5 h-5 text-blue-500" />
                    </div>
                    <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">HDD/CDD Forecast</h2>
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 bg-zinc-50 dark:bg-zinc-900/50 px-2 py-1 rounded">7-Day Window</span>
            </div>

            <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-sm min-w-[300px]">
                    <thead>
                        <tr className="text-zinc-400 dark:text-zinc-500 border-b border-zinc-100 dark:border-zinc-800">
                            <th className="text-left py-2 font-black uppercase text-[10px] tracking-widest">Region</th>
                            <th className="text-right py-2 font-black uppercase text-[10px] tracking-widest">Today</th>
                            <th className="text-right py-2 font-black uppercase text-[10px] tracking-widest">Total 7D</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/50">
                        {data.map((region) => (
                            <tr key={region.region} className="group hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                                <td className="py-3 text-zinc-800 dark:text-zinc-300 font-bold">
                                    {region.region.split('(')[0]}
                                    <span className="text-zinc-400 dark:text-zinc-500 text-[10px] block font-black uppercase tracking-tight">
                                        {region.region.split('(')[1]?.replace(')', '')}
                                    </span>
                                </td>

                                <td className="py-3 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        {region.todayHDD > 0 && (
                                            <span className="flex items-center gap-1 text-primary bg-primary/5 dark:bg-primary/10 px-1.5 py-0.5 rounded text-[10px] font-black">
                                                <Snowflake className="w-3 h-3" /> {region.todayHDD}
                                            </span>
                                        )}
                                        {region.todayCDD > 0 && (
                                            <span className="flex items-center gap-1 text-orange-600 dark:text-orange-400 bg-orange-500/5 dark:bg-orange-500/10 px-1.5 py-0.5 rounded text-[10px] font-black">
                                                <ThermometerSun className="w-3 h-3" /> {region.todayCDD}
                                            </span>
                                        )}
                                        {region.todayHDD === 0 && region.todayCDD === 0 && (
                                            <span className="text-zinc-300 dark:text-zinc-700">-</span>
                                        )}
                                    </div>
                                </td>

                                <td className="py-3 text-right">
                                    <div className="flex items-center justify-end gap-2 font-black">
                                        {region.total7DayHDD > 0 && (
                                            <span className="text-primary">{region.total7DayHDD} <span className="text-[9px] text-zinc-400 uppercase">HDD</span></span>
                                        )}
                                        {region.total7DayCDD > 0 && (
                                            <span className="text-orange-600 dark:text-orange-400">{region.total7DayCDD} <span className="text-[9px] text-zinc-400 uppercase">CDD</span></span>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {data.some(r => r.error) && (
                <div className="mt-4 text-[10px] font-black text-red-500/80 uppercase text-center tracking-widest">
                    Some regions offline • Retrying link
                </div>
            )}
        </div>
    );
}

