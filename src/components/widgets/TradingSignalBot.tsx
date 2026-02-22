'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Activity,
    BarChart3,
    Clock,
    Layers,
    RefreshCw,
    Shield,
    Signal,
    TrendingDown,
    TrendingUp,
    Target,
    Newspaper,
    MessagesSquare,
    Minus
} from 'lucide-react';
import type {
    SignalBotResponse,
    TimeframeSignal,
    SignalDirection,
    Confidence,
    FuturesSetup,
    OptionStrike,
    Timeframe
} from '@/lib/types/signals';

const REFRESH_INTERVAL = 5 * 60 * 1000;

function signalTextClass(signal: SignalDirection) {
    if (signal === 'BUY') return 'text-emerald-300';
    if (signal === 'SELL') return 'text-red-300';
    return 'text-zinc-300';
}

function signalBorderClass(signal: SignalDirection) {
    if (signal === 'BUY') return 'border-emerald-500/40 bg-emerald-500/10';
    if (signal === 'SELL') return 'border-red-500/40 bg-red-500/10';
    return 'border-zinc-700 bg-zinc-900/70';
}

function confidenceTextClass(value: Confidence) {
    if (value === 'HIGH') return 'text-emerald-300';
    if (value === 'MEDIUM') return 'text-amber-300';
    return 'text-zinc-400';
}

function formatPrice(value: number) {
    return value < 10 ? value.toFixed(4) : value.toFixed(2);
}

function formatCompact(value?: number) {
    if (!Number.isFinite(value as number)) return '--';
    return Number(value).toLocaleString();
}

function HoldIcon() {
    return <Minus className="w-4 h-4 text-zinc-400" />;
}

function DirectionIcon({ direction }: { direction: SignalDirection }) {
    if (direction === 'BUY') return <TrendingUp className="w-4 h-4 text-emerald-300" />;
    if (direction === 'SELL') return <TrendingDown className="w-4 h-4 text-red-300" />;
    return <HoldIcon />;
}

function computeIvRank(chain: OptionStrike[] | undefined) {
    if (!chain || chain.length < 3) return null;

    const ivValues = chain
        .flatMap((row) => [row.ce?.iv ?? null, row.pe?.iv ?? null])
        .filter((v): v is number => Number.isFinite(v) && v > 0);

    if (ivValues.length < 3) return null;

    const min = Math.min(...ivValues);
    const max = Math.max(...ivValues);
    const current = ivValues[Math.floor(ivValues.length / 2)] ?? ivValues[0];
    if (!Number.isFinite(current) || max <= min) return null;

    const rank = ((current - min) / (max - min)) * 100;
    return Math.max(0, Math.min(100, rank));
}

