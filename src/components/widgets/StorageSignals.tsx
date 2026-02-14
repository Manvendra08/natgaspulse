'use client';

import { Lightbulb, TrendingUp, TrendingDown, ArrowRightLeft, Clock3 } from 'lucide-react';

type ConfidenceLevel = 'High' | 'Medium' | 'Low';

interface SignalItem {
    text: string;
    confidence: ConfidenceLevel;
}

interface StorageSignalsProps {
    predictedWithdrawal: number | null;
    averageWithdrawal: number | null;
    actualWithdrawal: number | null;
    predictionWindowLabel?: string;
    nextEiaReportLabel?: string;
    isLoading?: boolean;
}

function getConfidenceBadgeClasses(confidence: ConfidenceLevel) {
    if (confidence === 'High') {
        return 'text-emerald-700 dark:text-emerald-300 border-emerald-500/40 bg-emerald-500/10';
    }
    if (confidence === 'Medium') {
        return 'text-amber-700 dark:text-amber-300 border-amber-500/40 bg-amber-500/10';
    }
    return 'text-zinc-700 dark:text-zinc-300 border-zinc-500/40 bg-zinc-500/10';
}

function formatNumber(value: number) {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

function confidenceFromDeviation(reference: number, comparison: number): ConfidenceLevel {
    if (!reference || !Number.isFinite(reference)) return 'Low';
    const deviationPct = Math.abs((comparison - reference) / reference) * 100;
    if (deviationPct >= 18) return 'High';
    if (deviationPct >= 8) return 'Medium';
    return 'Low';
}

export default function StorageSignals({
    predictedWithdrawal,
    averageWithdrawal,
    actualWithdrawal,
    predictionWindowLabel,
    nextEiaReportLabel,
    isLoading = false
}: StorageSignalsProps) {
    if (isLoading) {
        return (
            <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-xl dark:shadow-2xl animate-pulse h-[320px]" />
        );
    }

    const hasCoreData =
        predictedWithdrawal !== null &&
        averageWithdrawal !== null &&
        Number.isFinite(predictedWithdrawal) &&
        Number.isFinite(averageWithdrawal) &&
        averageWithdrawal > 0;

    if (!hasCoreData) {
        return (
            <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-xl dark:shadow-2xl">
                <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-100 tracking-tight mb-2">Storage Signals</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">Not enough data yet to derive directional signals.</p>
            </div>
        );
    }

    const predicted = predictedWithdrawal as number;
    const average = averageWithdrawal as number;
    const isBullish = predicted > average;
    const isBearish = predicted < average;

    const directionalConfidence = confidenceFromDeviation(average, predicted);

    const bullishSignals: SignalItem[] = [
        { text: 'Large withdrawal expected -> Support prices', confidence: directionalConfidence },
        { text: 'Consider long positions if storage surprise likely', confidence: directionalConfidence === 'High' ? 'Medium' : 'Low' },
        { text: 'Watch basis spreads in cold regions', confidence: 'Medium' }
    ];

    const bearishSignals: SignalItem[] = [
        { text: 'Small withdrawal -> Pressure on prices', confidence: directionalConfidence },
        { text: 'Consider shorts if mild weather persists', confidence: directionalConfidence === 'High' ? 'Medium' : 'Low' },
        { text: 'Storage surplus building', confidence: directionalConfidence }
    ];

    const tradeIdeaSignals: SignalItem[] = [];
    if (actualWithdrawal !== null && Number.isFinite(actualWithdrawal) && actualWithdrawal > 0) {
        const surpriseConfidence = confidenceFromDeviation(actualWithdrawal, predicted);
        if (predicted > actualWithdrawal) {
            tradeIdeaSignals.push({ text: 'Bearish surprise, fade rally', confidence: surpriseConfidence });
        } else if (predicted < actualWithdrawal) {
            tradeIdeaSignals.push({ text: 'Bullish surprise, buy dip', confidence: surpriseConfidence });
        } else {
            tradeIdeaSignals.push({ text: 'In-line print, follow prevailing trend', confidence: 'Low' });
        }
    } else {
        tradeIdeaSignals.push({ text: 'Await actual EIA print to confirm surprise direction', confidence: 'Low' });
    }
    tradeIdeaSignals.push({ text: 'Next EIA report: Thursday 10:30 AM EST', confidence: 'High' });

    const primarySignals = isBullish ? bullishSignals : isBearish ? bearishSignals : [];
    const primaryTitle = isBullish ? 'Bullish Signals' : isBearish ? 'Bearish Signals' : 'Neutral Signals';
    const primaryColor = isBullish ? 'text-emerald-600 dark:text-emerald-400' : isBearish ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400';
    const primaryIcon = isBullish ? <TrendingUp className="w-4 h-4" /> : isBearish ? <TrendingDown className="w-4 h-4" /> : <ArrowRightLeft className="w-4 h-4" />;

    return (
        <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 md:p-6 shadow-xl dark:shadow-2xl">
            <div className="flex items-start justify-between gap-3 mb-5">
                <div>
                    <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-100 tracking-tight flex items-center gap-2">
                        <Lightbulb className="w-4 h-4 text-amber-500" />
                        Storage Signals
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Predicted {formatNumber(predicted)} BCF vs avg {formatNumber(average)} BCF
                    </p>
                    {predictionWindowLabel && (
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{predictionWindowLabel}</p>
                    )}
                    {nextEiaReportLabel && (
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                            <Clock3 className="w-3 h-3" />
                            {nextEiaReportLabel}
                        </p>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 bg-zinc-50/60 dark:bg-zinc-900/30">
                    <div className={`text-sm font-black uppercase tracking-wider mb-3 flex items-center gap-1.5 ${primaryColor}`}>
                        {primaryIcon}
                        {primaryTitle}
                    </div>
                    <div className="space-y-2">
                        {primarySignals.length > 0 ? primarySignals.map((signal) => (
                            <div key={signal.text} className="flex items-center justify-between gap-2 text-sm">
                                <span className="text-zinc-700 dark:text-zinc-200">{signal.text}</span>
                                <span className={`shrink-0 px-2 py-0.5 text-[10px] font-black rounded border ${getConfidenceBadgeClasses(signal.confidence)}`}>
                                    {signal.confidence}
                                </span>
                            </div>
                        )) : (
                            <div className="text-sm text-zinc-500 dark:text-zinc-400">Predicted withdrawal is close to average. Wait for clearer setup.</div>
                        )}
                    </div>
                </div>

                <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 bg-zinc-50/60 dark:bg-zinc-900/30">
                    <div className="text-sm font-black uppercase tracking-wider mb-3 flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                        <ArrowRightLeft className="w-4 h-4" />
                        Trade Ideas
                    </div>
                    <div className="space-y-2">
                        {tradeIdeaSignals.map((signal) => (
                            <div key={signal.text} className="flex items-center justify-between gap-2 text-sm">
                                <span className="text-zinc-700 dark:text-zinc-200">{signal.text}</span>
                                <span className={`shrink-0 px-2 py-0.5 text-[10px] font-black rounded border ${getConfidenceBadgeClasses(signal.confidence)}`}>
                                    {signal.confidence}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

