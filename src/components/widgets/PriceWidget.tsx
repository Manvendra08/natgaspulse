'use client';
import { useState, useEffect } from 'react';
import { ArrowUp, ArrowDown, DollarSign, Clock } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';

interface PriceData {
    current: number;
    change: number;
    changePercent: string;
    date: string;
    historicalPrices?: { period: string; value: number }[];
}

interface PriceWidgetProps {
    // Optional props for backward compatibility or initial state
    current?: number;
    change?: number;
    changePercent?: string;
    date?: string;
    isLoading?: boolean;
}

export default function PriceWidget(props: PriceWidgetProps) {
    const [data, setData] = useState<PriceData | null>(null);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    const fetchData = async () => {
        try {
            const res = await fetch('/api/eia/prices');
            const json = await res.json();
            if (!json.error) {
                setData(json);
                setLastUpdated(new Date());
            }
        } catch (err) {
            console.error('Price widget fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 60000); // 60s auto-refresh
        return () => clearInterval(interval);
    }, []);

    // Use fetched data or props (if fetched is null/loading initially)
    // Actually, just prioritize fetched data.
    const displayData = data || {
        current: props.current || 0,
        change: props.change || 0,
        changePercent: props.changePercent || '0',
        date: props.date || new Date().toISOString(),
        historicalPrices: []
    };

    const isPositive = displayData.change >= 0;
    const chartData = (displayData.historicalPrices || []).slice(0, 30).reverse(); // Last 30 points for sparkline

    if (loading && !data && props.isLoading) {
        return (
            <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 rounded-xl p-6 shadow-2xl h-full animate-pulse">
                <div className="h-6 bg-zinc-800 rounded w-2/3 mb-4"></div>
                <div className="h-16 bg-zinc-800 rounded mb-4"></div>
                <div className="h-20 bg-zinc-800 rounded"></div>
            </div>
        );
    }

    return (
        <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 rounded-xl p-6 shadow-2xl hover:border-zinc-700 transition-all duration-300 h-full flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-amber-500/10 rounded-lg border border-amber-500/30">
                        <DollarSign className="w-5 h-5 text-amber-400" />
                    </div>
                    <h2 className="text-xl font-bold text-zinc-100">Henry Hub Spot Price</h2>
                </div>
                {lastUpdated && (
                    <div className="flex items-center gap-1 text-xs text-zinc-500">
                        <Clock className="w-3 h-3" />
                        <span>{lastUpdated.toLocaleTimeString()}</span>
                    </div>
                )}
            </div>

            <div className="flex items-end justify-between mb-6">
                <div>
                    <div className="text-4xl font-bold bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent mb-1">
                        ${displayData.current.toFixed(3)}
                    </div>
                    <div className="text-xs text-zinc-500 uppercase tracking-wider">USD / MMBtu</div>
                </div>

                <div className={`text-right ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                    <div className="flex items-center justify-end gap-1 font-bold text-lg">
                        {isPositive ? <ArrowUp className="w-5 h-5" /> : <ArrowDown className="w-5 h-5" />}
                        {Math.abs(displayData.change).toFixed(3)}
                    </div>
                    <div className="text-sm font-medium bg-zinc-900/50 px-2 py-0.5 rounded inline-block border border-zinc-800">
                        {displayData.changePercent}%
                    </div>
                </div>
            </div>

            {/* Sparkline */}
            <div className="h-[60px] w-full mt-auto">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                        <Line
                            type="monotone"
                            dataKey="value"
                            stroke={isPositive ? '#10b981' : '#ef4444'}
                            strokeWidth={2}
                            dot={false}
                        />
                        <YAxis domain={['auto', 'auto']} hide />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