export default function TradingSignalBot() {
    const [data, setData] = useState<SignalBotResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [countdown, setCountdown] = useState(REFRESH_INTERVAL / 1000);
    const [activeTf, setActiveTf] = useState<Timeframe>('1D');

    const refreshRef = useRef<NodeJS.Timeout | null>(null);
    const tickRef = useRef<NodeJS.Timeout | null>(null);

    const fetchSignals = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await fetch(`/api/signals?t=${Date.now()}`, { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json: SignalBotResponse = await res.json();
            setData(json);
            setCountdown(REFRESH_INTERVAL / 1000);

            const available = (json.timeframes || []).map((tf) => tf.timeframe);
            if (!available.includes(activeTf)) {
                setActiveTf((available[0] || '1D') as Timeframe);
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to fetch signals';
            setError(msg);
        } finally {
            setLoading(false);
        }
    }, [activeTf]);

    useEffect(() => {
        fetchSignals();
        refreshRef.current = setInterval(fetchSignals, REFRESH_INTERVAL);
        tickRef.current = setInterval(() => {
            setCountdown((prev) => (prev > 0 ? prev - 1 : REFRESH_INTERVAL / 1000));
        }, 1000);

        return () => {
            if (refreshRef.current) clearInterval(refreshRef.current);
            if (tickRef.current) clearInterval(tickRef.current);
        };
    }, [fetchSignals]);

    const activeTfSignal = useMemo(() => {
        if (!data?.timeframes?.length) return null;
        return data.timeframes.find((tf) => tf.timeframe === activeTf) || data.timeframes[0];
    }, [data?.timeframes, activeTf]);

    const activeSetup = useMemo(() => {
        const all = data?.futuresSetups || (data?.futuresSetup ? [data.futuresSetup] : []);
        if (!all.length) return null;
        return all.find((item) => item.timeframe === activeTf) || all[0] || null;
    }, [data?.futuresSetups, data?.futuresSetup, activeTf]);

    const ivRank = useMemo(() => computeIvRank(data?.optionChainAnalysis?.chain), [data?.optionChainAnalysis?.chain]);

    const miniNews = useMemo(() => {
        if (!data) return [];
        return [
            `Overall signal ${data.overallSignal} (${data.overallConfidence}) with score ${data.overallScore}.`,
            `Market condition is ${data.marketCondition.toLowerCase()} with active contract ${data.activeContract || 'NATURALGAS'}.`,
            data.summary
        ];
    }, [data]);

    const sentimentFeed = useMemo(() => {
        if (!data?.timeframes) return [];
        return data.timeframes.map((tf) => `${tf.timeframe}: ${tf.bias} (${tf.priceChangePercent >= 0 ? '+' : ''}${tf.priceChangePercent.toFixed(2)}%)`);
    }, [data?.timeframes]);

    if (error && !data) {
        return (
            <div className="rounded-2xl border border-red-500/40 bg-zinc-950 p-6 text-red-300">
                <div className="text-sm font-bold">Signal fetch failed: {error}</div>
                <button
                    onClick={fetchSignals}
                    className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-bold uppercase tracking-wider"
                >
                    Retry
                </button>
            </div>
        );
    }

    const topSignal = data?.overallSignal || 'HOLD';

    return (
        <div className="space-y-4">
            <div className="sticky top-16 z-20 rounded-xl border border-zinc-800 bg-zinc-950/95 backdrop-blur px-4 py-3">
                <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                    <TopStat label="Price" value={data ? `INR ${formatPrice(data.currentPrice)}` : '--'} tone={topSignal} />
                    <TopStat label="% Change" value={data?.liveChangePercent != null ? `${data.liveChangePercent >= 0 ? '+' : ''}${data.liveChangePercent.toFixed(2)}%` : '--'} tone={data?.liveChangePercent != null ? (data.liveChangePercent >= 0 ? 'BUY' : 'SELL') : 'HOLD'} />
                    <TopStat label="OI" value={formatCompact(data?.marketStats?.openInterest)} tone="HOLD" />
                    <TopStat label="Volume" value={formatCompact(data?.marketStats?.volume)} tone="HOLD" />
                    <TopStat label="Bid / Ask" value={data?.marketStats?.bid != null && data?.marketStats?.ask != null ? `${formatPrice(data.marketStats.bid)} / ${formatPrice(data.marketStats.ask)}` : '--'} tone="HOLD" />
                    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-2">
                        <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-black">Refresh</div>
                        <div className="mt-1 flex items-center justify-between text-xs font-semibold text-zinc-300">
                            <span>{Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')}</span>
                            <button onClick={fetchSignals} className="inline-flex items-center gap-1 rounded border border-zinc-700 px-2 py-1 text-[10px]">
                                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                                Refresh
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {loading && !data ? (
                <div className="h-[420px] rounded-2xl border border-zinc-800 bg-zinc-950 animate-pulse" />
            ) : null}

            {data && (
                <>
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                            <div className="mb-3 flex items-center justify-between">
                                <h3 className="text-sm font-black uppercase tracking-wider text-zinc-200 inline-flex items-center gap-2">
                                    <Signal className="w-4 h-4 text-cyan-400" />
                                    Multi-Timeframe Grid
                                </h3>
                                <span className={`text-xs font-black ${confidenceTextClass(data.overallConfidence)}`}>Confidence {data.overallConfidence}</span>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                                {data.timeframes.map((tf) => (
                                    <button
                                        key={tf.timeframe}
                                        onClick={() => setActiveTf(tf.timeframe)}
                                        className={`rounded-lg border p-3 text-left transition ${signalBorderClass(tf.bias)} ${activeTf === tf.timeframe ? 'ring-2 ring-cyan-500/40' : ''}`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="inline-flex items-center rounded-full bg-cyan-500/20 border border-cyan-500/40 px-2.5 py-1 text-[18px] font-bold leading-none text-cyan-200">
                                                {tf.timeframe}
                                            </span>
                                            <DirectionIcon direction={tf.bias} />
                                        </div>
                                        <div className={`mt-2 text-sm font-black ${signalTextClass(tf.bias)}`}>{tf.bias}</div>
                                        <div className={`text-xs font-mono ${tf.priceChangePercent >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                                            {tf.priceChangePercent >= 0 ? '+' : ''}{tf.priceChangePercent.toFixed(2)}%
                                        </div>
                                        <div className="text-[10px] text-zinc-500">vs period open</div>
                                    </button>
                                ))}
                            </div>
                        </section>

                        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                            <div className="mb-3 flex items-center gap-2">
                                <Target className="w-4 h-4 text-amber-300" />
                                <h3 className="text-sm font-black uppercase tracking-wider text-zinc-200">Key Levels</h3>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                                <LevelCell label="S2" value={activeTfSignal?.indicators.pivotS2} />
                                <LevelCell label="S1" value={activeTfSignal?.indicators.pivotS1} />
                                <LevelCell label="Pivot" value={activeTfSignal?.indicators.pivotPoint} highlight />
                                <LevelCell label="R1" value={activeTfSignal?.indicators.pivotR1} />
                                <LevelCell label="R2" value={activeTfSignal?.indicators.pivotR2} />
                            </div>
                        </section>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                            <div className="mb-3 flex items-center gap-2">
                                <Target className="w-4 h-4 text-amber-300" />
                                <h3 className="text-sm font-black uppercase tracking-wider text-zinc-200">Futures Setup</h3>
                            </div>
                            <FuturesSetupCard setup={activeSetup} />
                        </section>

                        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                            <div className="mb-3 flex items-center gap-2">
                                <Layers className="w-4 h-4 text-fuchsia-300" />
                                <h3 className="text-sm font-black uppercase tracking-wider text-zinc-200">Options Advisor</h3>
                            </div>
                            <div className="grid grid-cols-2 gap-2 mb-3">
                                <MiniBox label="PCR" value={data.optionChainAnalysis ? data.optionChainAnalysis.pcr.toFixed(2) : '--'} />
                                <MiniBox label="IV Rank" value={ivRank != null ? `${ivRank.toFixed(1)}%` : '--'} />
                            </div>
                            <div className="space-y-2">
                                {data.optionsRecommendations.slice(0, 3).map((rec, idx) => (
                                    <div key={`${rec.optionType}-${rec.strikePrice}-${idx}`} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="text-xs font-black text-zinc-200">
                                                {rec.action} {rec.optionType} INR {formatPrice(rec.strikePrice)}
                                            </div>
                                            <span className={`text-[10px] font-black ${confidenceTextClass(rec.riskLevel)}`}>{rec.riskLevel}</span>
                                        </div>
                                        <p className="mt-1 text-xs text-zinc-400">{rec.rationale}</p>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>

                    <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                        <div className="mb-3 flex items-center gap-2">
                            <BarChart3 className="w-4 h-4 text-cyan-300" />
                            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-200">Indicator Panel</h3>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            <IndicatorTile label="RSI" value={activeTfSignal?.indicators.rsi} />
                            <IndicatorTile label="MACD" value={activeTfSignal?.indicators.macdHistogram} />
                            <IndicatorTile label="BB Mid" value={activeTfSignal?.indicators.bollingerMiddle} />
                            <IndicatorTile label="ATR" value={activeTfSignal?.indicators.atr} />
                        </div>
                        <details className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
                            <summary className="cursor-pointer text-xs font-black uppercase tracking-wider text-zinc-300">Secondary Indicators</summary>
                            <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-zinc-400">
                                <div>EMA20: {activeTfSignal?.indicators.ema20?.toFixed(2) ?? '--'}</div>
                                <div>EMA50: {activeTfSignal?.indicators.ema50?.toFixed(2) ?? '--'}</div>
                                <div>StochK: {activeTfSignal?.indicators.stochK?.toFixed(2) ?? '--'}</div>
                                <div>ADX: {activeTfSignal?.indicators.adx?.toFixed(2) ?? '--'}</div>
                            </div>
                        </details>
                    </section>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                            <div className="mb-3 flex items-center gap-2">
                                <Newspaper className="w-4 h-4 text-blue-300" />
                                <h3 className="text-sm font-black uppercase tracking-wider text-zinc-200">News Feed</h3>
                            </div>
                            <div className="space-y-2 text-sm text-zinc-300">
                                {miniNews.map((line, idx) => (
                                    <div key={`news-${idx}`} className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">{line}</div>
                                ))}
                            </div>
                        </section>

                        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                            <div className="mb-3 flex items-center gap-2">
                                <MessagesSquare className="w-4 h-4 text-violet-300" />
                                <h3 className="text-sm font-black uppercase tracking-wider text-zinc-200">Sentiment / Social Buzz</h3>
                            </div>
                            <div className="space-y-2 text-sm text-zinc-300">
                                {sentimentFeed.map((line, idx) => (
                                    <div key={`sent-${idx}`} className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">{line}</div>
                                ))}
                            </div>
                        </section>
                    </div>

                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-amber-300">
                        Trading signals are informational only. Use risk controls and independent confirmation.
                    </div>
                </>
            )}
        </div>
    );
}

function TopStat({ label, value, tone }: { label: string; value: string; tone: SignalDirection }) {
    return (
        <div className={`rounded-lg border p-2 ${signalBorderClass(tone)}`}>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-black">{label}</div>
            <div className={`mt-1 text-xs font-black ${signalTextClass(tone)}`}>{value}</div>
        </div>
    );
}

function LevelCell({ label, value, highlight = false }: { label: string; value: number | null | undefined; highlight?: boolean }) {
    return (
        <div className={`rounded-lg border p-2 ${highlight ? 'border-cyan-500/40 bg-cyan-500/10' : 'border-zinc-800 bg-zinc-900/60'}`}>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-black">{label}</div>
            <div className="text-sm font-black text-zinc-100">{Number.isFinite(value as number) ? formatPrice(Number(value)) : '--'}</div>
        </div>
    );
}

function IndicatorTile({ label, value }: { label: string; value: number | null | undefined }) {
    return (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-2">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-black">{label}</div>
            <div className="text-sm font-black text-zinc-100">{Number.isFinite(value as number) ? Number(value).toFixed(2) : '--'}</div>
        </div>
    );
}

function MiniBox({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-2">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-black">{label}</div>
            <div className="text-sm font-black text-zinc-100">{value}</div>
        </div>
    );
}

function FuturesSetupCard({ setup }: { setup: FuturesSetup | null }) {
    if (!setup) {
        return (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-sm text-zinc-400">
                No active futures setup.
            </div>
        );
    }

    const directionTone: SignalDirection = setup.direction;
    const isHold = setup.direction === 'HOLD';

    return (
        <div className={`rounded-xl border p-3 ${signalBorderClass(directionTone)}`}>
            <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-cyan-500/20 border border-cyan-500/40 px-2.5 py-1 text-[18px] font-bold leading-none text-cyan-200">
                        {setup.timeframe || '1D'}
                    </span>
                    <div className={`text-lg font-black ${signalTextClass(directionTone)}`}>{setup.direction}</div>
                </div>
                {isHold ? <HoldIcon /> : <DirectionIcon direction={setup.direction} />}
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3">
                <MiniBox label="Entry" value={formatPrice(setup.entry)} />
                <MiniBox label="Stop" value={formatPrice(setup.stopLoss)} />
                <MiniBox label="Target 1" value={formatPrice(setup.target1)} />
                <MiniBox label="Target 2" value={formatPrice(setup.target2)} />
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3">
                <MiniBox label="R:R" value={`1:${setup.riskRewardRatio.toFixed(2)}`} />
                <MiniBox label="ATR" value={formatPrice(setup.atrValue)} />
            </div>

            <details className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
                <summary className="cursor-pointer text-xs font-black uppercase tracking-wider text-zinc-300">Rationale</summary>
                <p className="mt-2 text-xs text-zinc-400 leading-relaxed">{setup.rationale}</p>
            </details>
        </div>
    );
}
