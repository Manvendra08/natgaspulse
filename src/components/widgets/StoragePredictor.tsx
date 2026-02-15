'use client';

import { useEffect, useMemo } from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid
} from 'recharts';
import { AlertTriangle, Snowflake, ThermometerSun, TrendingDown, Target } from 'lucide-react';
import {
    calculateWeightedHDD,
    compareToAverage,
    getAccuracyScore,
    predictStorageChange,
    resolveSeason,
    type PredictorSeason,
    type RegionalDegreeInput
} from '@/lib/utils/storage-predictor';
import { calculateAdvancedPrediction } from '@/lib/utils/advanced-storage-model';

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

type RegionKey = keyof RegionalDegreeInput;

const REGION_WEIGHTS: Record<RegionKey, number> = {
    east: 0.35,
    midwest: 0.3,
    south: 0.2,
    west: 0.1,
    mountain: 0.05
};

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function toWeekLabel(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatBcf(value: number, digits: number = 0) {
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    }).format(value);
}

function resolveRegionKey(region: string): RegionKey | null {
    const value = region.toLowerCase();
    if (value.includes('east')) return 'east';
    if (value.includes('midwest')) return 'midwest';
    if (value.includes('south')) return 'south';
    if (value.includes('west') && !value.includes('midwest')) return 'west';
    if (value.includes('mountain')) return 'mountain';
    return null;
}

function getWeekForecast(region: WeatherRegionData, weekOffset: number) {
    const sortedForecast = (region.forecast || [])
        .slice()
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (sortedForecast.length >= (weekOffset + 1) * 7) {
        const slice = sortedForecast.slice(weekOffset * 7, (weekOffset + 1) * 7);
        return {
            hdd: Math.round(slice.reduce((sum, d) => sum + d.hdd, 0)),
            cdd: Math.round(slice.reduce((sum, d) => sum + d.cdd, 0))
        };
    }

    if (weekOffset === 0 && sortedForecast.length) {
        const slice = sortedForecast.slice(0, 7);
        return {
            hdd: Math.round(slice.reduce((sum, d) => sum + d.hdd, 0)),
            cdd: Math.round(slice.reduce((sum, d) => sum + d.cdd, 0))
        };
    }

    if (weekOffset === 1) {
        const baseHdd = region.total7DayHDD;
        const baseCdd = region.total7DayCDD;

        if (sortedForecast.length >= 7) {
            const first3 = sortedForecast.slice(0, 3);
            const last3 = sortedForecast.slice(4, 7);

            const first3Hdd = first3.reduce((sum, d) => sum + d.hdd, 0) || 1;
            const last3Hdd = last3.reduce((sum, d) => sum + d.hdd, 0);
            const first3Cdd = first3.reduce((sum, d) => sum + d.cdd, 0) || 1;
            const last3Cdd = last3.reduce((sum, d) => sum + d.cdd, 0);

            const hddTrend = clamp(last3Hdd / first3Hdd, 0.75, 1.25);
            const cddTrend = clamp(last3Cdd / first3Cdd, 0.75, 1.25);

            return {
                hdd: Math.round(baseHdd * hddTrend),
                cdd: Math.round(baseCdd * cddTrend)
            };
        }

        return {
            hdd: Math.round(baseHdd * 0.95),
            cdd: Math.round(baseCdd * 1.05)
        };
    }

    return {
        hdd: region.total7DayHDD,
        cdd: region.total7DayCDD
    };
}

function estimateHistoricalAverageWithdrawal(
    historicalStorageData: HistoricalStoragePoint[] | undefined,
    season: PredictorSeason
) {
    if (!historicalStorageData || historicalStorageData.length < 2) return 90;

    const sorted = historicalStorageData
        .slice()
        .sort((a, b) => new Date(a.period).getTime() - new Date(b.period).getTime());

    const seasonalWithdrawals: number[] = [];
    const allWithdrawals: number[] = [];

    for (let i = 1; i < sorted.length; i++) {
        const previous = sorted[i - 1].value;
        const current = sorted[i].value;
        const magnitude = Math.abs(previous - current);
        if (!Number.isFinite(magnitude)) continue;

        const month = new Date(sorted[i].period).getMonth() + 1;
        const isWinter = month >= 11 || month <= 3;

        allWithdrawals.push(magnitude);
        if ((season === 'winter' && isWinter) || (season === 'summer' && !isWinter)) {
            seasonalWithdrawals.push(magnitude);
        }
    }

    const selected = seasonalWithdrawals.length >= 12 ? seasonalWithdrawals : allWithdrawals;
    const recent = selected.slice(-156);

    if (!recent.length) return 90;
    return recent.reduce((sum, val) => sum + val, 0) / recent.length;
}

