'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
    createChart,
    ColorType,
    CandlestickSeries,
    LineSeries,
    HistogramSeries,
    UTCTimestamp
} from 'lightweight-charts';
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
    ComposedChart,
    Bar,
    ReferenceLine
} from 'recharts';
import {
    calculateBollingerBands,
    calculateFibonacciRetracement,
    calculateMACD,
    calculateRSI,
    calculateSMA,
    calculateStochastic
} from '@/lib/utils/technical';
import { useTheme } from '@/components/providers/ThemeProvider';
import type { McxPricePoint } from '@/lib/types/mcx';
import { PencilLine, Layers, CandlestickChart, BarChart3, LineChart as LineChartIcon } from 'lucide-react';

interface MCXAdvancedChartProps {
    data: McxPricePoint[];
}

type IntervalKey = 'daily' | 'weekly' | 'monthly';
type RangeKey = '3m' | '6m' | '1y' | 'max';
type ChartType = 'candlestick' | 'line' | 'bar';
type DrawMode = 'none' | 'support' | 'resistance' | 'trendline';

interface TrendlinePoint {
    time: number;
    price: number;
}

interface TrendlineShape {
    start: TrendlinePoint;
    end: TrendlinePoint;
}

function toUnix(date: string): UTCTimestamp {
    return Math.floor(new Date(date).getTime() / 1000) as UTCTimestamp;
}

