'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import StorageWidget from '@/components/widgets/StorageWidget';
import WeatherWidget from '@/components/widgets/WeatherWidget';
import WeatherMap from '@/components/widgets/WeatherMap';
import StorageTrendChart from '@/components/charts/StorageTrendChart';
import Navbar from '@/components/layout/Navbar';
import TechnicalChartWidget from '@/components/widgets/TechnicalChartWidget';
import AlertsWidget from '@/components/widgets/AlertsWidget';
import MarketOverviewWidget from '@/components/widgets/MarketOverviewWidget';
import StoragePredictor from '@/components/widgets/StoragePredictor';
import { Activity, AlertCircle } from 'lucide-react';

interface StorageData {
    current: number;
    weekEndingDate: string;
    releaseDate: string;
    change?: number;
    nextReleaseDate?: string;
    forecastChange?: number;
    yearAgo: number;
    fiveYearAvg: number;
    deviation: number;
    deviationPercent: string;
    historicalData: any[];
}

interface PriceData {
    current: number;
    date: string;
    change: number;
    changePercent: string;
    historicalPrices?: { period: string; value: number }[];
}

interface WeatherData {
    region: string;
    todayHDD: number;
    todayCDD: number;
    total7DayHDD: number;
    total7DayCDD: number;
    error?: boolean;
    forecast: { day: string; date: string; hdd: number; cdd: number; temp: number }[];
}

type ModelMode = 'simple' | 'advanced';

function getNyClock(now: Date = new Date()) {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    const parts = formatter.formatToParts(now);
    const weekday = parts.find((p) => p.type === 'weekday')?.value || '';
    const hour = Number(parts.find((p) => p.type === 'hour')?.value || '0');
    const minute = Number(parts.find((p) => p.type === 'minute')?.value || '0');
    return { weekday, hour, minute };
}

function isEiaReleaseWindow(now: Date = new Date()) {
    const ny = getNyClock(now);
    if (ny.weekday !== 'Thu') return false;
    const totalMinutes = ny.hour * 60 + ny.minute;
    return totalMinutes >= 9 * 60 && totalMinutes < 11 * 60;
}