function buildAccuracySeries(historicalStorageData: HistoricalStoragePoint[] | undefined, season: PredictorSeason) {
    if (!historicalStorageData || historicalStorageData.length < 6) {
        return { rows: [] as Array<{ week: string; predicted: number; actual: number }>, accuracy: 0 };
    }

    const sorted = historicalStorageData
        .slice()
        .sort((a, b) => new Date(a.period).getTime() - new Date(b.period).getTime());

    const weeklyMagnitude = [];
    for (let i = 1; i < sorted.length; i++) {
        weeklyMagnitude.push({
            period: sorted[i].period,
            actual: Math.abs(sorted[i - 1].value - sorted[i].value)
        });
    }

    const modeled = [];
    for (let i = 3; i < weeklyMagnitude.length; i++) {
        const baseline =
            (weeklyMagnitude[i - 1].actual + weeklyMagnitude[i - 2].actual + weeklyMagnitude[i - 3].actual) / 3;
        const seasonalBias = season === 'winter' ? 1.06 : 0.94;
        const predicted = baseline * seasonalBias;

        modeled.push({
            week: toWeekLabel(weeklyMagnitude[i].period),
            predicted: Number(predicted.toFixed(1)),
            actual: Number(weeklyMagnitude[i].actual.toFixed(1))
        });
    }

    const rows = modeled.slice(-8);
    const accuracy = getAccuracyScore(
        rows.map((x) => x.predicted),
        rows.map((x) => x.actual)
    );

    return { rows, accuracy };
}

function getNormalDegreeDays(season: PredictorSeason, targetDate: Date) {
    const month = targetDate.getMonth() + 1;

    if (season === 'winter') {
        if (month === 12 || month === 1 || month === 2) return 110;
        return 80;
    }

    if (month >= 6 && month <= 8) return 90;
    return 60;
}

function formatDate(value: Date) {
    return value.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
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
    eiaReportDate.setDate(eiaReportDate.getDate() + 6); // Following Thursday
    eiaReportDate.setHours(10, 30, 0, 0);

    return {
        weekStart,
        weekEndingFriday,
        eiaReportDate
    };
}

