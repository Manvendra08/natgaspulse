'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
    TrendingUp, TrendingDown, Minus, RefreshCw, Clock, Target,
    Shield, Zap, BarChart3, Activity, AlertTriangle, ChevronDown,
    ChevronUp, Crosshair, Layers, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import type { SignalBotResponse, TimeframeSignal, IndicatorSignal, SignalDirection, Confidence } from '@/lib/types/signals';

// ─── Helpers ───────────────────────────────────────────────────

function signalColor(signal: SignalDirection) {
    if (signal === 'BUY') return 'text-emerald-400';
    if (signal === 'SELL') return 'text-red-400';
    return 'text-zinc-400';
}
function signalBg(signal: SignalDirection) {
    if (signal === 'BUY') return 'bg-emerald-500/10 border-emerald-500/30';
    if (signal === 'SELL') return 'bg-red-500/10 border-red-500/30';
    return 'bg-zinc-500/10 border-zinc-500/30';
}
function signalBgSolid(signal: SignalDirection) {
    if (signal === 'BUY') return 'bg-emerald-500';
    if (signal === 'SELL') return 'bg-red-500';
    return 'bg-zinc-600';
}
function confidenceColor(c: Confidence) {
    if (c === 'HIGH') return 'text-emerald-400';
    if (c === 'MEDIUM') return 'text-amber-400';
    return 'text-zinc-500';
}
function confidenceBg(c: Confidence) {
    if (c === 'HIGH') return 'bg-emerald-500/10 border-emerald-500/30';
    if (c === 'MEDIUM') return 'bg-amber-500/10 border-amber-500/30';
    return 'bg-zinc-500/10 border-zinc-500/30';
}
function SignalIcon({ signal, className = 'w-4 h-4' }: { signal: SignalDirection; className?: string }) {
    if (signal === 'BUY') return <TrendingUp className={`${className} text-emerald-400`} />;
    if (signal === 'SELL') return <TrendingDown className={`${className} text-red-400`} />;
    return <Minus className={`${className} text-zinc-500`} />;
}
function formatPrice(n: number) {
    return n < 10 ? n.toFixed(4) : n.toFixed(2);
}

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

// ─── Component ─────────────────────────────────────────────────

