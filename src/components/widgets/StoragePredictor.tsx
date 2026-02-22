'use client';

import { useEffect, useMemo } from 'react';
import {
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from 'recharts';
import { AlertTriangle, Snowflake, ThermometerSun, TrendingDown, Target } from 'lucide-react';

interface WeatherForecastPoint {
    day: string;
    date: string;
    hdd: number;
    cdd: number;
    temp: number;
}

interface WeatherRegionData {
    region: string;
    todayHDD: number;
    todayCDD: number;
    total7DayHDD: number;
    total7DayCDD: number;
    error?: boolean;
    forecast?: WeatherForecastPoint[];
}

interface HistoricalStoragePoint {
    period: string;
    value: number;
}

type ModelMode = 'simple' | 'advanced';

export interface StoragePredictorSnapshot {
    predicted: number;
    averageWithdrawal: number;
    weekStart: string;
    weekEnd: string;
    eiaReportDate: string;
}

interface StoragePredictorProps {
    weatherData: WeatherRegionData[];
    historicalStorageData?: HistoricalStoragePoint[];
    historicalAvgWithdrawal?: number;
    model?: ModelMode;
    weekOffset?: number;
    henryHubPrice?: number;
    currentStorageBcf?: number;
    lngUtilizationRate?: number;
    title?: string;
    isLoading?: boolean;
    onPredictionComputed?: (snapshot: StoragePredictorSnapshot) => void;
}

interface WeeklyDelta {
    period: string;
    delta: number;
    week: number;
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function formatDate(value: Date) {
    return value.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

function formatBcf(value: number, digits: number = 1) {
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    }).format(value);
}

function getStorageWeekTimeline(weekOffset: number) {
    const referenceDate = new Date();
    referenceDate.setDate(referenceDate.getDate() + weekOffset * 7);

    const weekEndingFriday = new Date(referenceDate);
    const day = weekEndingFriday.getDay();
    const diffToFriday = (5 - day + 7) % 7;
    weekEndingFriday.setDate(weekEndingFriday.getDate() + diffToFriday);
    weekEndingFriday.setHours(0, 0, 0, 0);

    const weekStart = new Date(weekEndingFriday);
    weekStart.setDate(weekStart.getDate() - 6);

    const eiaReportDate = new Date(weekEndingFriday);
    eiaReportDate.setDate(eiaReportDate.getDate() + 6);
    eiaReportDate.setHours(10, 30, 0, 0);

    return { weekStart, weekEndingFriday, eiaReportDate };
}

function getIsoWeek(date: Date): number {
    const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNr = (target.getUTCDay() + 6) % 7;
    target.setUTCDate(target.getUTCDate() - dayNr + 3);
    const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
    const diff = target.getTime() - firstThursday.getTime();
    return 1 + Math.round(diff / (7 * 24 * 60 * 60 * 1000));
}

function toSortedStorage(history: HistoricalStoragePoint[] | undefined): HistoricalStoragePoint[] {
    return (history || [])
        .slice()
        .sort((a, b) => new Date(a.period).getTime() - new Date(b.period).getTime())
        .filter((row) => Number.isFinite(row.value));
}

function buildWeeklyDeltas(sortedStorage: HistoricalStoragePoint[]): WeeklyDelta[] {
    const rows: WeeklyDelta[] = [];

    for (let i = 1; i < sortedStorage.length; i++) {
        const current = sortedStorage[i];
        const previous = sortedStorage[i - 1];
        const periodDate = new Date(current.period);
        rows.push({
            period: current.period,
            delta: current.value - previous.value,
            week: getIsoWeek(periodDate)
        });
    }

    return rows;
}

function average(values: number[]): number {
    if (!values.length) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function resolveRegionWeight(region: string): number {
    const lower = region.toLowerCase();
    if (lower.includes('east')) return 0.35;
    if (lower.includes('midwest')) return 0.30;
    if (lower.includes('south')) return 0.20;
    if (lower.includes('west') && !lower.includes('midwest')) return 0.10;
    if (lower.includes('mountain')) return 0.05;
    return 0;
}

function getWeekForecast(region: WeatherRegionData, weekOffset: number) {
    const sortedForecast = (region.forecast || [])
        .slice()
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (sortedForecast.length >= (weekOffset + 1) * 7) {
        const slice = sortedForecast.slice(weekOffset * 7, (weekOffset + 1) * 7);
        return {
            hdd: slice.reduce((sum, day) => sum + day.hdd, 0),
            cdd: slice.reduce((sum, day) => sum + day.cdd, 0)
        };
    }

    if (weekOffset === 0) {
        return {
            hdd: region.total7DayHDD,
            cdd: region.total7DayCDD
        };
    }

    return {
        hdd: region.total7DayHDD * 0.95,
        cdd: region.total7DayCDD * 1.05
    };
}

function weatherDeviationTerm(weatherData: WeatherRegionData[], weekOffset: number, targetDate: Date): number {
    const valid = weatherData.filter((row) => !row.error);
    if (!valid.length) {
        return 0;
    }

    let weightedHdd = 0;
    let weightedCdd = 0;
    for (const region of valid) {
        const weight = resolveRegionWeight(region.region);
        if (!weight) continue;
        const week = getWeekForecast(region, weekOffset);
        weightedHdd += week.hdd * weight;
        weightedCdd += week.cdd * weight;
    }

    const month = targetDate.getMonth() + 1;
    const winter = month >= 11 || month <= 3;

    const normalHdd = winter ? 105 : 45;
    const normalCdd = winter ? 25 : month >= 6 && month <= 8 ? 90 : 55;

    if (winter) {
        const deviation = normalHdd > 0 ? (weightedHdd - normalHdd) / normalHdd : 0;
        return deviation * 42;
    }

    const deviation = normalCdd > 0 ? (weightedCdd - normalCdd) / normalCdd : 0;
    return deviation * 30;
}

function findPriorYearDelta(changes: WeeklyDelta[], targetDate: Date): number {
    const target = new Date(targetDate);
    target.setDate(target.getDate() - 364);

    let best: WeeklyDelta | null = null;
    let minDistance = Number.POSITIVE_INFINITY;

    for (const row of changes) {
        const distance = Math.abs(new Date(row.period).getTime() - target.getTime());
        if (distance < minDistance) {
            minDistance = distance;
            best = row;
        }
    }

    return best?.delta ?? average(changes.slice(-8).map((row) => row.delta));
}

function clampForCalendarWeek(rawDelta: number, changes: WeeklyDelta[], targetWeek: number): { delta: number; min: number; max: number } {
    const sameWeek = changes
        .filter((row) => row.week === targetWeek)
        .map((row) => row.delta);

    const sample = sameWeek.length >= 6
        ? sameWeek
        : changes.slice(-156).map((row) => row.delta);

    const min = sample.length ? Math.min(...sample) : rawDelta - 60;
    const max = sample.length ? Math.max(...sample) : rawDelta + 60;
    return { delta: clamp(rawDelta, min, max), min, max };
}

function computeWeightedDelta(
    changes: WeeklyDelta[],
    targetDate: Date,
    weatherTerm: number,
    model: ModelMode
): {
    delta: number;
    trailing4: number;
    priorYear: number;
    weatherTerm: number;
    clampMin: number;
    clampMax: number;
} {
    const trailing4 = average(changes.slice(-4).map((row) => row.delta));
    const priorYear = findPriorYearDelta(changes, targetDate);

    const weights = model === 'advanced'
        ? { trailing: 0.45, priorYear: 0.35, weather: 0.20 }
        : { trailing: 0.55, priorYear: 0.30, weather: 0.15 };

    const rawDelta =
        trailing4 * weights.trailing +
        priorYear * weights.priorYear +
        weatherTerm * weights.weather;

    const targetWeek = getIsoWeek(targetDate);
    const clamped = clampForCalendarWeek(rawDelta, changes, targetWeek);

    return {
        delta: clamped.delta,
        trailing4,
        priorYear,
        weatherTerm,
        clampMin: clamped.min,
        clampMax: clamped.max
    };
}

function buildBacktestSeries(sortedStorage: HistoricalStoragePoint[], model: ModelMode) {
    const deltas = buildWeeklyDeltas(sortedStorage);
    if (sortedStorage.length < 40 || deltas.length < 20) {
        return { rows: [] as Array<{ week: string; forecast: number; actual: number }>, mape: 0, avgError: 0 };
    }

    const rows: Array<{ week: string; forecast: number; actual: number }> = [];

    for (let i = 8; i < deltas.length; i++) {
        const history = deltas.slice(0, i);
        if (history.length < 4) continue;

        const targetDate = new Date(deltas[i].period);
        const estimated = computeWeightedDelta(history, targetDate, 0, model);

        const previousStorage = sortedStorage[i].value;
        const actualStorage = sortedStorage[i + 1].value;
        const forecastStorage = previousStorage + estimated.delta;

        rows.push({
            week: new Date(deltas[i].period).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            forecast: Number(forecastStorage.toFixed(1)),
            actual: Number(actualStorage.toFixed(1))
        });
    }

    const recent = rows.slice(-12);

    const errorTerms = recent
        .filter((row) => row.actual !== 0)
        .map((row) => Math.abs((row.actual - row.forecast) / row.actual));

    const mape = errorTerms.length ? average(errorTerms) * 100 : 0;
    const absError = recent.map((row) => Math.abs(row.actual - row.forecast));
    const avgError = absError.length ? average(absError) : 0;

    return {
        rows: recent,
        mape,
        avgError
    };
}

export default function StoragePredictor({
    weatherData,
    historicalStorageData,
    historicalAvgWithdrawal,
    model = 'simple',
    weekOffset = 0,
    currentStorageBcf = 2500,
    title,
    isLoading = false,
    onPredictionComputed
}: StoragePredictorProps) {
    const computed = useMemo(() => {
        const sortedStorage = toSortedStorage(historicalStorageData);
        const deltas = buildWeeklyDeltas(sortedStorage);
        const latestStorage = sortedStorage.length ? sortedStorage[sortedStorage.length - 1].value : currentStorageBcf;

        const backtest = buildBacktestSeries(sortedStorage, model);

        let synthetic = [...deltas];
        let runningStorage = latestStorage;
        let selectedResult: ReturnType<typeof computeWeightedDelta> = {
            delta: 0,
            trailing4: 0,
            priorYear: 0,
            weatherTerm: 0,
            clampMin: -60,
            clampMax: 60
        };
        let selectedTimeline = getStorageWeekTimeline(weekOffset);

        for (let step = 0; step <= weekOffset; step++) {
            const timeline = getStorageWeekTimeline(step);
            const weatherTerm = weatherDeviationTerm(weatherData, step, timeline.weekEndingFriday);
            const result = computeWeightedDelta(synthetic, timeline.weekEndingFriday, weatherTerm, model);

            synthetic.push({
                period: timeline.weekEndingFriday.toISOString(),
                delta: result.delta,
                week: getIsoWeek(timeline.weekEndingFriday)
            });

            runningStorage += result.delta;

            if (step === weekOffset) {
                selectedResult = result;
                selectedTimeline = timeline;
            }
        }

        const averageWithdrawal = (historicalAvgWithdrawal
            ?? average(deltas.slice(-52).map((row) => Math.abs(row.delta))))
            || 90;

        const predictedWithdrawal = Math.abs(selectedResult.delta);
        const deviationPercent = averageWithdrawal > 0
            ? ((predictedWithdrawal - averageWithdrawal) / averageWithdrawal) * 100
            : 0;

        const chartRows = [...backtest.rows, {
            week: `${selectedTimeline.weekEndingFriday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}*`,
            forecast: Number(runningStorage.toFixed(1)),
            actual: Number.NaN
        }];

        const confidenceLow = selectedResult.delta - backtest.avgError;
        const confidenceHigh = selectedResult.delta + backtest.avgError;

        return {
            latestStorage,
            forecastStorage: runningStorage,
            delta: selectedResult.delta,
            confidenceLow,
            confidenceHigh,
            averageWithdrawal,
            deviationPercent,
            timeline: selectedTimeline,
            chartRows,
            mape: backtest.mape,
            trailing4: selectedResult.trailing4,
            priorYear: selectedResult.priorYear,
            weatherTerm: selectedResult.weatherTerm,
            clampMin: selectedResult.clampMin,
            clampMax: selectedResult.clampMax
        };
    }, [
        weatherData,
        historicalStorageData,
        historicalAvgWithdrawal,
        model,
        weekOffset,
        currentStorageBcf
    ]);

    useEffect(() => {
        if (!onPredictionComputed || isLoading) return;

        onPredictionComputed({
            predicted: Math.abs(computed.delta),
            averageWithdrawal: computed.averageWithdrawal,
            weekStart: computed.timeline.weekStart.toISOString(),
            weekEnd: computed.timeline.weekEndingFriday.toISOString(),
            eiaReportDate: computed.timeline.eiaReportDate.toISOString()
        });
    }, [computed, isLoading, onPredictionComputed]);

    if (isLoading) {
        return (
            <div className="bg-gradient-to-br from-violet-950 via-indigo-950 to-blue-950 rounded-xl p-6 shadow-2xl border border-violet-800/40 animate-pulse h-[520px]" />
        );
    }

    const season = (() => {
        const month = computed.timeline.weekEndingFriday.getMonth() + 1;
        return month >= 11 || month <= 3 ? 'winter' : 'summer';
    })();

    const severity = Math.abs(computed.delta) >= computed.averageWithdrawal * 1.15
        ? 'large'
        : Math.abs(computed.delta) <= computed.averageWithdrawal * 0.85
            ? 'small'
            : 'normal';

    const severityMeta = severity === 'large'
        ? { label: 'Large Move', color: 'text-red-300', badge: 'bg-red-500/20 border-red-400/40' }
        : severity === 'small'
            ? { label: 'Small Move', color: 'text-green-300', badge: 'bg-green-500/20 border-green-400/40' }
            : { label: 'Normal Move', color: 'text-amber-300', badge: 'bg-amber-500/20 border-amber-400/40' };

    return (
        <div className="bg-gradient-to-br from-violet-950 via-indigo-950 to-blue-950 rounded-xl p-5 md:p-6 shadow-2xl border border-violet-800/40 h-full">
            <div className="flex items-start justify-between gap-3 mb-5">
                <div>
                    <h3 className="text-lg font-black text-violet-100 tracking-tight">{title || 'Storage Predictor'}</h3>
                    <p className="text-[10px] uppercase tracking-widest text-violet-200/80 font-bold">
                        Weighted delta model | {season === 'winter' ? 'Winter regime' : 'Summer regime'} | {model === 'advanced' ? 'Advanced weights' : 'Simple weights'}
                    </p>
                    <p className="mt-1 text-[10px] text-violet-100/80 font-semibold">
                        Applicable week: {formatDate(computed.timeline.weekStart)} to {formatDate(computed.timeline.weekEndingFriday)}
                    </p>
                    <p className="text-[10px] text-violet-100/80 font-semibold">
                        Monitor EIA report on {formatDate(computed.timeline.eiaReportDate)}
                    </p>
                </div>
                <div className={`px-2 py-1 rounded-full border text-[10px] uppercase font-black tracking-wider ${severityMeta.badge} ${severityMeta.color}`}>
                    {severityMeta.label}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="rounded-lg bg-white/5 border border-white/10 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-violet-200/80 font-bold mb-1">Base Storage (Latest EIA)</div>
                    <div className="text-xl font-black text-white">{formatBcf(computed.latestStorage)} BCF</div>
                </div>
                <div className="rounded-lg bg-white/5 border border-white/10 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-violet-200/80 font-bold mb-1">Forecast Storage Level</div>
                    <div className="text-xl font-black text-white">{formatBcf(computed.forecastStorage)} BCF</div>
                </div>
            </div>

            <div className="text-center mb-5">
                <div className="text-[11px] uppercase tracking-wider text-violet-200/80 mb-1">Forecast Weekly Change</div>
                <div className="text-5xl md:text-6xl font-black text-white tracking-tight leading-none">
                    {computed.delta >= 0 ? '+' : ''}{formatBcf(computed.delta)} BCF
                </div>
                <div className="mt-2 text-xs text-violet-100/90 font-semibold">
                    Confidence range: {computed.confidenceLow >= 0 ? '+' : ''}{formatBcf(computed.confidenceLow)} to {computed.confidenceHigh >= 0 ? '+' : ''}{formatBcf(computed.confidenceHigh)} BCF
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="rounded-lg bg-white/5 border border-white/10 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-violet-200/80 font-bold mb-1 flex items-center gap-1">
                        {season === 'winter' ? <Snowflake className="w-3 h-3" /> : <ThermometerSun className="w-3 h-3" />}
                        Driver Mix
                    </div>
                    <div className="text-[11px] text-violet-100/90 space-y-1">
                        <div>4W avg change: {computed.trailing4 >= 0 ? '+' : ''}{formatBcf(computed.trailing4)} BCF</div>
                        <div>Prior-year week: {computed.priorYear >= 0 ? '+' : ''}{formatBcf(computed.priorYear)} BCF</div>
                        <div>Weather deviation term: {computed.weatherTerm >= 0 ? '+' : ''}{formatBcf(computed.weatherTerm)} BCF</div>
                    </div>
                </div>
                <div className="rounded-lg bg-white/5 border border-white/10 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-violet-200/80 font-bold mb-1">Clamp + Accuracy</div>
                    <div className="text-[11px] text-violet-100/90 space-y-1">
                        <div>Week clamp: {formatBcf(computed.clampMin)} to {formatBcf(computed.clampMax)} BCF</div>
                        <div>Vs avg withdrawal: {computed.deviationPercent >= 0 ? '+' : ''}{computed.deviationPercent.toFixed(1)}%</div>
                        <div>MAPE (forecast vs actual): {computed.mape.toFixed(2)}%</div>
                    </div>
                </div>
            </div>

            <div className="rounded-lg bg-black/20 border border-white/10 p-3">
                <div className="flex items-center justify-between mb-2">
                    <div className="text-[10px] uppercase tracking-widest text-violet-200/80 font-black flex items-center gap-1">
                        <Target className="w-3 h-3" />
                        Forecast vs Actual Overlay
                    </div>
                    <div className="text-xs font-bold text-violet-100">MAPE: {computed.mape.toFixed(2)}%</div>
                </div>
                <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={computed.chartRows}>
                            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} stroke="#c4b5fd" />
                            <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#e9d5ff' }} />
                            <YAxis tick={{ fontSize: 10, fill: '#e9d5ff' }} width={45} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#2e1065', border: '1px solid #7c3aed', color: '#fff' }}
                                formatter={(value: number, name: string) => [`${formatBcf(value)} BCF`, name === 'forecast' ? 'Forecast' : 'Actual']}
                            />
                            <Line type="monotone" dataKey="forecast" stroke="#f59e0b" strokeWidth={2} dot={false} />
                            <Line type="monotone" dataKey="actual" stroke="#22c55e" strokeWidth={2} dot={false} connectNulls={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="mt-3 text-[10px] text-violet-100/80 flex items-center gap-2">
                <AlertTriangle className="w-3 h-3 text-violet-200" />
                <span>Forecast uses weighted 4-week average, prior-year week match and weather deviation, with calendar-week clamp.</span>
            </div>

            <div className="mt-2 text-[10px] uppercase tracking-wider text-violet-200/70 font-bold flex items-center gap-1">
                <TrendingDown className="w-3 h-3" />
                Forecast for informational use only
            </div>
        </div>
    );
}
