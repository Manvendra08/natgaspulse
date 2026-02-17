'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { useTheme } from '@/components/providers/ThemeProvider';
import {
    createChart,
    ColorType,
    IChartApi,
    CandlestickSeries,
    LineSeries,
    UTCTimestamp
} from 'lightweight-charts';
import {
    TrendingUp,
    Maximize2,
    Activity,
    Layout as ChartIcon,
    AlertCircle,
    BarChart3
} from 'lucide-react';
import {
    calculateRSI,
    calculateBollingerBands
} from '@/lib/utils/technical';

interface PricePoint {
    period: string;
    value: number;
}

interface TechnicalChartWidgetProps {
    data: PricePoint[];
    isLoading?: boolean;
}

export default function TechnicalChartWidget({ data = [], isLoading = false }: TechnicalChartWidgetProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const { theme } = useTheme();
    const [days, setDays] = useState(90);
    const [showRSI, setShowRSI] = useState(false);
    const [showBB, setShowBB] = useState(false);

    const timeframes = [
        { label: '1M', value: 30 },
        { label: '3M', value: 90 },
        { label: '6M', value: 180 },
        { label: '1Y', value: 365 },
        { label: 'MAX', value: 1000 },
    ];

    // Data Processing
    const processedData = useMemo(() => {
        if (!data || data.length < 2) return null;

        const sorted = [...data].sort((a, b) => new Date(a.period).getTime() - new Date(b.period).getTime());
        const prices = sorted.map(d => d.value);
        const rsiValues = calculateRSI(prices, 14);
        const bbValues = calculateBollingerBands(prices, 20, 2);

        const result = [];
        const seenDates = new Set();

        for (let i = 0; i < sorted.length; i++) {
            const d = sorted[i];
            const dateStr = d.period.split('T')[0];
            if (seenDates.has(dateStr)) continue;
            seenDates.add(dateStr);

            const price = d.value;
            const prevPrice = i > 0 ? sorted[i - 1].value : price;

            // Prefer real OHLC if available, otherwise synthetic
            const open = (d as any).open ?? prevPrice;
            const close = (d as any).close ?? price;
            const high = (d as any).high ?? (Math.max(open, close) + (Math.abs(open - close) * 0.4 + (price * 0.003)));
            const low = (d as any).low ?? (Math.min(open, close) - (Math.abs(open - close) * 0.4 + (price * 0.003)));

            result.push({
                time: dateStr,
                ohlc: { time: dateStr, open, high, low, close },
                rsi: { time: dateStr, value: rsiValues[i] },
                bbUpper: { time: dateStr, value: bbValues[i]?.upper },
                bbLower: { time: dateStr, value: bbValues[i]?.lower }
            });
        }
        return result;
    }, [data]);

    useEffect(() => {
        if (!chartContainerRef.current || !processedData || processedData.length === 0) return;

        const isDark = theme === 'dark';

        // Initialize Chart
        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: isDark ? '#09090b' : '#ffffff' },
                textColor: isDark ? '#71717a' : '#3f3f46',
                fontSize: 11,
            },
            grid: {
                vertLines: { color: isDark ? '#18181b' : '#f4f4f5' },
                horzLines: { color: isDark ? '#18181b' : '#f4f4f5' },
            },
            handleScroll: {
                mouseWheel: false,
                pressedMouseMove: true,
                horzTouchDrag: true,
                vertTouchDrag: false
            },
            handleScale: {
                mouseWheel: false,
                pinch: false,
                axisPressedMouseMove: false
            },
            width: chartContainerRef.current.clientWidth,
            height: 500,
        });

        // Add Series using v5.x syntax
        const candleSeries = chart.addSeries(CandlestickSeries, {
            upColor: '#10b981',
            downColor: '#ef4444',
            borderVisible: false,
            wickUpColor: '#10b981',
            wickDownColor: '#ef4444',
        });

        const displayData = processedData.slice(-days);
        candleSeries.setData(displayData.map(d => d.ohlc));

        if (showRSI) {
            const rsiSeries = chart.addSeries(LineSeries, {
                color: '#8B5CF6',
                lineWidth: 2,
                priceScaleId: 'rsi',
            });
            chart.priceScale('rsi').applyOptions({
                scaleMargins: { top: 0.8, bottom: 0.05 },
            });
            rsiSeries.setData(displayData.map(d => d.rsi).filter(d => d.value !== null && d.value !== undefined));
        }

        if (showBB) {
            const upper = chart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 1, lineStyle: 2 });
            const lower = chart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 1, lineStyle: 2 });
            upper.setData(displayData.map(d => d.bbUpper).filter(d => d.value !== null && d.value !== undefined));
            lower.setData(displayData.map(d => d.bbLower).filter(d => d.value !== null && d.value !== undefined));
        }

        chart.timeScale().fitContent();

        const handleResize = () => {
            if (chartContainerRef.current) {
                chart.applyOptions({ width: chartContainerRef.current.clientWidth });
            }
        };

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
        };
    }, [processedData, days, showRSI, showBB, theme]);

    if (isLoading) {
        return (
            <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 h-[610px] animate-pulse">
                <div className="h-4 w-48 bg-zinc-100 dark:bg-zinc-800 rounded mb-8"></div>
                <div className="flex-1 bg-zinc-50 dark:bg-zinc-800/50 rounded h-[450px]"></div>
            </div>
        );
    }

    return (
        <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-xl dark:shadow-2xl flex flex-col h-full min-h-[610px]">
            {/* Header */}
            <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-zinc-50/40 dark:bg-zinc-900/40">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-500/10 rounded-lg border border-green-500/30">
                        <BarChart3 className="w-5 h-5 text-green-500" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 italic tracking-tight uppercase">Technical Terminal</h2>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-zinc-500 dark:text-zinc-500 uppercase font-black tracking-widest leading-none mt-1">EIA Henry Hub • Real-Time V5</span>
                            {processedData && processedData.length > 0 && (
                                <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 ml-1 mt-0.5">
                                    <div className={`w-1 h-1 rounded-full ${(new Date().getTime() - new Date(processedData[processedData.length - 1].time).getTime()) < 172800000
                                        ? 'bg-green-500 animate-pulse'
                                        : 'bg-amber-500'
                                        }`}></div>
                                    <span className={`text-[8px] font-black uppercase ${(new Date().getTime() - new Date(processedData[processedData.length - 1].time).getTime()) < 172800000
                                        ? 'text-green-500'
                                        : 'text-amber-500'
                                        }`}>
                                        {(new Date().getTime() - new Date(processedData[processedData.length - 1].time).getTime()) < 172800000 ? 'Synced' : 'Reporting Lag'}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex bg-zinc-100 dark:bg-black/40 p-1 rounded-md border border-zinc-200 dark:border-zinc-800 w-full sm:w-auto overflow-x-auto">
                    {timeframes.map((tf) => (
                        <button
                            key={tf.label}
                            onClick={() => setDays(tf.value)}
                            className={`flex-1 sm:flex-none px-3 py-1 text-[10px] font-black rounded transition-all uppercase tracking-tighter ${days === tf.value
                                ? 'bg-primary text-white shadow-sm'
                                : 'text-zinc-500 dark:text-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-400'
                                }`}
                        >
                            {tf.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Controls */}
            <div className="px-4 py-2 bg-zinc-50 dark:bg-zinc-950/20 border-b border-zinc-100 dark:border-zinc-800/50 flex gap-3 overflow-x-auto">
                <button
                    onClick={() => setShowRSI(!showRSI)}
                    className={`px-3 py-1 text-[9px] font-black uppercase rounded border transition-all whitespace-nowrap ${showRSI
                        ? 'bg-primary/10 text-primary border-primary/30'
                        : 'text-zinc-500 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-700'
                        }`}
                >
                    RSI (14)
                </button>
                <button
                    onClick={() => setShowBB(!showBB)}
                    className={`px-3 py-1 text-[9px] font-black uppercase rounded border transition-all whitespace-nowrap ${showBB
                        ? 'bg-primary/10 text-primary border-primary/30'
                        : 'text-zinc-500 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-700'
                        }`}
                >
                    Bollinger
                </button>
            </div>

            {/* Chart */}
            <div className="flex-1 bg-white dark:bg-[#09090b] relative min-h-[500px]">
                <div ref={chartContainerRef} className="absolute inset-0 w-full h-full" style={{ touchAction: 'pan-y' }} />
                {(!processedData || processedData.length === 0) && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-600 gap-3">
                        <Activity className="w-10 h-10 opacity-10 animate-pulse" />
                        <span className="text-[10px] uppercase tracking-[0.3em] font-black opacity-30">Connecting to EIA Socket...</span>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 bg-zinc-50/80 dark:bg-zinc-950/80 border-t border-zinc-100 dark:border-zinc-800/50 flex items-center justify-between">
                <div className="flex items-center gap-6 text-[9px] text-zinc-500 dark:text-zinc-600 uppercase font-black tracking-tighter">
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                        <span>High-Density Core</span>
                    </div>
                </div>
                <div className="hidden sm:block">
                    <span className="text-[9px] text-zinc-500 dark:text-zinc-400 font-black bg-white dark:bg-zinc-900 px-3 py-1 rounded border border-zinc-200 dark:border-zinc-800 uppercase tracking-widest">
                        SYST: STABLE
                    </span>
                </div>
            </div>
        </div>
    );
}