export default function TradingSignalBot() {
    const [data, setData] = useState<SignalBotResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [countdown, setCountdown] = useState(REFRESH_INTERVAL / 1000);
    const [expandedTF, setExpandedTF] = useState<string | null>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const countdownRef = useRef<NodeJS.Timeout | null>(null);

    const fetchSignals = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await fetch('/api/signals');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json: SignalBotResponse = await res.json();
            setData(json);
            setCountdown(REFRESH_INTERVAL / 1000);
        } catch (err: any) {
            setError(err.message || 'Failed to fetch signals');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSignals();
        timerRef.current = setInterval(fetchSignals, REFRESH_INTERVAL);
        countdownRef.current = setInterval(() => {
            setCountdown(prev => (prev > 0 ? prev - 1 : REFRESH_INTERVAL / 1000));
        }, 1000);
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (countdownRef.current) clearInterval(countdownRef.current);
        };
    }, [fetchSignals]);

    if (error && !data) {
        return (
            <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-red-500/30 rounded-2xl p-8">
                <div className="flex items-center gap-3 text-red-400">
                    <AlertTriangle className="w-6 h-6" />
                    <span className="font-bold">Signal Bot Error: {error}</span>
                </div>
                <button onClick={fetchSignals} className="mt-4 px-4 py-2 bg-red-500/20 border border-red-500/40 rounded-lg text-red-400 text-sm font-bold hover:bg-red-500/30 transition">
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* ─── Header & Overall Signal ─── */}
            <div className="bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 border border-zinc-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
                {/* Animated glow */}
                {data && data.overallSignal !== 'HOLD' && (
                    <div className={`absolute inset-0 opacity-[0.03] ${data.overallSignal === 'BUY' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                )}

                <div className="relative z-10">
                    {/* Title Row */}
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-violet-500/10 rounded-xl border border-violet-500/30">
                                <Zap className="w-6 h-6 text-violet-400" />
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-zinc-100 tracking-tight flex items-center gap-2">
                                    MCX SIGNAL BOT
                                    {data?.dataSource === 'MCX Official' && (
                                        <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">
                                            Official
                                        </span>
                                    )}
                                    {data?.dataSource === 'Derived (NYMEX * USDINR)' && (
                                        <span className="text-[10px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">
                                            Parity
                                        </span>
                                    )}
                                </h2>
                                <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Multi-Timeframe • Natural Gas • MCX</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="text-right">
                                <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Next Refresh</div>
                                <div className="text-xs font-mono text-zinc-400 flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')}
                                </div>
                            </div>
                            <button
                                onClick={fetchSignals}
                                disabled={loading}
                                className="p-2 rounded-lg bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 transition disabled:opacity-50"
                            >
                                <RefreshCw className={`w-4 h-4 text-zinc-400 ${loading ? 'animate-spin' : ''}`} />
                            </button>
                        </div>
                    </div>

                    {loading && !data ? (
                        <div className="flex items-center justify-center py-16">
                            <div className="flex flex-col items-center gap-4">
                                <RefreshCw className="w-8 h-8 text-violet-400 animate-spin" />
                                <span className="text-sm text-zinc-500 font-bold uppercase tracking-wider">Analyzing 5 timeframes...</span>
                            </div>
                        </div>
                    ) : data ? (
                        <>
                            {/* Overall Signal Badge */}
                            <div className="flex flex-col md:flex-row items-start md:items-center gap-6 mb-6">
                                <div className={`flex items-center gap-4 px-6 py-4 rounded-xl border-2 ${data.overallSignal === 'BUY' ? 'border-emerald-500/50 bg-emerald-500/5' : data.overallSignal === 'SELL' ? 'border-red-500/50 bg-red-500/5' : 'border-zinc-700 bg-zinc-800/50'}`}>
                                    <div className={`p-3 rounded-xl ${signalBgSolid(data.overallSignal)}`}>
                                        <SignalIcon signal={data.overallSignal} className="w-8 h-8 text-white" />
                                    </div>
                                    <div>
                                        <div className={`text-3xl font-black tracking-tight ${signalColor(data.overallSignal)}`}>
                                            {data.overallSignal}
                                        </div>
                                        <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Overall Signal</div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-1">
                                    <MiniStat label="Price" value={`₹${formatPrice(data.currentPrice)}`} />
                                    <MiniStat label="Score" value={`${data.overallScore > 0 ? '+' : ''}${data.overallScore}`} valueClass={signalColor(data.overallSignal)} />
                                    <MiniStat label="Confidence" value={data.overallConfidence} valueClass={confidenceColor(data.overallConfidence)} />
                                    <MiniStat label="Market" value={data.marketCondition} valueClass={data.marketCondition === 'TRENDING' ? 'text-violet-400' : data.marketCondition === 'VOLATILE' ? 'text-amber-400' : 'text-zinc-400'} />
                                </div>
                            </div>

                            {/* Summary */}
                            <div className="bg-zinc-800/30 border border-zinc-800 rounded-xl p-4">
                                <p className="text-sm text-zinc-300 leading-relaxed">{data.summary}</p>
                            </div>
                        </>
                    ) : null}
                </div>
            </div>

            {/* ─── Multi-Timeframe Grid ─── */}
            {data && (
                <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 rounded-2xl p-6 shadow-2xl">
                    <div className="flex items-center gap-2 mb-5">
                        <BarChart3 className="w-5 h-5 text-cyan-400" />
                        <h3 className="text-lg font-black text-zinc-100 tracking-tight">TIMEFRAME ANALYSIS</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                        {data.timeframes.map(tf => (
                            <TimeframeCard
                                key={tf.timeframe}
                                tf={tf}
                                expanded={expandedTF === tf.timeframe}
                                onToggle={() => setExpandedTF(expandedTF === tf.timeframe ? null : tf.timeframe)}
                            />
                        ))}
                    </div>

                    {/* Indicator Heatmap */}
                    <div className="mt-6">
                        <h4 className="text-xs font-black text-zinc-500 uppercase tracking-widest mb-3">Indicator Heatmap</h4>
                        <div className="overflow-x-auto">
                            <IndicatorHeatmap timeframes={data.timeframes} />
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Futures & Options Row ─── */}
            {data && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Futures Setup */}
                    <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 rounded-2xl p-6 shadow-2xl">
                        <div className="flex items-center gap-2 mb-5">
                            <Target className="w-5 h-5 text-amber-400" />
                            <h3 className="text-lg font-black text-zinc-100 tracking-tight">FUTURES SETUP</h3>
                        </div>

                        {data.futuresSetup ? (
                            <FuturesCard setup={data.futuresSetup} />
                        ) : (
                            <div className="flex flex-col items-center justify-center py-8 text-zinc-600">
                                <Minus className="w-8 h-8 mb-2" />
                                <span className="text-sm font-bold">No clear futures setup</span>
                                <span className="text-[10px] text-zinc-700 mt-1">Market is neutral — wait for directional bias</span>
                            </div>
                        )}
                    </div>

                    {/* Options Advisor */}
                    <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 rounded-2xl p-6 shadow-2xl">
                        <div className="flex items-center gap-2 mb-5">
                            <Layers className="w-5 h-5 text-pink-400" />
                            <h3 className="text-lg font-black text-zinc-100 tracking-tight">OPTIONS ADVISOR</h3>
                        </div>

                        {data.optionChainAnalysis && (
                            <div className="grid grid-cols-2 gap-3 mb-4">
                                <div className="bg-zinc-800/30 border border-zinc-800 rounded-lg p-2.5 flex justify-between items-center">
                                    <span className="text-[10px] uppercase text-zinc-500 font-bold">PCR (OI)</span>
                                    <span className={`text-sm font-black ${data.optionChainAnalysis.pcr >= 1 ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {data.optionChainAnalysis.pcr.toFixed(2)}
                                    </span>
                                </div>
                                <div className="bg-zinc-800/30 border border-zinc-800 rounded-lg p-2.5 flex justify-between items-center">
                                    <span className="text-[10px] uppercase text-zinc-500 font-bold">Max Pain</span>
                                    <span className="text-sm font-black text-amber-400">
                                        ₹{data.optionChainAnalysis.maxPain}
                                    </span>
                                </div>
                                <div className="bg-zinc-800/30 border border-zinc-800 rounded-lg p-2.5 flex justify-between items-center">
                                    <span className="text-[10px] uppercase text-zinc-500 font-bold">Call Res</span>
                                    <span className="text-sm font-black text-red-400">
                                        ₹{data.optionChainAnalysis.callResistance}
                                    </span>
                                </div>
                                <div className="bg-zinc-800/30 border border-zinc-800 rounded-lg p-2.5 flex justify-between items-center">
                                    <span className="text-[10px] uppercase text-zinc-500 font-bold">Put Supp</span>
                                    <span className="text-sm font-black text-emerald-400">
                                        ₹{data.optionChainAnalysis.putSupport}
                                    </span>
                                </div>
                            </div>
                        )}

                        {data.optionsRecommendations.length > 0 ? (
                            <div className="space-y-3">
                                {data.optionsRecommendations.map((rec, i) => (
                                    <div key={i} className={`p-4 rounded-xl border ${rec.action === 'BUY' ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-amber-500/20 bg-amber-500/5'}`}>
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${rec.action === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                                                    {rec.action}
                                                </span>
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${rec.optionType === 'CE' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-pink-500/20 text-pink-400'}`}>
                                                    {rec.optionType === 'CE' ? 'CALL' : 'PUT'}
                                                </span>
                                            </div>
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${confidenceBg(rec.riskLevel)}`}>
                                                {rec.riskLevel} CONF
                                            </span>
                                        </div>
                                        <div className="flex items-baseline gap-2 mb-2">
                                            <span className="text-lg font-black text-zinc-100">Strike: ₹{formatPrice(rec.strikePrice)}</span>
                                            <span className="text-[10px] text-zinc-500">Exp Move: ±₹{formatPrice(rec.expectedMove)}</span>
                                        </div>
                                        <p className="text-xs text-zinc-400 leading-relaxed">{rec.rationale}</p>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-8 text-zinc-600">
                                <Shield className="w-8 h-8 mb-2" />
                                <span className="text-sm font-bold">No options recommendations</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Disclaimer */}
            <div className="text-[10px] uppercase tracking-wider font-bold text-amber-600 dark:text-amber-400 border border-amber-500/30 bg-amber-500/10 rounded-lg px-3 py-2 text-center">
                ⚠ Trading signals are for informational purposes only. Not financial advice. Always perform your own analysis and manage risk.
            </div>
        </div>
    );
}

// ─── Sub-Components ────────────────────────────────────────────

function MiniStat({ label, value, valueClass = 'text-zinc-100' }: { label: string; value: string; valueClass?: string }) {
    return (
        <div className="bg-zinc-800/30 border border-zinc-800 rounded-lg p-3">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">{label}</div>
            <div className={`text-sm font-black ${valueClass}`}>{value}</div>
        </div>
    );
}

function TimeframeCard({ tf, expanded, onToggle }: { tf: TimeframeSignal; expanded: boolean; onToggle: () => void }) {
    return (
        <div className={`rounded-xl border transition-all duration-300 cursor-pointer ${signalBg(tf.bias)} hover:brightness-110`} onClick={onToggle}>
            <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-black text-zinc-300 uppercase">{tf.timeframe}</span>
                    <SignalIcon signal={tf.bias} className="w-5 h-5" />
                </div>
                <div className={`text-lg font-black ${signalColor(tf.bias)}`}>{tf.bias}</div>
                <div className="flex items-center gap-1 mt-1">
                    <span className={`text-xs font-mono ${tf.priceChangePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {tf.priceChangePercent >= 0 ? '+' : ''}{tf.priceChangePercent.toFixed(2)}%
                    </span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                    <span className="text-[10px] text-zinc-600">Score: {tf.biasScore > 0 ? '+' : ''}{tf.biasScore}</span>
                    {expanded ? <ChevronUp className="w-3 h-3 text-zinc-600" /> : <ChevronDown className="w-3 h-3 text-zinc-600" />}
                </div>
            </div>

            {expanded && (
                <div className="border-t border-zinc-800/50 p-3 space-y-1.5 bg-zinc-950/30 rounded-b-xl">
                    {tf.signals.map((s, i) => (
                        <div key={i} className="flex items-center justify-between">
                            <span className="text-[10px] text-zinc-500 truncate mr-2">{s.name}</span>
                            <span className={`text-[10px] font-bold ${signalColor(s.signal)}`}>{s.signal}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function FuturesCard({ setup }: { setup: NonNullable<SignalBotResponse['futuresSetup']> }) {
    const isBuy = setup.direction === 'BUY';
    return (
        <div className="space-y-4">
            <div className={`flex items-center gap-3 p-4 rounded-xl border ${isBuy ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
                <div className={`p-2.5 rounded-lg ${isBuy ? 'bg-emerald-500' : 'bg-red-500'}`}>
                    {isBuy ? <ArrowUpRight className="w-5 h-5 text-white" /> : <ArrowDownRight className="w-5 h-5 text-white" />}
                </div>
                <div>
                    <div className={`text-xl font-black ${isBuy ? 'text-emerald-400' : 'text-red-400'}`}>
                        {setup.direction} FUTURES
                    </div>
                    <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">
                        MCX Natural Gas Futures
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <LevelBox label="Entry" value={`₹${formatPrice(setup.entry)}`} color="text-zinc-100" />
                <LevelBox label="Stop Loss" value={`₹${formatPrice(setup.stopLoss)}`} color="text-red-400" />
                <LevelBox label="Target 1" value={`₹${formatPrice(setup.target1)}`} color="text-emerald-400" />
                <LevelBox label="Target 2" value={`₹${formatPrice(setup.target2)}`} color="text-cyan-400" />
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="bg-zinc-800/30 border border-zinc-800 rounded-lg p-3">
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Risk:Reward</div>
                    <div className={`text-sm font-black ${setup.riskRewardRatio >= 1.5 ? 'text-emerald-400' : setup.riskRewardRatio >= 1 ? 'text-amber-400' : 'text-red-400'}`}>
                        1:{setup.riskRewardRatio.toFixed(2)}
                    </div>
                </div>
                <div className="bg-zinc-800/30 border border-zinc-800 rounded-lg p-3">
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">ATR(14)</div>
                    <div className="text-sm font-black text-zinc-300">₹{formatPrice(setup.atrValue)}</div>
                </div>
            </div>

            <div className="bg-zinc-800/20 border border-zinc-800/50 rounded-lg p-3">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Rationale</div>
                <p className="text-xs text-zinc-400 leading-relaxed">{setup.rationale}</p>
            </div>
        </div>
    );
}

function LevelBox({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <div className="bg-zinc-800/30 border border-zinc-800 rounded-lg p-3">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">{label}</div>
            <div className={`text-base font-black ${color}`}>{value}</div>
        </div>
    );
}

const HEATMAP_INDICATORS = ['RSI(14)', 'MACD', 'EMA(20/50)', 'Stochastic', 'Bollinger', 'VWAP', 'Pivot Points'];

function IndicatorHeatmap({ timeframes }: { timeframes: TimeframeSignal[] }) {
    return (
        <table className="w-full text-[10px]">
            <thead>
                <tr>
                    <th className="text-left text-zinc-600 font-bold uppercase tracking-wider py-2 pr-4">Indicator</th>
                    {timeframes.map(tf => (
                        <th key={tf.timeframe} className="text-center text-zinc-600 font-bold uppercase tracking-wider py-2 px-2">{tf.timeframe}</th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {HEATMAP_INDICATORS.map(name => (
                    <tr key={name} className="border-t border-zinc-800/30">
                        <td className="text-zinc-400 font-bold py-2 pr-4 whitespace-nowrap">{name}</td>
                        {timeframes.map(tf => {
                            const s = tf.signals.find(sig => sig.name === name);
                            const signal = s?.signal || 'HOLD';
                            return (
                                <td key={tf.timeframe} className="text-center py-2 px-2">
                                    <span className={`inline-block w-6 h-6 rounded-md leading-6 text-center font-black ${signal === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : signal === 'SELL' ? 'bg-red-500/20 text-red-400' : 'bg-zinc-800 text-zinc-600'}`}>
                                        {signal === 'BUY' ? '▲' : signal === 'SELL' ? '▼' : '–'}
                                    </span>
                                </td>
                            );
                        })}
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