function aggregateByInterval(rows: McxPricePoint[], interval: IntervalKey): McxPricePoint[] {
    if (interval === 'daily') return rows;

    const map = new Map<string, McxPricePoint[]>();
    for (const row of rows) {
        const d = new Date(row.date);
        let key = '';

        if (interval === 'weekly') {
            const copy = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
            const day = copy.getUTCDay();
            const diff = day === 0 ? -6 : 1 - day;
            copy.setUTCDate(copy.getUTCDate() + diff);
            key = copy.toISOString().slice(0, 10);
        } else {
            key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
        }

        const bucket = map.get(key) || [];
        bucket.push(row);
        map.set(key, bucket);
    }

    return Array.from(map.values()).map((bucket) => {
        const sorted = bucket.slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        return {
            date: first.date,
            open: first.open,
            high: Math.max(...sorted.map((x) => x.high)),
            low: Math.min(...sorted.map((x) => x.low)),
            close: last.close,
            settlement: last.settlement,
            volume: sorted.reduce((sum, x) => sum + x.volume, 0),
            openInterest: last.openInterest,
            oiChange: last.openInterest - first.openInterest
        };
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function getRangeCount(interval: IntervalKey, range: RangeKey) {
    const map = {
        daily: { '3m': 66, '6m': 132, '1y': 252, max: Number.POSITIVE_INFINITY },
        weekly: { '3m': 13, '6m': 26, '1y': 52, max: Number.POSITIVE_INFINITY },
        monthly: { '3m': 3, '6m': 6, '1y': 12, max: Number.POSITIVE_INFINITY }
    };
    return map[interval][range];
}

function timeToLabel(unix: number) {
    return new Date(unix * 1000).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
    });
}

export default function MCXAdvancedChart({ data }: MCXAdvancedChartProps) {
    const chartRef = useRef<HTMLDivElement>(null);
    const pendingTrendlineRef = useRef<TrendlinePoint | null>(null);
    const { theme } = useTheme();

    const [interval, setInterval] = useState<IntervalKey>('daily');
    const [range, setRange] = useState<RangeKey>('1y');
    const [chartType, setChartType] = useState<ChartType>('candlestick');
    const [showVolume, setShowVolume] = useState(true);
    const [showMA20, setShowMA20] = useState(true);
    const [showMA50, setShowMA50] = useState(false);
    const [showBB, setShowBB] = useState(false);
    const [showFib, setShowFib] = useState(false);
    const [showRSI, setShowRSI] = useState(true);
    const [showMACD, setShowMACD] = useState(true);
    const [showStoch, setShowStoch] = useState(false);
    const [drawMode, setDrawMode] = useState<DrawMode>('none');
    const [supportLevels, setSupportLevels] = useState<number[]>([]);
    const [resistanceLevels, setResistanceLevels] = useState<number[]>([]);
    const [trendlines, setTrendlines] = useState<TrendlineShape[]>([]);

    const visibleData = useMemo(() => {
        const aggregated = aggregateByInterval(data, interval);
        const count = getRangeCount(interval, range);
        return Number.isFinite(count) ? aggregated.slice(-count) : aggregated;
    }, [data, interval, range]);

    const indicatorData = useMemo(() => {
        const closes = visibleData.map((x) => x.close);
        const highs = visibleData.map((x) => x.high);
        const lows = visibleData.map((x) => x.low);

        const ma20 = calculateSMA(closes, 20);
        const ma50 = calculateSMA(closes, 50);
        const bb = calculateBollingerBands(closes, 20, 2);
        const rsi = calculateRSI(closes, 14);
        const macd = calculateMACD(closes, 12, 26, 9);
        const stoch = calculateStochastic(highs, lows, closes, 14, 3);
        const hi = Math.max(...highs);
        const lo = Math.min(...lows);
        const fib = calculateFibonacciRetracement(hi, lo);

        const rows = visibleData.map((row, i) => ({
            date: row.date,
            label: new Date(row.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            unix: toUnix(row.date),
            open: row.open,
            high: row.high,
            low: row.low,
            close: row.close,
            volume: row.volume,
            ma20: ma20[i] ?? null,
            ma50: ma50[i] ?? null,
            bbUpper: bb[i]?.upper ?? null,
            bbLower: bb[i]?.lower ?? null,
            rsi: rsi[i] ?? null,
            macd: macd.macd[i] ?? null,
            macdSignal: macd.signal[i] ?? null,
            macdHist: macd.histogram[i] ?? null,
            stochK: stoch.k[i] ?? null,
            stochD: stoch.d[i] ?? null
        }));

        return { rows, fib };
    }, [visibleData]);

    useEffect(() => {
        if (!chartRef.current || indicatorData.rows.length < 2) return;

        const isDark = theme === 'dark';
        const chart = createChart(chartRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: isDark ? '#09090b' : '#ffffff' },
                textColor: isDark ? '#a1a1aa' : '#52525b',
                fontSize: 11
            },
            grid: {
                vertLines: { color: isDark ? '#18181b' : '#f4f4f5' },
                horzLines: { color: isDark ? '#18181b' : '#f4f4f5' }
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
            width: chartRef.current.clientWidth,
            height: 500
        });

        const mainData = indicatorData.rows.map((row) => ({
            time: row.unix,
            open: row.open,
            high: row.high,
            low: row.low,
            close: row.close,
            value: row.close
        }));

        let mainSeries: any;
        if (chartType === 'candlestick') {
            mainSeries = chart.addSeries(CandlestickSeries, {
                upColor: '#10b981',
                downColor: '#ef4444',
                wickUpColor: '#10b981',
                wickDownColor: '#ef4444',
                borderVisible: false
            });
            mainSeries.setData(mainData.map((d) => ({
                time: d.time,
                open: d.open,
                high: d.high,
                low: d.low,
                close: d.close
            })));
        } else if (chartType === 'line') {
            mainSeries = chart.addSeries(LineSeries, {
                color: '#06b6d4',
                lineWidth: 2
            });
            mainSeries.setData(mainData.map((d) => ({ time: d.time, value: d.value })));
        } else {
            mainSeries = chart.addSeries(HistogramSeries, {
                color: '#0ea5e9',
                priceLineVisible: false,
                priceFormat: { type: 'price', precision: 2, minMove: 0.01 }
            });
            mainSeries.setData(mainData.map((d) => ({ time: d.time, value: d.value })));
        }

        if (showMA20) {
            const ma20Series = chart.addSeries(LineSeries, { color: '#8B5CF6', lineWidth: 2 });
            ma20Series.setData(indicatorData.rows
                .filter((x) => x.ma20 !== null)
                .map((x) => ({ time: x.unix, value: x.ma20 as number })));
        }

        if (showMA50) {
            const ma50Series = chart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 2 });
            ma50Series.setData(indicatorData.rows
                .filter((x) => x.ma50 !== null)
                .map((x) => ({ time: x.unix, value: x.ma50 as number })));
        }

        if (showBB) {
            const upperSeries = chart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 1, lineStyle: 2 });
            const lowerSeries = chart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 1, lineStyle: 2 });
            upperSeries.setData(indicatorData.rows
                .filter((x) => x.bbUpper !== null)
                .map((x) => ({ time: x.unix, value: x.bbUpper as number })));
            lowerSeries.setData(indicatorData.rows
                .filter((x) => x.bbLower !== null)
                .map((x) => ({ time: x.unix, value: x.bbLower as number })));
        }

        if (showVolume) {
            const volumeSeries = chart.addSeries(HistogramSeries, {
                priceScaleId: 'volume',
                priceFormat: { type: 'volume' }
            });
            chart.priceScale('volume').applyOptions({
                scaleMargins: {
                    top: 0.75,
                    bottom: 0
                }
            });
            volumeSeries.setData(indicatorData.rows.map((row) => ({
                time: row.unix,
                value: row.volume,
                color: row.close >= row.open ? 'rgba(16,185,129,0.5)' : 'rgba(239,68,68,0.5)'
            })));
        }

        if (showFib) {
            indicatorData.fib.forEach((level) => {
                mainSeries.createPriceLine({
                    price: level.value,
                    color: '#64748b',
                    lineStyle: 2,
                    lineWidth: 1,
                    axisLabelVisible: true,
                    title: `Fib ${level.label}`
                });
            });
        }

        supportLevels.forEach((level) => {
            mainSeries.createPriceLine({
                price: level,
                color: '#22c55e',
                lineWidth: 1,
                lineStyle: 2,
                axisLabelVisible: true,
                title: 'Support'
            });
        });

        resistanceLevels.forEach((level) => {
            mainSeries.createPriceLine({
                price: level,
                color: '#ef4444',
                lineWidth: 1,
                lineStyle: 2,
                axisLabelVisible: true,
                title: 'Resistance'
            });
        });

        trendlines.forEach((line) => {
            const trendSeries = chart.addSeries(LineSeries, {
                color: '#f97316',
                lineWidth: 2
            });
            trendSeries.setData([
                { time: line.start.time as UTCTimestamp, value: line.start.price },
                { time: line.end.time as UTCTimestamp, value: line.end.price }
            ]);
        });

        const clickHandler = (param: any) => {
            if (drawMode === 'none') return;
            if (!param?.point || param.time === undefined) return;

            const clickedPrice = mainSeries.coordinateToPrice(param.point.y);
            if (clickedPrice == null) return;

            const clickedTime = typeof param.time === 'number' ? param.time : null;
            if (clickedTime == null) return;

            if (drawMode === 'support') {
                setSupportLevels((prev) => [...prev, Number(clickedPrice.toFixed(2))]);
                return;
            }

            if (drawMode === 'resistance') {
                setResistanceLevels((prev) => [...prev, Number(clickedPrice.toFixed(2))]);
                return;
            }

            if (drawMode === 'trendline') {
                if (!pendingTrendlineRef.current) {
                    pendingTrendlineRef.current = {
                        time: clickedTime,
                        price: Number(clickedPrice.toFixed(2))
                    };
                } else {
                    setTrendlines((prev) => [
                        ...prev,
                        {
                            start: pendingTrendlineRef.current as TrendlinePoint,
                            end: { time: clickedTime, price: Number(clickedPrice.toFixed(2)) }
                        }
                    ]);
                    pendingTrendlineRef.current = null;
                }
            }
        };

        chart.subscribeClick(clickHandler);
        chart.timeScale().fitContent();

        const onResize = () => {
            if (chartRef.current) chart.applyOptions({ width: chartRef.current.clientWidth });
        };
        window.addEventListener('resize', onResize);

        return () => {
            window.removeEventListener('resize', onResize);
            chart.unsubscribeClick(clickHandler);
            chart.remove();
        };
    }, [
        chartType,
        drawMode,
        indicatorData,
        resistanceLevels,
        showBB,
        showFib,
        showMA20,
        showMA50,
        showVolume,
        supportLevels,
        theme,
        trendlines
    ]);

    if (indicatorData.rows.length < 2) {
        return (
            <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">No chart data available.</p>
            </div>
        );
    }

    return (
        <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl dark:shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 flex flex-col gap-3">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-100 tracking-tight">MCX Technical Analysis</h2>
                        <p className="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-bold">
                            Candlestick, indicators, manual trendline and support/resistance tools
                        </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            onClick={() => setChartType('candlestick')}
                            className={`px-2.5 py-1.5 rounded text-xs font-bold border flex items-center gap-1 ${chartType === 'candlestick'
                                ? 'border-primary/40 text-primary bg-primary/10'
                                : 'border-zinc-200 dark:border-zinc-800 text-zinc-500'
                                }`}
                        >
                            <CandlestickChart className="w-3.5 h-3.5" /> Candle
                        </button>
                        <button
                            onClick={() => setChartType('line')}
                            className={`px-2.5 py-1.5 rounded text-xs font-bold border flex items-center gap-1 ${chartType === 'line'
                                ? 'border-primary/40 text-primary bg-primary/10'
                                : 'border-zinc-200 dark:border-zinc-800 text-zinc-500'
                                }`}
                        >
                            <LineChartIcon className="w-3.5 h-3.5" /> Line
                        </button>
                        <button
                            onClick={() => setChartType('bar')}
                            className={`px-2.5 py-1.5 rounded text-xs font-bold border flex items-center gap-1 ${chartType === 'bar'
                                ? 'border-primary/40 text-primary bg-primary/10'
                                : 'border-zinc-200 dark:border-zinc-800 text-zinc-500'
                                }`}
                        >
                            <BarChart3 className="w-3.5 h-3.5" /> Bar
                        </button>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    {(['daily', 'weekly', 'monthly'] as IntervalKey[]).map((key) => (
                        <button
                            key={key}
                            onClick={() => setInterval(key)}
                            className={`px-3 py-1 rounded text-xs font-bold border uppercase ${interval === key
                                ? 'border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100'
                                : 'border-zinc-200 dark:border-zinc-800 text-zinc-500'
                                }`}
                        >
                            {key}
                        </button>
                    ))}
                    {(['3m', '6m', '1y', 'max'] as RangeKey[]).map((key) => (
                        <button
                            key={key}
                            onClick={() => setRange(key)}
                            className={`px-3 py-1 rounded text-xs font-bold border uppercase ${range === key
                                ? 'border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100'
                                : 'border-zinc-200 dark:border-zinc-800 text-zinc-500'
                                }`}
                        >
                            {key}
                        </button>
                    ))}
                </div>

                <div className="flex flex-wrap gap-2">
                    <button onClick={() => setShowVolume((v) => !v)} className={`px-3 py-1 rounded text-xs font-bold border ${showVolume ? 'border-primary/40 text-primary' : 'border-zinc-200 dark:border-zinc-800 text-zinc-500'}`}>Volume</button>
                    <button onClick={() => setShowMA20((v) => !v)} className={`px-3 py-1 rounded text-xs font-bold border ${showMA20 ? 'border-primary/40 text-primary' : 'border-zinc-200 dark:border-zinc-800 text-zinc-500'}`}>MA20</button>
                    <button onClick={() => setShowMA50((v) => !v)} className={`px-3 py-1 rounded text-xs font-bold border ${showMA50 ? 'border-amber-500/40 text-amber-600 dark:text-amber-400' : 'border-zinc-200 dark:border-zinc-800 text-zinc-500'}`}>MA50</button>
                    <button onClick={() => setShowBB((v) => !v)} className={`px-3 py-1 rounded text-xs font-bold border ${showBB ? 'border-primary/40 text-primary' : 'border-zinc-200 dark:border-zinc-800 text-zinc-500'}`}>Bollinger</button>
                    <button onClick={() => setShowFib((v) => !v)} className={`px-3 py-1 rounded text-xs font-bold border ${showFib ? 'border-slate-500/40 text-slate-600 dark:text-slate-400' : 'border-zinc-200 dark:border-zinc-800 text-zinc-500'}`}>Fibonacci</button>
                </div>
            </div>

            <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/30 dark:bg-zinc-900/20">
                <div className="flex flex-wrap gap-2 items-center">
                    <span className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold flex items-center gap-1">
                        <PencilLine className="w-3 h-3" />
                        Manual Drawing
                    </span>
                    <button onClick={() => setDrawMode('support')} className={`px-2.5 py-1 rounded text-xs font-bold border ${drawMode === 'support' ? 'border-green-500/40 text-green-600 dark:text-green-400' : 'border-zinc-200 dark:border-zinc-800 text-zinc-500'}`}>Support</button>
                    <button onClick={() => setDrawMode('resistance')} className={`px-2.5 py-1 rounded text-xs font-bold border ${drawMode === 'resistance' ? 'border-red-500/40 text-red-600 dark:text-red-400' : 'border-zinc-200 dark:border-zinc-800 text-zinc-500'}`}>Resistance</button>
                    <button onClick={() => setDrawMode('trendline')} className={`px-2.5 py-1 rounded text-xs font-bold border ${drawMode === 'trendline' ? 'border-orange-500/40 text-orange-600 dark:text-orange-400' : 'border-zinc-200 dark:border-zinc-800 text-zinc-500'}`}>Trendline (2 clicks)</button>
                    <button onClick={() => { setDrawMode('none'); pendingTrendlineRef.current = null; }} className="px-2.5 py-1 rounded text-xs font-bold border border-zinc-200 dark:border-zinc-800 text-zinc-500">Stop Drawing</button>
                    <button onClick={() => { setSupportLevels([]); setResistanceLevels([]); setTrendlines([]); pendingTrendlineRef.current = null; }} className="px-2.5 py-1 rounded text-xs font-bold border border-zinc-200 dark:border-zinc-800 text-zinc-500">Clear Drawings</button>
                    <span className="text-[11px] text-zinc-500 flex items-center gap-1"><Layers className="w-3 h-3" />S:{supportLevels.length} R:{resistanceLevels.length} T:{trendlines.length}</span>
                </div>
            </div>

            <div className="h-[500px] w-full" ref={chartRef} style={{ touchAction: 'pan-y' }} />

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 p-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/30 dark:bg-zinc-900/10">
                {showMACD && (
                    <div className="h-[220px] border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-950 p-2">
                        <div className="text-[11px] font-black uppercase tracking-wider text-zinc-500 mb-1 px-1">MACD</div>
                        <ResponsiveContainer width="100%" height="90%">
                            <ComposedChart data={indicatorData.rows}>
                                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                                <YAxis tick={{ fontSize: 10 }} width={36} />
                                <Tooltip labelFormatter={(value) => String(value)} />
                                <Bar dataKey="macdHist" fill="#94a3b8" />
                                <Line type="monotone" dataKey="macd" stroke="#0ea5e9" dot={false} strokeWidth={1.8} />
                                <Line type="monotone" dataKey="macdSignal" stroke="#f97316" dot={false} strokeWidth={1.5} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                )}

                {showRSI && (
                    <div className="h-[220px] border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-950 p-2">
                        <div className="text-[11px] font-black uppercase tracking-wider text-zinc-500 mb-1 px-1">RSI (14)</div>
                        <ResponsiveContainer width="100%" height="90%">
                            <LineChart data={indicatorData.rows}>
                                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} width={30} />
                                <Tooltip />
                                <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="4 4" />
                                <ReferenceLine y={30} stroke="#22c55e" strokeDasharray="4 4" />
                                <Line type="monotone" dataKey="rsi" stroke="#8B5CF6" dot={false} strokeWidth={2} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )}

                {showStoch && (
                    <div className="h-[220px] border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-950 p-2">
                        <div className="text-[11px] font-black uppercase tracking-wider text-zinc-500 mb-1 px-1">Stochastic</div>
                        <ResponsiveContainer width="100%" height="90%">
                            <LineChart data={indicatorData.rows}>
                                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} width={30} />
                                <Tooltip />
                                <ReferenceLine y={80} stroke="#ef4444" strokeDasharray="4 4" />
                                <ReferenceLine y={20} stroke="#22c55e" strokeDasharray="4 4" />
                                <Line type="monotone" dataKey="stochK" stroke="#2563eb" dot={false} strokeWidth={2} />
                                <Line type="monotone" dataKey="stochD" stroke="#f59e0b" dot={false} strokeWidth={1.5} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>

            <div className="px-4 pb-4">
                <button onClick={() => setShowMACD((v) => !v)} className={`mt-1 mr-2 px-3 py-1 rounded text-xs font-bold border ${showMACD ? 'border-primary/40 text-primary' : 'border-zinc-200 dark:border-zinc-800 text-zinc-500'}`}>MACD</button>
                <button onClick={() => setShowRSI((v) => !v)} className={`mt-1 mr-2 px-3 py-1 rounded text-xs font-bold border ${showRSI ? 'border-primary/40 text-primary' : 'border-zinc-200 dark:border-zinc-800 text-zinc-500'}`}>RSI</button>
                <button onClick={() => setShowStoch((v) => !v)} className={`mt-1 px-3 py-1 rounded text-xs font-bold border ${showStoch ? 'border-primary/40 text-primary' : 'border-zinc-200 dark:border-zinc-800 text-zinc-500'}`}>Stochastic</button>
                <span className="ml-2 text-[11px] text-zinc-500">Latest: {timeToLabel(indicatorData.rows[indicatorData.rows.length - 1].unix)}</span>
            </div>
        </div>
    );
}