export default function DashboardPage() {
    const [storageData, setStorageData] = useState<StorageData | null>(null);
    const [priceData, setPriceData] = useState<PriceData | null>(null);
    const [weatherData, setWeatherData] = useState<WeatherData[]>([]);

    const [isLoadingStorage, setIsLoadingStorage] = useState(true);
    const [isLoadingPrice, setIsLoadingPrice] = useState(true);
    const [isLoadingWeather, setIsLoadingWeather] = useState(true);

    const [error, setError] = useState<string | null>(null);
    const [predictorModel, setPredictorModel] = useState<ModelMode>('simple');
    const [storageLastFetchedAt, setStorageLastFetchedAt] = useState<string | null>(null);
    const [storageLiveUpdating, setStorageLiveUpdating] = useState<boolean>(false);
    const latestStoragePeriodRef = useRef<string | null>(null);
    const hasStorageLoadedRef = useRef(false);

    const fetchStorageData = useCallback(async () => {
        try {
            if (!hasStorageLoadedRef.current) {
                setIsLoadingStorage(true);
            }
            const res = await fetch('/api/eia/storage', { cache: 'no-store' });
            const data = await res.json();
            if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);

            const nextPeriod = String(data.weekEndingDate || '');
            const prevPeriod = latestStoragePeriodRef.current;
            const periodChanged = prevPeriod !== null && nextPeriod !== prevPeriod;

            latestStoragePeriodRef.current = nextPeriod;
            setStorageData(data);
            setStorageLastFetchedAt(new Date().toISOString());
            hasStorageLoadedRef.current = true;

            if (periodChanged) {
                setError(null);
            }
        } catch (err) {
            console.error('Storage fetch error:', err);
            setError('Failed to load storage data');
        } finally {
            setIsLoadingStorage(false);
        }
    }, []);

    useEffect(() => {
        const fetchPriceData = () => {
            setIsLoadingPrice(true);
            fetch('/api/market/prices?range=5y')
                .then(res => res.json())
                .then(data => {
                    if (data.error) throw new Error(data.error);
                    setPriceData(data);
                })
                .catch(err => {
                    console.error('Price fetch error:', err);
                })
                .finally(() => setIsLoadingPrice(false));
        };

        const fetchWeatherData = () => {
            setIsLoadingWeather(true);
            fetch('/api/weather/hdd-cdd')
                .then(res => res.json())
                .then(data => {
                    if (data.error) throw new Error(data.error);
                    setWeatherData(data);
                })
                .catch(err => {
                    console.error('Weather fetch error:', err);
                })
                .finally(() => setIsLoadingWeather(false));
        };

        fetchStorageData();
        fetchPriceData();
        fetchWeatherData();

        const weatherRefresh = setInterval(fetchWeatherData, 24 * 60 * 60 * 1000);
        const storageBaselineRefresh = setInterval(fetchStorageData, 60 * 60 * 1000);
        const releaseWindowTicker = setInterval(() => {
            const inWindow = isEiaReleaseWindow();
            setStorageLiveUpdating(inWindow);
            if (inWindow) {
                fetchStorageData();
            }
        }, 5 * 60 * 1000);
        const releaseWindowState = setInterval(() => {
            setStorageLiveUpdating(isEiaReleaseWindow());
        }, 60 * 1000);

        setStorageLiveUpdating(isEiaReleaseWindow());

        return () => {
            clearInterval(weatherRefresh);
            clearInterval(storageBaselineRefresh);
            clearInterval(releaseWindowTicker);
            clearInterval(releaseWindowState);
        };
    }, [fetchStorageData]);

    return (
        <div className="min-h-screen bg-white dark:bg-zinc-950 transition-colors duration-300">
            <Navbar />

            <div className="p-4 md:p-8 max-w-[1600px] mx-auto min-w-0">
                {/* Header */}
                <div className="mb-6 md:mb-8 text-center md:text-left">
                    <div className="flex flex-col md:flex-row items-center gap-3 mb-2 md:mb-1">
                        <Activity className="w-8 h-8 md:w-10 md:h-10 text-emerald-500" />
                        <h1 className="text-3xl md:text-4xl font-black bg-gradient-to-r from-emerald-500 to-cyan-500 bg-clip-text text-transparent tracking-tighter">
                            DASHBOARD
                        </h1>
                    </div>
                    <p className="text-zinc-500 dark:text-zinc-400 text-xs md:text-sm font-medium uppercase tracking-widest">
                        Professional Terminal • EIA & NOAA Intelligence • Real-Time Flow
                    </p>
                </div>

                {/* Error Alert */}
                {error && (
                    <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 text-red-400" />
                        <span className="text-red-400">{error}</span>
                    </div>
                )}

                {/* Top Intelligence Row - Storage, Market & Alerts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 mb-8">
                    <StorageWidget
                        current={storageData?.current || 0}
                        change={storageData?.change}
                        nextReleaseDate={storageData?.nextReleaseDate}
                        forecastChange={storageData?.forecastChange}
                        yearAgo={storageData?.yearAgo || 0}
                        fiveYearAvg={storageData?.fiveYearAvg || 0}
                        deviation={storageData?.deviation || 0}
                        deviationPercent={storageData?.deviationPercent || '0'}
                        weekEndingDate={storageData?.weekEndingDate || new Date().toISOString()}
                        releaseDate={storageData?.releaseDate || new Date().toISOString()}
                        isLiveUpdating={storageLiveUpdating}
                        lastFetchedAt={storageLastFetchedAt || undefined}
                        isLoading={isLoadingStorage}
                    />

                    <MarketOverviewWidget
                        data={priceData}
                        isLoading={isLoadingPrice}
                    />

                    <div id="alerts">
                        <AlertsWidget
                            storageData={storageData}
                            priceData={priceData}
                            weatherData={weatherData}
                        />
                    </div>
                </div>

                {/* Storage Forecaster Section */}
                <div className="mb-8">
                    <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                        <div>
                            <h3 className="text-sm md:text-base font-black text-zinc-900 dark:text-zinc-100 tracking-tight uppercase">
                                Storage Forecaster
                            </h3>
                            <p className="text-[10px] uppercase tracking-widest text-zinc-500 dark:text-zinc-400 font-bold">
                                Below Storage Data | Current Week vs Next Week
                            </p>
                        </div>
                        <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-1">
                            <button
                                onClick={() => setPredictorModel('simple')}
                                className={`px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-wider transition-all ${predictorModel === 'simple'
                                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                                    : 'text-zinc-500'
                                    }`}
                            >
                                Simple Model
                            </button>
                            <button
                                onClick={() => setPredictorModel('advanced')}
                                className={`px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-wider transition-all ${predictorModel === 'advanced'
                                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                                    : 'text-zinc-500'
                                    }`}
                            >
                                Advanced Model
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        <StoragePredictor
                            title="Current Week Prediction"
                            weatherData={weatherData}
                            historicalStorageData={storageData?.historicalData}
                            model={predictorModel}
                            weekOffset={0}
                            henryHubPrice={priceData?.current || 3}
                            currentStorageBcf={storageData?.current || 2500}
                            isLoading={isLoadingStorage || isLoadingWeather || isLoadingPrice}
                        />
                        <StoragePredictor
                            title="Next Week Prediction"
                            weatherData={weatherData}
                            historicalStorageData={storageData?.historicalData}
                            model={predictorModel}
                            weekOffset={1}
                            henryHubPrice={priceData?.current || 3}
                            currentStorageBcf={storageData?.current || 2500}
                            isLoading={isLoadingStorage || isLoadingWeather || isLoadingPrice}
                        />
                    </div>

                    <div className="mt-3 text-[10px] uppercase tracking-wider font-bold text-amber-600 dark:text-amber-400 border border-amber-500/30 bg-amber-500/10 rounded-lg px-3 py-2">
                        Predictions based on statistical models. Actual results may vary.
                    </div>
                </div>

                {/* Main Analysis Row - Technical Terminal & Storage History */}
                <div id="charts" className="flex flex-col gap-8 mb-8">
                    <div className="w-full min-w-0">
                        <TechnicalChartWidget
                            data={priceData?.historicalPrices || []}
                            isLoading={isLoadingPrice}
                        />
                    </div>
                    <div className="w-full min-w-0">
                        <StorageTrendChart
                            data={storageData?.historicalData || []}
                            priceData={priceData?.historicalPrices || []}
                            isLoading={isLoadingStorage}
                        />
                    </div>
                </div>

                {/* Weather Module */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                    <WeatherWidget
                        data={weatherData}
                        isLoading={isLoadingWeather}
                    />
                    <WeatherMap />
                </div>

            </div>
        </div>
    );
}
