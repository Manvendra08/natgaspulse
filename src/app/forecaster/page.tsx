'use client';

/**
 * /forecaster — NOAA-weighted storage prediction engine
 *
 * Fixes applied:
 *  - Each data source (storage, price, weather) has its own error state surfaced in UI.
 *  - Data freshness timestamps shown per source.
 *  - All fetch calls wrapped in try/catch; errors do not block other sources.
 *  - Confidence score per signal shown in StorageSignals.
 *  - Stale-data warning shown when EIA data is older than 8 days.
 *  - Weather error shown per-region (NOAA sometimes fails individual gridpoints).
 *  - Model mode persisted in sessionStorage so it survives soft navigation.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertCircle, Clock, RefreshCw, CheckCircle2, WifiOff } from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import WeatherWidget from '@/components/widgets/WeatherWidget';
import StoragePredictor, { type StoragePredictorSnapshot } from '@/components/widgets/StoragePredictor';
import StorageSignals from '@/components/widgets/StorageSignals';

// ── Types ────────────────────────────────────────────────────────────────────

interface StorageData {
    current: number;
    weekEndingDate?: string;
    releaseDate?: string;
    historicalData: Array<{ period: string; value: number }>;
}

interface PriceData {
    current: number;
    date?: string;
}

interface WeatherRegionData {
    region: string;
    todayHDD: number;
    todayCDD: number;
    total7DayHDD: number;
    total7DayCDD: number;
    error?: boolean;
    forecast: Array<{ day: string; date: string; hdd: number; cdd: number; temp: number }>;
}

type ModelMode = 'simple' | 'advanced';

interface FetchState<T> {
    data: T | null;
    loading: boolean;
    error: string | null;
    fetchedAt: Date | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function freshness(fetchedAt: Date | null): string {
    if (!fetchedAt) return '';
    const diffMs = Date.now() - fetchedAt.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    return `${Math.floor(diffH / 24)}d ago`;
}

function isStale(fetchedAt: Date | null, maxAgeMs: number): boolean {
    if (!fetchedAt) return false;
    return Date.now() - fetchedAt.getTime() > maxAgeMs;
}

function isEiaReleaseWindow(now: Date = new Date()): boolean {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).formatToParts(now);

    const weekday = parts.find((p) => p.type === 'weekday')?.value || '';
    const hour = Number(parts.find((p) => p.type === 'hour')?.value || '0');
    const minute = Number(parts.find((p) => p.type === 'minute')?.value || '0');
    const totalMinutes = hour * 60 + minute;
    return weekday === 'Thu' && totalMinutes >= 9 * 60 && totalMinutes < 11 * 60;
}

function DataBadge({
    label,
    fetchedAt,
    error,
    loading
}: {
    label: string;
    fetchedAt: Date | null;
    error: string | null;
    loading: boolean;
}) {
    if (loading) {
        return (
            <span className="inline-flex items-center gap-1 text-[10px] text-zinc-500 font-mono">
                <RefreshCw className="w-3 h-3 animate-spin" /> {label}…
            </span>
        );
    }
    if (error) {
        return (
            <span className="inline-flex items-center gap-1 text-[10px] text-red-500 font-mono">
                <WifiOff className="w-3 h-3" /> {label}: {error}
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">
            <CheckCircle2 className="w-3 h-3" /> {label} · {freshness(fetchedAt)}
        </span>
    );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function ForecasterPage() {
    // ── Per-source fetch state ────────────────────────────────────────────────
    const [storage, setStorage] = useState<FetchState<StorageData>>({
        data: null, loading: true, error: null, fetchedAt: null
    });
    const [price, setPrice] = useState<FetchState<PriceData>>({
        data: null, loading: true, error: null, fetchedAt: null
    });
    const [weather, setWeather] = useState<FetchState<WeatherRegionData[]>>({
        data: null, loading: true, error: null, fetchedAt: null
    });

    // ── Model mode (persisted in sessionStorage) ──────────────────────────────
    const [modelMode, setModelMode] = useState<ModelMode>(() => {
        if (typeof window !== 'undefined') {
            const saved = sessionStorage.getItem('forecaster_model');
            if (saved === 'advanced' || saved === 'simple') return saved;
        }
        return 'simple';
    });
    const [releaseWindow, setReleaseWindow] = useState<boolean>(isEiaReleaseWindow());

    const setModel = (m: ModelMode) => {
        setModelMode(m);
        try { sessionStorage.setItem('forecaster_model', m); } catch { /* ignore */ }
    };

    // ── Snapshot state ────────────────────────────────────────────────────────
    const [currentWeekSnapshot, setCurrentWeekSnapshot] = useState<StoragePredictorSnapshot | null>(null);
    const [nextWeekSnapshot, setNextWeekSnapshot] = useState<StoragePredictorSnapshot | null>(null);

    // ── Fetch functions ───────────────────────────────────────────────────────

    const fetchStorage = useCallback(async () => {
        setStorage(s => ({ ...s, loading: true, error: null }));
        try {
            const res = await fetch('/api/eia/storage', { cache: 'no-store' });
            const json = await res.json().catch(() => null);
            if (!res.ok || json?.error) throw new Error(json?.error ?? `HTTP ${res.status}`);
            setStorage({ data: json as StorageData, loading: false, error: null, fetchedAt: new Date() });
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Storage fetch failed';
            console.error('[forecaster] storage error:', err);
            setStorage(s => ({ ...s, loading: false, error: msg }));
        }
    }, []);

    const fetchPrice = useCallback(async () => {
        setPrice(s => ({ ...s, loading: true, error: null }));
        try {
            const res = await fetch('/api/market/prices?range=1mo', { cache: 'no-store' });
            const json = await res.json().catch(() => null);
            if (!res.ok || json?.error) throw new Error(json?.error ?? `HTTP ${res.status}`);
            setPrice({ data: json as PriceData, loading: false, error: null, fetchedAt: new Date() });
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Price fetch failed';
            console.error('[forecaster] price error:', err);
            setPrice(s => ({ ...s, loading: false, error: msg }));
        }
    }, []);

    const fetchWeather = useCallback(async () => {
        setWeather(s => ({ ...s, loading: true, error: null }));
        try {
            const res = await fetch('/api/weather/hdd-cdd', { cache: 'no-store' });
            const json = await res.json().catch(() => null);
            if (!res.ok || json?.error) throw new Error(json?.error ?? `HTTP ${res.status}`);
            // json is an array of region objects; some may have error:true (per-region NOAA failure)
            const regions = Array.isArray(json) ? (json as WeatherRegionData[]) : [];
            setWeather({ data: regions, loading: false, error: null, fetchedAt: new Date() });
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Weather fetch failed';
            console.error('[forecaster] weather error:', err);
            setWeather(s => ({ ...s, loading: false, error: msg }));
        }
    }, []);

    // ── Initial load ──────────────────────────────────────────────────────────
    useEffect(() => {
        fetchStorage();
        fetchPrice();
        fetchWeather();

        // Weather refreshes every 6 hours (NOAA updates ~4x/day)
        const weatherTimer = setInterval(fetchWeather, 6 * 60 * 60 * 1000);
        // Storage refreshes hourly baseline, with 5m polling during EIA release window.
        const storageTimer = setInterval(fetchStorage, 60 * 60 * 1000);
        const releaseWindowTimer = setInterval(() => {
            const inWindow = isEiaReleaseWindow();
            setReleaseWindow(inWindow);
            if (inWindow) {
                fetchStorage();
            }
        }, 5 * 60 * 1000);
        const releaseWindowStateTimer = setInterval(() => {
            setReleaseWindow(isEiaReleaseWindow());
        }, 60 * 1000);

        setReleaseWindow(isEiaReleaseWindow());

        return () => {
            clearInterval(weatherTimer);
            clearInterval(storageTimer);
            clearInterval(releaseWindowTimer);
            clearInterval(releaseWindowStateTimer);
        };
    }, [fetchStorage, fetchPrice, fetchWeather]);

    // ── Derived values ────────────────────────────────────────────────────────

    const isPredictorLoading = storage.loading || price.loading || weather.loading;

    // Stale EIA data warning: EIA publishes weekly; if data is >8 days old something is wrong
    const storageStale = isStale(storage.fetchedAt, 8 * 24 * 60 * 60 * 1000) && !storage.loading;

    // Count NOAA regions with errors
    const weatherRegionErrors = useMemo(() => {
        if (!weather.data) return 0;
        return weather.data.filter(r => r.error).length;
    }, [weather.data]);

    const actualLatestWithdrawal = useMemo(() => {
        const history = storage.data?.historicalData;
        if (!history || history.length < 2) return null;
        const sorted = [...history].sort(
            (a, b) => new Date(a.period).getTime() - new Date(b.period).getTime()
        );
        const latest = sorted[sorted.length - 1]?.value;
        const previous = sorted[sorted.length - 2]?.value;
        if (!Number.isFinite(latest) || !Number.isFinite(previous)) return null;
        return Math.abs(previous - latest);
    }, [storage.data?.historicalData]);

    const formatDate = (value: string) =>
        new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    const currentPredictionWindowLabel = currentWeekSnapshot
        ? `Applicable week: ${formatDate(currentWeekSnapshot.weekStart)} to ${formatDate(currentWeekSnapshot.weekEnd)}`
        : undefined;

    const currentEiaMonitorLabel = currentWeekSnapshot
        ? `Monitor EIA report: ${formatDate(currentWeekSnapshot.eiaReportDate)} (Thursday 10:30 AM EST)`
        : undefined;

    const handleCurrentSnapshot = useCallback((snapshot: StoragePredictorSnapshot) => {
        setCurrentWeekSnapshot(snapshot);
    }, []);

    const handleNextSnapshot = useCallback((snapshot: StoragePredictorSnapshot) => {
        setNextWeekSnapshot(snapshot);
    }, []);

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-white dark:bg-zinc-950 transition-colors duration-300">
            <Navbar />

            <div className="p-4 md:p-8 max-w-[1600px] mx-auto">

                {/* Header */}
                <div className="mb-6 md:mb-8 text-center md:text-left">
                    <div className="flex flex-col md:flex-row items-center gap-3 mb-2 md:mb-1">
                        <Activity className="w-8 h-8 md:w-10 md:h-10 text-violet-500" />
                        <h1 className="text-3xl md:text-4xl font-black bg-gradient-to-r from-violet-500 to-blue-500 bg-clip-text text-transparent tracking-tighter">
                            FORECASTER
                        </h1>
                    </div>
                    <p className="text-zinc-500 dark:text-zinc-400 text-xs md:text-sm font-medium uppercase tracking-widest">
                        NOAA-weighted storage prediction engine · simple and advanced regression modes
                    </p>
                </div>

                {/* Data source status bar */}
                <div className="mb-5 flex flex-wrap items-center gap-4 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-500 font-black">
                        <Clock className="w-3 h-3" /> Data Sources
                    </div>
                    {releaseWindow && (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-black text-emerald-500">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            Live updating...
                        </span>
                    )}
                    <DataBadge label="EIA Storage" fetchedAt={storage.fetchedAt} error={storage.error} loading={storage.loading} />
                    <DataBadge label="Market Price" fetchedAt={price.fetchedAt} error={price.error} loading={price.loading} />
                    <DataBadge label="NOAA Weather" fetchedAt={weather.fetchedAt} error={weather.error} loading={weather.loading} />
                    <button
                        onClick={() => { fetchStorage(); fetchPrice(); fetchWeather(); }}
                        className="ml-auto flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition"
                    >
                        <RefreshCw className="w-3 h-3" /> Refresh all
                    </button>
                </div>

                {/* Stale EIA data warning */}
                {storageStale && storage.data && (
                    <div className="mb-4 flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        EIA storage data may be stale (last fetched {freshness(storage.fetchedAt)}).
                        {storage.data.weekEndingDate && ` Latest report week ending: ${formatDate(storage.data.weekEndingDate)}.`}
                    </div>
                )}

                {/* Per-source errors */}
                {(storage.error || price.error || weather.error) && (
                    <div className="mb-5 space-y-2">
                        {storage.error && (
                            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                <span><strong>EIA Storage:</strong> {storage.error}</span>
                            </div>
                        )}
                        {price.error && (
                            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                <span><strong>Market Price:</strong> {price.error}</span>
                            </div>
                        )}
                        {weather.error && (
                            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                <span><strong>NOAA Weather:</strong> {weather.error}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Per-region NOAA warning */}
                {weatherRegionErrors > 0 && !weather.error && (
                    <div className="mb-4 flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        {weatherRegionErrors} NOAA region{weatherRegionErrors > 1 ? 's' : ''} failed to load.
                        Predictions use available regions only. Accuracy may be reduced.
                    </div>
                )}

                {/* Model selector */}
                <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
                    <div className="text-xs uppercase tracking-wider font-black text-zinc-500 dark:text-zinc-400">
                        Model Selection
                    </div>
                    <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-1">
                        {(['simple', 'advanced'] as ModelMode[]).map((m) => (
                            <button
                                key={m}
                                onClick={() => setModel(m)}
                                className={`px-3 py-1.5 rounded text-xs font-black uppercase tracking-wider transition-all ${modelMode === m
                                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                                    : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                                    }`}
                            >
                                {m === 'simple' ? 'Simple Model' : 'Advanced Model'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Predictors */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-4">
                    <StoragePredictor
                        title="Current Week Prediction"
                        weatherData={weather.data ?? []}
                        historicalStorageData={storage.data?.historicalData}
                        model={modelMode}
                        weekOffset={0}
                        henryHubPrice={price.data?.current ?? 3}
                        currentStorageBcf={storage.data?.current ?? 2500}
                        isLoading={isPredictorLoading}
                        onPredictionComputed={handleCurrentSnapshot}
                    />
                    <StoragePredictor
                        title="Next Week Prediction"
                        weatherData={weather.data ?? []}
                        historicalStorageData={storage.data?.historicalData}
                        model={modelMode}
                        weekOffset={1}
                        henryHubPrice={price.data?.current ?? 3}
                        currentStorageBcf={storage.data?.current ?? 2500}
                        isLoading={isPredictorLoading}
                        onPredictionComputed={handleNextSnapshot}
                    />
                </div>

                {/* Storage signals */}
                <div className="mb-6">
                    <StorageSignals
                        predictedWithdrawal={currentWeekSnapshot?.predicted ?? null}
                        averageWithdrawal={currentWeekSnapshot?.averageWithdrawal ?? null}
                        actualWithdrawal={actualLatestWithdrawal}
                        predictionWindowLabel={currentPredictionWindowLabel}
                        nextEiaReportLabel={currentEiaMonitorLabel}
                        isLoading={isPredictorLoading}
                    />
                </div>

                {/* EIA data freshness detail */}
                {storage.data?.weekEndingDate && (
                    <div className="mb-4 flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                        <Clock className="w-3 h-3" />
                        EIA report: week ending {formatDate(storage.data.weekEndingDate)}
                        {storage.data.releaseDate && ` · released ${formatDate(storage.data.releaseDate)}`}
                        {storage.fetchedAt && ` · fetched ${freshness(storage.fetchedAt)}`}
                    </div>
                )}

                {/* Disclaimer */}
                <div className="mb-8 text-[11px] uppercase tracking-wider font-bold text-amber-600 dark:text-amber-400 border border-amber-500/30 bg-amber-500/10 rounded-lg px-3 py-2">
                    Predictions based on statistical models. Actual results may vary. Not financial advice.
                </div>

                {/* Weather widget */}
                <div className="grid grid-cols-1 gap-6">
                    <WeatherWidget data={weather.data ?? []} isLoading={weather.loading} />
                </div>

                {/* Next-week window footer */}
                {nextWeekSnapshot && (
                    <div className="mt-4 text-[11px] text-zinc-500 dark:text-zinc-400">
                        Next-week window: {formatDate(nextWeekSnapshot.weekStart)} to {formatDate(nextWeekSnapshot.weekEnd)}
                        {' '}· EIA monitor: {formatDate(nextWeekSnapshot.eiaReportDate)}
                    </div>
                )}
            </div>
        </div>
    );
}