export default function StoragePredictor({
    weatherData,
    historicalStorageData,
    historicalAvgWithdrawal,
    model = 'simple',
    weekOffset = 0,
    henryHubPrice = 3,
    currentStorageBcf = 2500,
    lngUtilizationRate = 0.95,
    title,
    isLoading = false,
    onPredictionComputed
}: StoragePredictorProps) {
    const computed = useMemo(() => {
        const rows = weatherData
            .filter((r) => !r.error)
            .map((region) => {
                const key = resolveRegionKey(region.region);
                const week = getWeekForecast(region, weekOffset);
                return {
                    region: region.region,
                    key,
                    hdd: week.hdd,
                    cdd: week.cdd
                };
            })
            .filter((r) => r.key !== null) as Array<{ region: string; key: RegionKey; hdd: number; cdd: number }>;

        const hddInput: RegionalDegreeInput = { east: 0, midwest: 0, south: 0, west: 0, mountain: 0 };
        const cddInput: RegionalDegreeInput = { east: 0, midwest: 0, south: 0, west: 0, mountain: 0 };

        rows.forEach((row) => {
            hddInput[row.key] = row.hdd;
            cddInput[row.key] = row.cdd;
        });

        const weightedHDD = calculateWeightedHDD(hddInput);
        const weightedCDD = calculateWeightedHDD(cddInput);
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + weekOffset * 7);
        const season = resolveSeason(targetDate);

        const weatherValue = season === 'winter' ? weightedHDD : weightedCDD;
        const simplePrediction = predictStorageChange(weatherValue, season);

        const normalIndex = getNormalDegreeDays(season, targetDate);
        const advancedPrediction = calculateAdvancedPrediction({
            weightedHDD,
            weightedCDD,
            season,
            normalWeightedHDD: normalIndex,
            normalWeightedCDD: normalIndex,
            includesWeekend: true,
            henryHubPrice,
            lngUtilizationRate,
            currentStorageBcf,
            baseIndustrialDemand: season === 'winter' ? 50 : 35,
            baseLngExportBcfPerDay: 13
        });

        const selected = model === 'advanced' ? advancedPrediction : simplePrediction;
        const avg = historicalAvgWithdrawal ?? estimateHistoricalAverageWithdrawal(historicalStorageData, season);
        const comparison = compareToAverage(selected.predicted, avg);
        const accuracy = buildAccuracySeries(historicalStorageData, season);
        const timeline = getStorageWeekTimeline(weekOffset);

        return {
            rows,
            weightedHDD,
            weightedCDD,
            season,
            prediction: selected,
            averageWithdrawal: avg,
            comparison,
            accuracyRows: accuracy.rows,
            accuracyScore: accuracy.accuracy,
            advancedBreakdown: model === 'advanced' ? advancedPrediction.breakdown : null,
            timeline
        };
    }, [
        currentStorageBcf,
        henryHubPrice,
        historicalAvgWithdrawal,
        historicalStorageData,
        lngUtilizationRate,
        model,
        weatherData,
        weekOffset
    ]);

    useEffect(() => {
        if (!onPredictionComputed) return;
        if (isLoading) return;

        onPredictionComputed({
            predicted: computed.prediction.predicted,
            averageWithdrawal: computed.averageWithdrawal,
            weekStart: computed.timeline.weekStart.toISOString(),
            weekEnd: computed.timeline.weekEndingFriday.toISOString(),
            eiaReportDate: computed.timeline.eiaReportDate.toISOString()
        });
    }, [
        computed.averageWithdrawal,
        computed.prediction.predicted,
        computed.timeline.eiaReportDate,
        computed.timeline.weekEndingFriday,
        computed.timeline.weekStart,
        isLoading,
        onPredictionComputed
    ]);

    if (isLoading) {
        return (
            <div className="bg-gradient-to-br from-violet-950 via-indigo-950 to-blue-950 rounded-xl p-6 shadow-2xl border border-violet-800/40 animate-pulse h-[520px]" />
        );
    }

    const severity =
        computed.prediction.predicted >= computed.averageWithdrawal * 1.15
            ? 'large'
            : computed.prediction.predicted <= computed.averageWithdrawal * 0.85
                ? 'small'
                : 'normal';

    const severityMeta = severity === 'large'
        ? { label: 'Large Withdrawal', color: 'text-red-300', badge: 'bg-red-500/20 border-red-400/40' }
        : severity === 'small'
            ? { label: 'Small Withdrawal', color: 'text-green-300', badge: 'bg-green-500/20 border-green-400/40' }
            : { label: 'Normal Withdrawal', color: 'text-amber-300', badge: 'bg-amber-500/20 border-amber-400/40' };

    const mainMetricLabel = computed.season === 'winter' ? 'Weighted HDD' : 'Weighted CDD';
    const weekLabel = weekOffset === 0 ? 'Current Week' : 'Next Week';
    const hasRegionalData = computed.rows.length > 0;

    return (
        <div className="bg-gradient-to-br from-violet-950 via-indigo-950 to-blue-950 rounded-xl p-5 md:p-6 shadow-2xl border border-violet-800/40 h-full">
            <div className="flex items-start justify-between gap-3 mb-5">
                <div>
                    <h3 className="text-lg font-black text-violet-100 tracking-tight">{title || `${weekLabel} Storage Predictor`}</h3>
                    <p className="text-[10px] uppercase tracking-widest text-violet-200/80 font-bold">
                        {computed.season === 'winter' ? 'Winter model' : 'Summer model'} | {model === 'advanced' ? 'Advanced' : 'Simple'} regression
                    </p>
                    <p className="mt-1 text-[10px] text-violet-100/80 font-semibold">
                        Applicable week: {formatDate(computed.timeline.weekStart)} to {formatDate(computed.timeline.weekEndingFriday)} (week ending Friday)
                    </p>
                    <p className="text-[10px] text-violet-100/80 font-semibold">
                        Monitor EIA report on {formatDate(computed.timeline.eiaReportDate)} for week ending {formatDate(computed.timeline.weekEndingFriday)}
                    </p>
                </div>
                <div className={`px-2 py-1 rounded-full border text-[10px] uppercase font-black tracking-wider ${severityMeta.badge} ${severityMeta.color}`}>
                    {severityMeta.label}
                </div>
            </div>

            <div className="text-center mb-5">
                <div className="text-[11px] uppercase tracking-wider text-violet-200/80 mb-1">
                    Predicted Storage Change
                </div>
                <div className="text-5xl md:text-6xl font-black text-white tracking-tight leading-none">
                    {formatBcf(computed.prediction.predicted)} BCF
                </div>
                <div className="mt-2 text-xs text-violet-100/90 font-semibold">
                    Confidence: {formatBcf(computed.prediction.confidenceLow)} to {formatBcf(computed.prediction.confidenceHigh)} BCF
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="rounded-lg bg-white/5 border border-white/10 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-violet-200/80 font-bold mb-1 flex items-center gap-1">
                        {computed.season === 'winter' ? <Snowflake className="w-3 h-3" /> : <ThermometerSun className="w-3 h-3" />}
                        {mainMetricLabel}
                    </div>
                    <div className="text-xl font-black text-white">
                        {computed.season === 'winter'
                            ? formatBcf(computed.weightedHDD, 1)
                            : formatBcf(computed.weightedCDD, 1)}
                    </div>
                </div>
                <div className="rounded-lg bg-white/5 border border-white/10 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-violet-200/80 font-bold mb-1">
                        Vs 5Y Avg Withdrawal
                    </div>
                    <div className="text-xl font-black text-white">
                        {computed.comparison.deviationPercent > 0 ? '+' : ''}{computed.comparison.deviationPercent.toFixed(1)}%
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-violet-200/70">
                        Avg: {formatBcf(computed.averageWithdrawal)} BCF
                    </div>
                </div>
            </div>

            <div className="rounded-lg border border-white/10 overflow-hidden mb-5 bg-black/20">
                <div className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-violet-200/80">
                    Regional HDD/CDD Breakdown
                </div>
                <div className="overflow-auto">
                    <table className="w-full text-xs">
                        <thead className="bg-white/5 text-violet-200/80">
                            <tr>
                                <th className="text-left px-3 py-1.5 font-bold">Region</th>
                                <th className="text-right px-3 py-1.5 font-bold">7D HDD</th>
                                <th className="text-right px-3 py-1.5 font-bold">7D CDD</th>
                                <th className="text-right px-3 py-1.5 font-bold">Weight</th>
                            </tr>
                        </thead>
                        <tbody>
                            {computed.rows.map((row) => (
                                <tr key={row.region} className="border-t border-white/10 text-violet-100">
                                    <td className="px-3 py-1.5">{row.region.split('(')[0].trim()}</td>
                                    <td className="px-3 py-1.5 text-right">{formatBcf(row.hdd)}</td>
                                    <td className="px-3 py-1.5 text-right">{formatBcf(row.cdd)}</td>
                                    <td className="px-3 py-1.5 text-right">{Math.round(REGION_WEIGHTS[row.key] * 100)}%</td>
                                </tr>
                            ))}
                            {!hasRegionalData && (
                                <tr className="border-t border-white/10 text-violet-200/80">
                                    <td className="px-3 py-2 text-center" colSpan={4}>
                                        NOAA regional data not available yet. Retrying with next refresh.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="rounded-lg bg-black/20 border border-white/10 p-3">
                <div className="flex items-center justify-between mb-2">
                    <div className="text-[10px] uppercase tracking-widest text-violet-200/80 font-black flex items-center gap-1">
                        <Target className="w-3 h-3" />
                        Historical Accuracy (Last 8 Weeks)
                    </div>
                    <div className="text-xs font-bold text-violet-100">
                        Accuracy: {computed.accuracyScore.toFixed(1)}%
                    </div>
                </div>
                <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={computed.accuracyRows}>
                            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} stroke="#c4b5fd" />
                            <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#e9d5ff' }} />
                            <YAxis tick={{ fontSize: 10, fill: '#e9d5ff' }} width={35} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#2e1065', border: '1px solid #7c3aed', color: '#fff' }}
                                formatter={(value: number, name: string) => [`${formatBcf(value, 1)} BCF`, name === 'predicted' ? 'Predicted' : 'Actual']}
                            />
                            <Line type="monotone" dataKey="predicted" stroke="#f59e0b" strokeWidth={2} dot={false} />
                            <Line type="monotone" dataKey="actual" stroke="#22c55e" strokeWidth={2} dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {computed.advancedBreakdown && (
                <div className="mt-3 text-[10px] text-violet-100/80 flex items-center gap-2">
                    <AlertTriangle className="w-3 h-3 text-violet-200" />
                    <span>
                        Advanced factors: Weather {computed.advancedBreakdown.weatherTerm.toFixed(1)}, LNG {computed.advancedBreakdown.lngExportTerm.toFixed(1)}, Industrial {computed.advancedBreakdown.industrialTerm.toFixed(1)}
                    </span>
                </div>
            )}

            <div className="mt-2 text-[10px] uppercase tracking-wider text-violet-200/70 font-bold flex items-center gap-1">
                <TrendingDown className="w-3 h-3" />
                Forecast for informational use only
            </div>
        </div>
    );
}

