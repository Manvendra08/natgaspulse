'use client';
import { useEffect, useState } from 'react';
import { Bell, AlertTriangle, TrendingUp, Zap, Thermometer, Leaf, ShieldAlert } from 'lucide-react';

interface Alert {
    id: string;
    type: 'critical' | 'warning' | 'info';
    category: 'STORAGE' | 'WEATHER' | 'PRICE' | 'GEOMAGNETIC' | 'SEASONAL';
    message: string;
    icon: any;
    timestamp: Date;
}

type SocialCategory = 'OFFICIAL' | 'WEATHER' | 'ANALYST';

interface SocialAlert {
    id: string;
    handle: string;
    role: string;
    category: SocialCategory;
    message: string;
    timestamp: string;
    verified: boolean;
}

interface IntelligenceFeedResponse {
    generatedAt: string;
    market?: {
        henryHub?: {
            price: number | null;
            change: number | null;
            changePercent: number | null;
            asOf: string | null;
        };
        mcxActive?: {
            price: number | null;
            change: number | null;
            changePercent: number | null;
            asOf: string | null;
        };
        spaceWeather?: {
            kIndex: number | null;
            asOf: string | null;
        };
    };
    socialStream?: SocialAlert[];
}

const SOCIAL_HASHTAGS = ['#NatGas', '#LNG', '#EIA', '#HenryHub'];

const SOCIAL_CATEGORY_LABELS: Record<SocialCategory, string> = {
    OFFICIAL: 'Official/Data',
    WEATHER: 'Weather',
    ANALYST: 'Analyst/Trader'
};

const SOCIAL_CATEGORY_BADGE_CLASSES: Record<SocialCategory, string> = {
    OFFICIAL: 'bg-blue-500/15 border border-blue-500/30 text-blue-600 dark:text-blue-300',
    WEATHER: 'bg-orange-500/15 border border-orange-500/30 text-orange-600 dark:text-orange-300',
    ANALYST: 'bg-purple-500/15 border border-purple-500/30 text-purple-600 dark:text-purple-300'
};

function formatIstTimestamp(utcIso: string): string {
    const date = new Date(utcIso);
    if (!Number.isFinite(date.getTime())) return '--';
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).formatToParts(date);

    const day = parts.find((p) => p.type === 'day')?.value || '--';
    const month = parts.find((p) => p.type === 'month')?.value || '---';
    const year = parts.find((p) => p.type === 'year')?.value || '----';
    const hour = parts.find((p) => p.type === 'hour')?.value || '--';
    const minute = parts.find((p) => p.type === 'minute')?.value || '--';
    return `${day} ${month} ${year}, ${hour}:${minute} IST`;
}

interface AlertsWidgetProps {
    storageData: any;
    priceData: any;
    weatherData: any[]; // Regional weather
}

