'use client';

import { ArrowRight, Lock, Sparkles } from 'lucide-react';

interface PremiumFeatureCardProps {
    title: string;
    headline: string;
    description: string;
    features: string[];
    highlight?: boolean;
}

const premiumFeatures: PremiumFeatureCardProps[] = [
    {
        title: 'Signal Bot',
        headline: 'Multi-Timeframe Analysis',
        description: '8 technical indicators across 3 timeframes with weighted confluence scoring. Get precise entry/exit zones with ATR-based risk management.',
        features: ['Futures setup with SL/Targets', 'Options strategy advisor', 'PCR & IV regime detection']
    },
    {
        title: 'Strategy Lab',
        headline: 'Backtest & Optimize',
        description: 'Build, backtest, and refine your natural gas trading strategies with historical data and performance metrics.',
        features: ['Custom indicator combos', 'Win rate analytics', 'Risk-adjusted returns']
    },
    {
        title: 'Options Advisor',
        headline: 'Smart Strike Selection',
        description: 'IV regime detection, PCR contrarian signals, and DTE-aware strategy recommendations for MCX Natural Gas options.',
        features: ['Iron Condor / Strangle builder', 'Max pain tracking', 'Defined-risk spreads']
    },
    {
        title: 'Trading Zone',
        headline: 'Live Position Monitor',
        description: 'Real-time position tracking with Greeks, risk level assessment, and adjustment recommendations for active traders.',
        features: ['Portfolio delta/theta', 'Position alerts', 'Adjustment advisor']
    },
    {
        title: 'Smart Alerts',
        headline: 'Never Miss a Move',
        description: 'Custom price alerts, storage report notifications, and weather-driven signals delivered to your device.',
        features: ['Price level alerts', 'EIA report reminders', 'Weather regime changes']
    },
    {
        title: 'Pro Dashboard',
        headline: 'All-in-One Workspace',
        description: 'Combine all premium features in a single, customizable workspace designed for professional commodity traders.',
        features: ['Layout customization', 'Priority data feeds', 'Early feature access'],
        highlight: true
    }
];

export default function PremiumFeaturesSection() {
    const scrollToPlans = () => {
        const plans = document.getElementById('plans');
        if (plans) {
            plans.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        }
        window.location.hash = '#plans';
    };

    return (
        <section className="max-w-[1200px] mx-auto px-4 md:px-8 pt-6 pb-14 md:pb-16">
            <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white/85 dark:bg-zinc-900/45 p-6 md:p-8">
                <div className="text-center mb-8">
                    <h2 className="text-2xl md:text-3xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight">
                        Unlock Premium Features
                    </h2>
                    <p className="mt-2 text-zinc-500 dark:text-zinc-400 text-sm md:text-base max-w-2xl mx-auto">
                        Upgrade to Pro for advanced trading tools, real-time alerts, and institutional-grade analytics.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {premiumFeatures.map((feature) => (
                        <PremiumFeatureCard
                            key={`${feature.title}-${feature.headline}`}
                            title={feature.title}
                            headline={feature.headline}
                            description={feature.description}
                            features={feature.features}
                            highlight={feature.highlight}
                        />
                    ))}
                </div>

                <div className="mt-8 text-center">
                    <button
                        onClick={scrollToPlans}
                        className="inline-flex items-center justify-center gap-2 min-h-11 px-8 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 text-white font-bold text-lg shadow-lg shadow-violet-500/25 transition-all"
                    >
                        Unlock with Pro →
                        <ArrowRight className="w-5 h-5" />
                    </button>
                    <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                        Launch offer: All features free during beta period
                    </p>
                </div>
            </div>
        </section>
    );
}

function PremiumFeatureCard({ title, headline, description, features, highlight }: PremiumFeatureCardProps) {
    return (
        <div className={`relative group rounded-2xl border overflow-hidden transition-all duration-300 ${highlight
            ? 'border-violet-500/50 bg-gradient-to-br from-violet-500/5 to-pink-500/5 dark:from-violet-500/10 dark:to-pink-500/10'
            : 'border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/60'
            }`}>
            <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 ${highlight
                ? 'bg-gradient-to-br from-violet-500/10 to-pink-500/10'
                : 'bg-gradient-to-br from-cyan-500/5 to-emerald-500/5'
                }`} />

            <div className="relative p-5">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <div className={`p-2 rounded-lg ${highlight
                            ? 'bg-violet-500/20 text-violet-400'
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                            }`}>
                            <Sparkles className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{title}</span>
                    </div>
                    <Lock className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-600" />
                </div>

                <div className="relative h-32 mb-4 rounded-lg bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-zinc-200 to-zinc-300 dark:from-zinc-700 dark:to-zinc-800 flex items-center justify-center">
                        <div className="text-center">
                            <div className="w-12 h-12 mx-auto mb-2 rounded-lg bg-zinc-300 dark:bg-zinc-600 flex items-center justify-center">
                                <Sparkles className="w-6 h-6 text-zinc-400 dark:text-zinc-500" />
                            </div>
                            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Screenshot</span>
                        </div>
                    </div>
                    <div className="absolute inset-0 backdrop-blur-sm bg-white/30 dark:bg-zinc-900/30 flex items-center justify-center">
                        <span className="px-3 py-1.5 rounded-full bg-white/80 dark:bg-zinc-800/80 text-[10px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                            Pro Feature
                        </span>
                    </div>
                </div>

                <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-100 mb-1">{headline}</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4 leading-relaxed">{description}</p>

                <ul className="space-y-1.5">
                    {features.map((feature) => (
                        <li key={feature} className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                            <div className={`w-1.5 h-1.5 rounded-full ${highlight ? 'bg-violet-400' : 'bg-emerald-400'}`} />
                            {feature}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
