'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Activity, Factory, Gauge, Ship, TrendingUp } from 'lucide-react';
import type { McxPublicDataResponse } from '@/lib/types/mcx';

interface ProTraderMonitorProps {
    data: McxPublicDataResponse;
}

interface StorageStats {
    deviation: number;
    deviationPercent: string;
}

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

function formatSigned(value: number, digits: number = 2) {
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(digits)}`;
}

function computeIvRankFromHistory(historical: McxPublicDataResponse['historical']) {
    const closes = historical
        .slice()
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .map((row) => row.close)
        .filter((v) => Number.isFinite(v) && v > 0);

    if (closes.length < 90) {
        return { current: null as number | null, rank: null as number | null };
    }

    const returns: number[] = [];
    for (let i = 1; i < closes.length; i++) {
        returns.push(Math.log(closes[i] / closes[i - 1]));
    }

    const rollingIv: number[] = [];
    for (let i = 29; i < returns.length; i++) {
        const window = returns.slice(i - 29, i + 1);
        const mean = window.reduce((sum, v) => sum + v, 0) / window.length;
        const variance = window.reduce((sum, v) => sum + (v - mean) ** 2, 0) / window.length;
        const std = Math.sqrt(variance);
        rollingIv.push(std * Math.sqrt(252) * 100);
    }

    if (!rollingIv.length) {
        return { current: null, rank: null };
    }

    const trailingYear = rollingIv.slice(-252);
    const minIv = Math.min(...trailingYear);
    const maxIv = Math.max(...trailingYear);
    const current = rollingIv[rollingIv.length - 1];

    if (!Number.isFinite(current) || !Number.isFinite(minIv) || !Number.isFinite(maxIv) || maxIv <= minIv) {
        return { current: null, rank: null };
    }

    const rank = ((current - minIv) / (maxIv - minIv)) * 100;
    return { current, rank: clamp(rank, 0, 100) };
}

export default function MCXProTraderMonitorPanel({ data }: ProTraderMonitorProps) {
    const [storageStats, setStorageStats] = useState<StorageStats | null>(null);

    useEffect(() => {
        let active = true;

        const fetchStorage = async () => {
            try {
                const res = await fetch('/api/eia/storage', { cache: 'no-store' });
                const json = await res.json();
                if (!res.ok || json?.error) return;
                if (active) {
                    setStorageStats({
                        deviation: Number(json.deviation || 0),
                        deviationPercent: String(json.deviationPercent || '0')
                    });
                }
            } catch {
                // Ignore; panel remains partially populated.
            }
        };

        fetchStorage();
        const timer = setInterval(fetchStorage, 10 * 60 * 1000);

        return () => {
            active = false;
            clearInterval(timer);
        };
    }, []);

    const metrics = useMemo(() => {
        const latestHenryHub = data.eiaHenryHub[data.eiaHenryHub.length - 1]?.value || 0;
        const parityInr = latestHenryHub * data.usdinr;
        const basisSpread = data.activeMonth.price - parityInr;
        const basisPct = parityInr > 0 ? (basisSpread / parityInr) * 100 : 0;

        const oiChange = data.latestSettlement.oiChange;
        const oiDirection = oiChange > 0 ? 'Rising OI' : oiChange < 0 ? 'Falling OI' : 'Flat OI';

        const iv = computeIvRankFromHistory(data.historical);

        // Free daily LNG flow and supply-demand endpoints are not stable for anonymous
        // access. Until a stable source is wired, use transparent proxy estimates.
        const lngExportProxy = clamp(13.2 + (latestHenryHub - 3) * 0.35, 11.5, 15.5);
        const month = new Date().getMonth() + 1;
        const seasonalDemand = month >= 11 || month <= 3 ? 101 : month >= 6 && month <= 8 ? 94 : 97;
        const supplyProxy = 103.5;
        const supplyDemandSpread = supplyProxy - seasonalDemand;

        return {
            basisSpread,
            basisPct,
            lngExportProxy,
            supplyDemandSpread,
            oiChange,
            oiDirection,
            ivRank: iv.rank,
            ivCurrent: iv.current
        };
    }, [data]);

    return (
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/70">
                <h3 className="text-lg font-black text-zinc-100 tracking-tight">Pro Trader Monitor</h3>
                <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold">MCX basis, storage, flows, balance, OI and IV regime</p>
            </div>

            <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                <MetricCard
                    icon={<Activity className="w-4 h-4 text-cyan-400" />}
                    label="Henry Hub Basis Spread"
                    value={`INR ${formatSigned(metrics.basisSpread, 2)}`}
                    meta={`Spot vs M1: ${formatSigned(metrics.basisPct, 2)}%`}
                    tone={metrics.basisSpread >= 0 ? 'bull' : 'bear'}
                />

                <MetricCard
                    icon={<TrendingUp className="w-4 h-4 text-emerald-400" />}
                    label="Storage Deficit/Surplus vs 5Y"
                    value={storageStats ? `${formatSigned(storageStats.deviation, 0)} Bcf` : 'Loading...'}
                    meta={storageStats ? `${storageStats.deviationPercent}% deviation` : 'Waiting for EIA storage'}
                    tone={storageStats && storageStats.deviation < 0 ? 'bear' : 'bull'}
                />

                <MetricCard
                    icon={<Ship className="w-4 h-4 text-blue-400" />}
                    label="LNG Export Flows"
                    value={`${metrics.lngExportProxy.toFixed(2)} Bcf/d`}
                    meta="Proxy estimate (free-feed fallback)"
                    tone="neutral"
                />

                <MetricCard
                    icon={<Factory className="w-4 h-4 text-amber-400" />}
                    label="Production vs Demand"
                    value={`${formatSigned(metrics.supplyDemandSpread, 2)} Bcf/d`}
                    meta="Supply-demand spread proxy"
                    tone={metrics.supplyDemandSpread >= 0 ? 'bull' : 'bear'}
                />

                <MetricCard
                    icon={<Activity className="w-4 h-4 text-fuchsia-400" />}
                    label="Open Interest Change"
                    value={`${metrics.oiChange >= 0 ? '+' : ''}${metrics.oiChange.toLocaleString()}`}
                    meta={metrics.oiDirection}
                    tone={metrics.oiChange >= 0 ? 'bull' : 'bear'}
                />

                <MetricCard
                    icon={<Gauge className="w-4 h-4 text-violet-400" />}
                    label="Implied Volatility Rank"
                    value={metrics.ivRank != null ? `${metrics.ivRank.toFixed(1)}%` : 'N/A'}
                    meta={metrics.ivCurrent != null ? `30D IV ${metrics.ivCurrent.toFixed(2)}% vs 1Y range` : 'Needs >= 90 trading days'}
                    tone="neutral"
                />
            </div>
        </div>
    );
}

function MetricCard({
    icon,
    label,
    value,
    meta,
    tone
}: {
    icon: ReactNode;
    label: string;
    value: string;
    meta: string;
    tone: 'bull' | 'bear' | 'neutral';
}) {
    const toneClass = tone === 'bull'
        ? 'border-emerald-500/30 bg-emerald-500/10'
        : tone === 'bear'
            ? 'border-red-500/30 bg-red-500/10'
            : 'border-zinc-700 bg-zinc-900/60';

    return (
        <div className={`rounded-lg border p-3 ${toneClass}`}>
            <div className="flex items-center gap-2 mb-1">
                {icon}
                <p className="text-[10px] uppercase tracking-wider font-black text-zinc-400">{label}</p>
            </div>
            <p className="text-xl font-black text-zinc-100 tracking-tight">{value}</p>
            <p className="text-[11px] text-zinc-400 mt-1">{meta}</p>
        </div>
    );
}
