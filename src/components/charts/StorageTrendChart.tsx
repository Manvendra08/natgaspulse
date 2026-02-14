'use client';
import { useMemo, useState } from 'react';
import { useTheme } from '@/components/providers/ThemeProvider';
import {
    ComposedChart,
    Line,
    Area,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend
} from 'recharts';
import { Activity } from 'lucide-react';

interface StorageDataPoint {
    period: string;
    value: number;
}

interface PriceDataPoint {
    period: string;
    value: number;
}

interface StorageTrendChartProps {
    data: StorageDataPoint[];
    priceData?: PriceDataPoint[];
    isLoading?: boolean;
}

export default function StorageTrendChart({ data, priceData = [], isLoading = false }: StorageTrendChartProps) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const [selectedYear, setSelectedYear] = useState<string>('All');
    const [selectedMonth, setSelectedMonth] = useState<string>('All');

    const years = useMemo(() => {
        const currentYear = new Date().getFullYear();
        const last5 = Array.from({ length: 5 }, (_, i) => (currentYear - i).toString());
        return ['All', ...last5];
    }, []);

    const months = [
        'All', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];

    const chartData = useMemo(() => {
        if (!data || data.length === 0) return [];

        // Initial sorting
        const sortedStorage = [...data].sort((a, b) => new Date(a.period).getTime() - new Date(b.period).getTime());
        const sortedPrices = [...(priceData || [])].sort((a, b) => new Date(a.period).getTime() - new Date(b.period).getTime());

        // Process all data first to get correctly calculated changes
        const processed = sortedStorage.map((point, index) => {
            const date = new Date(point.period);
            const prevPoint = index > 0 ? sortedStorage[index - 1] : null;
            const change = prevPoint ? point.value - prevPoint.value : 0;

            let price = null;
            if (sortedPrices.length > 0) {
                for (let i = sortedPrices.length - 1; i >= 0; i--) {
                    if (new Date(sortedPrices[i].period) <= date) {
                        price = sortedPrices[i].value;
                        break;
                    }
                }
            }

            return {
                dateObj: date,
                year: date.getFullYear().toString(),
                month: date.toLocaleDateString('en-US', { month: 'short' }),
                dateStr: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                fullDate: point.period,
                storage: point.value,
                change: change,
                price: price
            };
        });

        // Filter based on selection
        return processed.filter(item => {
            const yearMatch = selectedYear === 'All' || item.year === selectedYear;
            const monthMatch = selectedMonth === 'All' || item.month === selectedMonth;
            return yearMatch && monthMatch;
        }).map(item => ({
            date: `${item.dateStr} ${item.year}`,
            fullDate: item.fullDate,
            storage: item.storage,
            change: item.change,
            price: item.price
        }));
    }, [data, priceData, selectedYear, selectedMonth]);

    if (isLoading) {
        return (
            <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 h-[400px] animate-pulse">
                <div className="h-6 bg-zinc-100 dark:bg-zinc-800 rounded w-1/3 mb-6"></div>
                <div className="flex-1 bg-zinc-50 dark:bg-zinc-800 rounded"></div>
            </div>
        );
    }

    return (
        <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 md:p-6 shadow-xl dark:shadow-2xl hover:border-emerald-500/20 transition-all duration-300">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
                <div>
                    <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-tight italic">
                        Seasonal Storage Trend
                        <span className="text-[10px] text-zinc-500 not-italic uppercase font-black ml-2 tracking-widest ">Historical Analysis</span>
                    </h2>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {/* Year Filter */}
                    <div className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-900 p-1 rounded-lg border border-zinc-200 dark:border-zinc-800">
                        <span className="text-[9px] font-black uppercase text-zinc-400 px-2">Year</span>
                        <div className="flex gap-1">
                            {years.map(year => (
                                <button
                                    key={year}
                                    onClick={() => setSelectedYear(year)}
                                    className={`px-2 py-1 text-[10px] font-bold rounded uppercase transition-all ${selectedYear === year
                                        ? 'bg-white dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 shadow-sm border border-zinc-200 dark:border-zinc-700'
                                        : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
                                        }`}
                                >
                                    {year}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Month Filter */}
                    <div className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-900 p-1 rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-x-auto max-w-[280px] sm:max-w-none">
                        <span className="text-[9px] font-black uppercase text-zinc-400 px-2">Month</span>
                        <select
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            className="bg-transparent border-none text-[10px] font-bold text-zinc-900 dark:text-zinc-100 focus:ring-0 cursor-pointer uppercase py-1"
                        >
                            {months.map(month => (
                                <option key={month} value={month} className="bg-white dark:bg-zinc-900">
                                    {month}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            <div className="w-full h-[400px] md:h-[500px]">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="storageGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#27272a" : "#f4f4f5"} vertical={false} />
                        <XAxis
                            dataKey="date"
                            stroke={isDark ? "#71717a" : "#a1a1aa"}
                            tick={{ fill: isDark ? '#71717a' : '#a1a1aa', fontSize: 10, fontWeight: 700 }}
                            minTickGap={20}
                            axisLine={false}
                            tickLine={false}
                        />
                        <YAxis
                            yAxisId="left"
                            stroke="#10b981"
                            tick={{ fill: '#10b981', fontSize: 10, fontWeight: 700 }}
                            tickFormatter={(val) => `${(val / 1000).toFixed(1)}k`}
                            domain={['auto', 'auto']}
                            axisLine={false}
                            tickLine={false}
                        />
                        <YAxis
                            yAxisId="right"
                            orientation="right"
                            stroke="#f59e0b"
                            tick={{ fill: '#f59e0b', fontSize: 10, fontWeight: 700 }}
                            tickFormatter={(val) => `$${val}`}
                            domain={['auto', 'auto']}
                            axisLine={false}
                            tickLine={false}
                        />
                        <YAxis yAxisId="change" hide domain={[-500, 500]} />

                        <Tooltip
                            contentStyle={{
                                backgroundColor: isDark ? '#09090b' : '#ffffff',
                                border: `1px solid ${isDark ? '#27272a' : '#e4e4e7'}`,
                                borderRadius: '12px',
                                color: isDark ? '#e4e4e7' : '#18181b',
                                boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'
                            }}
                            labelStyle={{ color: '#71717a', fontWeight: 800, marginBottom: '4px', textTransform: 'uppercase', fontSize: '10px' }}
                            formatter={(value: any, name: any) => {
                                if (name === 'Storage (BCF)') return [`${value.toLocaleString()} BCF`, name];
                                if (name === 'EOD Price ($)') return [`$${value.toFixed(2)}`, name];
                                if (name === 'Wk Change (BCF)') return [`${value > 0 ? '+' : ''}${value} BCF`, name];
                                return [value, name];
                            }}
                        />
                        <Legend
                            verticalAlign="top"
                            align="right"
                            wrapperStyle={{ paddingTop: '0px', paddingBottom: '20px', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }}
                        />

                        <Area
                            yAxisId="left"
                            type="monotone"
                            dataKey="storage"
                            name="Storage (BCF)"
                            stroke="#10b981"
                            fill="url(#storageGradient)"
                            strokeWidth={3}
                        />

                        <Bar
                            yAxisId="change"
                            dataKey="change"
                            name="Wk Change (BCF)"
                            fill="#3b82f6"
                            opacity={0.4}
                            barSize={8}
                            radius={[2, 2, 0, 0]}
                        />

                        <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="price"
                            name="EOD Price ($)"
                            stroke="#f59e0b"
                            strokeWidth={3}
                            dot={{ r: 4, fill: '#f59e0b', strokeWidth: 0 }}
                            activeDot={{ r: 6, stroke: isDark ? '#09090b' : '#fff', strokeWidth: 2 }}
                            connectNulls
                        />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>

            <div className="mt-4 flex items-center justify-between text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">
                <span className="flex items-center gap-1.5"><Activity className="w-3 h-3" /> Source: EIA-912 Intelligence</span>
                <span>Values: Physical Inv vs Parity Price</span>
            </div>
        </div>
    );
}