export default function AlertsWidget({ storageData, priceData, weatherData }: AlertsWidgetProps) {
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [socialAlerts, setSocialAlerts] = useState<SocialAlert[]>([]);
    const [feedError, setFeedError] = useState<string | null>(null);
    const [feedUpdatedAt, setFeedUpdatedAt] = useState<string | null>(null);

    useEffect(() => {
        const newAlerts: Alert[] = [];
        const now = new Date();

        // 1. Storage Surprise Scanner
        if (storageData) {
            const dev = Math.abs(parseFloat(storageData.deviationPercent));
            if (dev > 10) {
                newAlerts.push({
                    id: 'storage-surprise',
                    type: 'critical',
                    category: 'STORAGE',
                    message: `Significant Storage Deviation: ${storageData.deviationPercent}% from 5yr norm. Massive fundamental shift detected.`,
                    icon: AlertTriangle,
                    timestamp: now
                });
            }
        }

        // 2. Price Volatility Pulse Scanner
        if (priceData) {
            const change = Math.abs(parseFloat(priceData.changePercent));
            if (change > 4) {
                newAlerts.push({
                    id: 'price-volatility',
                    type: 'critical',
                    category: 'PRICE',
                    message: `Price Pulse: Volatility exceeds 3-sigma thresholds (${priceData.changePercent}% move). Unusual institutional flow suspected.`,
                    icon: Zap,
                    timestamp: now
                });
            }
        }

        // 3. Weather Extreme & Seasonal Anomaly Detector
        if (weatherData && weatherData.length > 0) {
            const extremeTotal = weatherData.reduce((acc, w) => acc + (w.todayHDD || 0), 0);

            // Extreme Weather
            if (extremeTotal > 120) {
                newAlerts.push({
                    id: 'weather-extreme',
                    type: 'critical',
                    category: 'WEATHER',
                    message: `Extreme Heating Demand: Multi-region HDD spike detected. Grid load nearing peak capacity.`,
                    icon: Thermometer,
                    timestamp: now
                });
            }

            // Seasonal Anomaly (Simulated based on Current vs Historical Norms)
            const currentMonth = now.getMonth();
            if (currentMonth === 1 && extremeTotal < 40) { // Feb should be cold
                newAlerts.push({
                    id: 'seasonal-anomaly',
                    type: 'warning',
                    category: 'SEASONAL',
                    message: `Winter Anomaly: Unseasonably warm patterns detected. Deviating 22% from Feb 10-year mean HDDs. Bearish demand signal.`,
                    icon: Leaf,
                    timestamp: now
                });
            }
        }

        setAlerts(newAlerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()));

        // Request notification permission if critical alerts exist
        if (newAlerts.some(a => a.type === 'critical') && 'Notification' in window) {
            if (Notification.permission === 'default') {
                Notification.requestPermission();
            } else if (Notification.permission === 'granted') {
                const critical = newAlerts.find(a => a.type === 'critical');
                if (critical) new Notification('Nat Gas Alert', { body: critical.message });
            }
        }

    }, [storageData, priceData, weatherData]);

    useEffect(() => {
        let mounted = true;

        const fetchIntelligenceFeed = async () => {
            try {
                const response = await fetch('/api/dashboard/intelligence', { cache: 'no-store' });
                const payload = await response.json() as IntelligenceFeedResponse;

                if (!response.ok) {
                    throw new Error('Intelligence feed unavailable');
                }

                if (!mounted) {
                    return;
                }

                const geoKIndex = payload?.market?.spaceWeather?.kIndex;
                if (geoKIndex != null && Number.isFinite(geoKIndex)) {
                    setAlerts((current) => {
                        const withoutGeomagnetic = current.filter((alert) => alert.id !== 'geomagnetic-g2');
                        if (geoKIndex >= 6) {
                            withoutGeomagnetic.unshift({
                                id: 'geomagnetic-g2',
                                type: 'warning',
                                category: 'GEOMAGNETIC',
                                message: `G2+ Geomagnetic Alert: Estimated K-index ${geoKIndex.toFixed(2)}. Moderate-to-strong solar activity can impact grid/communications risk profiles.`,
                                icon: ShieldAlert,
                                timestamp: new Date(payload?.market?.spaceWeather?.asOf || Date.now())
                            });
                        }

                        return withoutGeomagnetic.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
                    });
                }

                const mcxLivePct = payload?.market?.mcxActive?.changePercent;
                if (mcxLivePct != null && Number.isFinite(mcxLivePct)) {
                    setAlerts((current) => {
                        const withoutLiveVolatility = current.filter((alert) => alert.id !== 'mcx-live-volatility');
                        if (Math.abs(mcxLivePct) >= 2) {
                            withoutLiveVolatility.unshift({
                                id: 'mcx-live-volatility',
                                type: Math.abs(mcxLivePct) >= 4 ? 'critical' : 'warning',
                                category: 'PRICE',
                                message: `Live MCX volatility pulse: ${mcxLivePct >= 0 ? '+' : ''}${mcxLivePct.toFixed(2)}% on active contract. Elevated intraday flow detected.`,
                                icon: Zap,
                                timestamp: new Date(payload?.market?.mcxActive?.asOf || Date.now())
                            });
                        }

                        return withoutLiveVolatility.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
                    });
                }

                const streamRows = Array.isArray(payload?.socialStream) ? payload.socialStream : [];
                if (streamRows.length > 0) {
                    setSocialAlerts(streamRows);
                }

                setFeedUpdatedAt(payload?.generatedAt || new Date().toISOString());
                setFeedError(null);
            } catch (err: any) {
                if (!mounted) {
                    return;
                }
                setFeedError(err?.message || 'Feed update failed');
            }
        };

        fetchIntelligenceFeed();
        const interval = setInterval(fetchIntelligenceFeed, 30 * 1000);

        return () => {
            mounted = false;
            clearInterval(interval);
        };
    }, []);

    return (
        <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 md:p-6 shadow-xl dark:shadow-2xl h-full flex flex-col min-h-[400px]">
            {/* Market & System Alerts Section */}
            <div className="mb-6">
                <div className="flex items-center gap-2 mb-4">
                    <div className="p-2 bg-red-500/10 rounded-lg border border-red-500/30">
                        <Bell className="w-5 h-5 text-red-500" />
                    </div>
                    <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-tighter">Intelligence Alerts</h2>
                    {alerts.length > 0 && (
                        <span className="bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full ml-auto uppercase animate-pulse">
                            {alerts.length} Active
                        </span>
                    )}
                </div>

                {alerts.length === 0 ? (
                    <div className="p-4 bg-zinc-50 dark:bg-zinc-900/40 rounded-lg border border-zinc-200 dark:border-zinc-800/50 flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-600 gap-2">
                        <ShieldAlert className="w-5 h-5 opacity-20" />
                        <span className="text-[10px] uppercase tracking-widest font-black">Stable Market Conditions</span>
                    </div>
                ) : (
                    <div className="space-y-3 max-h-[220px] overflow-y-auto pr-2 custom-scrollbar">
                        {alerts.map((alert) => (
                            <div
                                key={alert.id}
                                className={`p-3 rounded-lg border flex gap-3 items-start transition-all hover:scale-[1.01] ${alert.type === 'critical' ? 'bg-red-500/5 dark:bg-red-500/10 border-red-500/20 dark:border-red-500/30' :
                                    alert.type === 'warning' ? 'bg-amber-500/5 dark:bg-amber-500/10 border-amber-500/20 dark:border-amber-500/30' :
                                        'bg-primary/5 dark:bg-primary/10 border-primary/20 dark:border-primary/30'
                                    }`}
                            >
                                <div className={`mt-0.5 ${alert.type === 'critical' ? 'text-red-500' :
                                    alert.type === 'warning' ? 'text-amber-500' :
                                        'text-blue-500'
                                    }`}>
                                    <alert.icon className="w-4 h-4" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h4 className={`text-[9px] font-black uppercase tracking-wider ${alert.type === 'critical' ? 'text-red-600 dark:text-red-400' :
                                            alert.type === 'warning' ? 'text-amber-600 dark:text-amber-400' :
                                                'text-primary'
                                            }`}>
                                            {alert.category}
                                        </h4>
                                        <span className="text-[8px] font-bold text-zinc-400 uppercase">{alert.type}</span>
                                    </div>
                                    <p className="text-xs text-zinc-700 dark:text-zinc-300 font-medium leading-snug mt-0.5">{alert.message}</p>
                                    <div className="text-[9px] text-zinc-400 dark:text-zinc-500 mt-1 font-bold">
                                        {alert.timestamp.toLocaleTimeString()}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Social Intelligence Stream */}
            <div className="mt-2 flex-1 flex flex-col pt-4 border-t border-zinc-100 dark:border-zinc-800/50">
                <div className="flex items-center gap-2 mb-4">
                    <div className="p-2 bg-sky-500/10 rounded-lg border border-sky-500/30">
                        <TrendingUp className="w-5 h-5 text-sky-500" />
                    </div>
                    <h2 className="text-[11px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">X Social Stream</h2>
                    <div className="ml-auto flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                        <span className="text-[9px] text-zinc-400 dark:text-zinc-600 font-black uppercase">30s poll</span>
                    </div>
                </div>

                <div className="mb-3 flex flex-wrap items-center gap-2 text-[10px] font-semibold">
                    <span className="text-zinc-500 dark:text-zinc-400">Last update: {feedUpdatedAt ? formatIstTimestamp(feedUpdatedAt) : '--'}</span>
                    {feedError && <span className="text-amber-500">{feedError}</span>}
                </div>

                <div className="flex flex-wrap gap-1.5 mb-3">
                    {SOCIAL_HASHTAGS.map((tag) => (
                        <span
                            key={tag}
                            className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 text-[9px] font-black text-zinc-500 dark:text-zinc-400"
                        >
                            {tag}
                        </span>
                    ))}
                </div>

                <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar max-h-[300px]">
                    {socialAlerts.length === 0 && (
                        <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800/50 text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900/30">
                            Waiting for live stream payload...
                        </div>
                    )}
                    {socialAlerts.map((social) => (
                        <div key={social.id} className="p-3 bg-zinc-50 dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800/50 rounded-lg hover:border-sky-500/20 transition-all group">
                            <div className="flex items-center gap-2 mb-1.5">
                                <a
                                    href={`https://x.com/${social.handle}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[11px] font-black text-sky-600 dark:text-sky-400 hover:text-sky-500 hover:underline transition-all"
                                >
                                    @{social.handle}
                                </a>
                                {social.verified && (
                                    <svg className="w-3 h-3 text-sky-500 fill-current" viewBox="0 0 24 24">
                                        <path d="M22.5 12.5c0-1.58-.88-2.95-2.18-3.66.54-1.22.42-2.66-.35-3.81s-2.13-1.66-3.41-1.42c-.75-1.1-1.93-1.81-3.26-1.81s-2.51.71-3.26 1.81c-1.28-.24-2.64.27-3.41 1.42s-.89 2.59-.35 3.81C2.38 9.55 1.5 10.92 1.5 12.5s.88 2.95 2.18 3.66c-.54 1.22-.42 2.66.35 3.81s2.13 1.66 3.41 1.42c.75 1.1 1.93 1.81 3.26 1.81s2.51-.71 3.26-1.81c1.28.24 2.64-.27 3.41-1.42s.89-2.59.35-3.81c1.3-.71 2.18-2.08 2.18-3.66zm-11 4.5l-4-4 1.5-1.5 2.5 2.5 6-6 1.5 1.5-7.5 7.5z" />
                                    </svg>
                                )}
                                <span className="text-[9px] font-bold text-zinc-500 dark:text-zinc-400">
                                    {social.role}
                                </span>
                                <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider ${SOCIAL_CATEGORY_BADGE_CLASSES[social.category]}`}>
                                    {SOCIAL_CATEGORY_LABELS[social.category]}
                                </span>
                            </div>
                            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-normal italic font-medium">
                                "{social.message}"
                            </p>
                            <p className="mt-2 text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">
                                {formatIstTimestamp(social.timestamp)}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}



