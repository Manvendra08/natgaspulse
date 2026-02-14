'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertCircle } from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import WeatherWidget from '@/components/widgets/WeatherWidget';
import StoragePredictor, { type StoragePredictorSnapshot } from '@/components/widgets/StoragePredictor';
import StorageSignals from '@/components/widgets/StorageSignals';

interface StorageData {
    current: number;
    historicalData: Array<{ period: string; value: number }>;
}

interface PriceData {
    current: number;
}

interface WeatherData {
    region: string;
    todayHDD: number;
    todayCDD: number;
    total7DayHDD: number;
    total7DayCDD: number;
    error?: boolean;
    forecast: Array<{ day: string; date: string; hdd: number; cdd: number; temp: number }>;
}

type ModelMode = 'simple' | 'advanced';

export default function ForecasterPage() {
    const [storageData, setStorageData] = useState<StorageData | null>(null);
    const [priceData, setPriceData] = useState<PriceData | null>(null);
    const [weatherData, setWeatherData] = useState<WeatherData[]>([]);
    const [modelMode, setModelMode] = useState<ModelMode>('simple');
    const [currentWeekSnapshot, setCurrentWeekSnapshot] = useState<StoragePredictorSnapshot | null>(null);
    const [nextWeekSnapshot, setNextWeekSnapshot] = useState<StoragePredictorSnapshot | null>(null);

    const [isLoadingStorage, setIsLoadingStorage] = useState(true);
    const [isLoadingPrice, setIsLoadingPrice] = useState(true);
    const [isLoadingWeather, setIsLoadingWeather] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchStorage = () => {
            setIsLoadingStorage(true);
            fetch('/api/eia/storage')
                .then((res) => res.json())
                .then((data) => {
                    if (data.error) throw new Error(data.error);
                    setStorageData(data);
                })
                .catch((err) => {
                    console.error('Forecaster storage fetch error:', err);
                    setError('Failed to load storage data');
                })
                .finally(() => setIsLoadingStorage(false));
        };

        const fetchPrices = () => {
            setIsLoadingPrice(true);
            fetch('/api/market/prices?range=1mo')
                .then((res) => res.json())
                .then((data) => {
                    if (data.error) throw new Error(data.error);
                    setPriceData(data);
                })
                .catch((err) => {
                    console.error('Forecaster price fetch error:', err);
                    setError('Failed to load market pricing');
                })
                .finally(() => setIsLoadingPrice(false));
        };

        const fetchWeather = () => {
            setIsLoadingWeather(true);
            fetch('/api/weather/hdd-cdd')
                .then((res) => res.json())
                .then((data) => {
                    if (data.error) throw new Error(data.error);
                    setWeatherData(data);
                })
                .catch((err) => {
                    console.error('Forecaster weather fetch error:', err);
                    setError('Failed to load NOAA HDD/CDD forecast');
                })
                .finally(() => setIsLoadingWeather(false));
        };

        fetchStorage();
        fetchPrices();
        fetchWeather();

        const dailyWeatherRefresh = setInterval(fetchWeather, 24 * 60 * 60 * 1000);
        return () => clearInterval(dailyWeatherRefresh);
    }, []);

    const isPredictorLoading = isLoadingStorage || isLoadingPrice || isLoadingWeather;

    const actualLatestWithdrawal = useMemo(() => {
        const history = storageData?.historicalData;
        if (!history || history.length < 2) return null;

        const sorted = history
            .slice()
            .sort((a, b) => new Date(a.period).getTime() - new Date(b.period).getTime());

        const latest = sorted[sorted.length - 1]?.value;
        const previous = sorted[sorted.length - 2]?.value;
        if (!Number.isFinite(latest) || !Number.isFinite(previous)) return null;
        return Math.abs(previous - latest);
    }, [storageData?.historicalData]);

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

    return (
        <div className="min-h-screen bg-white dark:bg-zinc-950 transition-colors duration-300">
            <Navbar />

            <div className="p-4 md:p-8 max-w-[1600px] mx-auto">
                <div className="mb-6 md:mb-8 text-center md:text-left">
                    <div className="flex flex-col md:flex-row items-center gap-3 mb-2 md:mb-1">
                        <Activity className="w-8 h-8 md:w-10 md:h-10 text-violet-500" />
                        <h1 className="text-3xl md:text-4xl font-black bg-gradient-to-r from-violet-500 to-blue-500 bg-clip-text text-transparent tracking-tighter">
                            FORECASTER
                        </h1>
                    </div>
                    <p className="text-zinc-500 dark:text-zinc-400 text-xs md:text-sm font-medium uppercase tracking-widest">
                        NOAA-weighted storage prediction engine with simple and advanced regression modes
                    </p>
                </div>

                {error && (
                    <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 text-red-400" />
                        <span className="text-red-400">{error}</span>
                    </div>
                )}

                <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
                    <div className="text-xs uppercase tracking-wider font-black text-zinc-500 dark:text-zinc-400">
                        Model Selection
                    </div>
                    <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-1">
                        <button
                            onClick={() => setModelMode('simple')}
                            className={`px-3 py-1.5 rounded text-xs font-black uppercase tracking-wider transition-all ${modelMode === 'simple'
                                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                                : 'text-zinc-500'
                                }`}
                        >
                            Simple Model
                        </button>
                        <button
                            onClick={() => setModelMode('advanced')}
                            className={`px-3 py-1.5 rounded text-xs font-black uppercase tracking-wider transition-all ${modelMode === 'advanced'
                                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                                : 'text-zinc-500'
                                }`}
                        >
                            Advanced Model
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-4">
                    <StoragePredictor
                        title="Current Week Prediction"
                        weatherData={weatherData}
                        historicalStorageData={storageData?.historicalData}
                        model={modelMode}
                        weekOffset={0}
                        henryHubPrice={priceData?.current || 3}
                        currentStorageBcf={storageData?.current || 2500}
                        isLoading={isPredictorLoading}
                        onPredictionComputed={handleCurrentSnapshot}
                    />
                    <StoragePredictor
                        title="Next Week Prediction"
                        weatherData={weatherData}
                        historicalStorageData={storageData?.historicalData}
                        model={modelMode}
                        weekOffset={1}
                        henryHubPrice={priceData?.current || 3}
                        currentStorageBcf={storageData?.current || 2500}
                        isLoading={isPredictorLoading}
                        onPredictionComputed={handleNextSnapshot}
                    />
                </div>

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

                <div className="mb-8 text-[11px] uppercase tracking-wider font-bold text-amber-600 dark:text-amber-400 border border-amber-500/30 bg-amber-500/10 rounded-lg px-3 py-2">
                    Predictions based on statistical models. Actual results may vary.
                </div>

                <div className="grid grid-cols-1 gap-6">
                    <WeatherWidget data={weatherData} isLoading={isLoadingWeather} />
                </div>

                {nextWeekSnapshot && (
                    <div className="mt-4 text-[11px] text-zinc-500 dark:text-zinc-400">
                        Next-week window tracked: {formatDate(nextWeekSnapshot.weekStart)} to {formatDate(nextWeekSnapshot.weekEnd)} | EIA monitor date {formatDate(nextWeekSnapshot.eiaReportDate)}
                    </div>
                )}
            </div>
        </div>
    );
}
