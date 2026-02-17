import Link from 'next/link';
import Logo from '@/components/Logo';
import {
    Activity,
    ArrowRight,
    BarChart3,
    CheckCircle2,
    CloudSun,
    Database,
    Gauge,
    ShieldCheck
} from 'lucide-react';

const platformPillars = [
    {
        title: 'Market Structure Engine',
        description: 'Track MCX and NYMEX structure, momentum shifts, and key support/resistance zones in one view.',
        icon: BarChart3
    },
    {
        title: 'Weather + Storage Intelligence',
        description: 'Blend NOAA weather regime changes with EIA storage trends to anticipate directional pressure early.',
        icon: CloudSun
    },
    {
        title: 'Execution-Ready Signal Stack',
        description: 'From setup discovery to risk framing, every module is designed for high-speed trading decisions.',
        icon: Gauge
    }
];

const launchPlans = [
    {
        name: 'Starter',
        oldPrice: 'Rs 2,499 / month',
        newPrice: 'Rs 0',
        tag: 'Launch Offer',
        description: 'Built for discretionary traders who need clean daily decision support.',
        features: ['Live dashboard access', 'Signal snapshots', 'Weather and storage widgets']
    },
    {
        name: 'Pro',
        oldPrice: 'Rs 6,999 / month',
        newPrice: 'Rs 0',
        tag: 'Launch Offer',
        description: 'For active intraday and swing traders managing multi-leg exposure.',
        features: ['Trading Zone with Greeks', 'Position diagnostics and alerts', 'Advanced charting and strategy views'],
        highlight: true
    },
    {
        name: 'Institutional',
        oldPrice: 'Rs 14,999 / month',
        newPrice: 'Rs 0',
        tag: 'Launch Offer',
        description: 'For desks and teams requiring centralized intelligence and faster workflows.',
        features: ['Complete platform suite', 'Priority support queue', 'Early access to premium modules']
    }
];

export default function Home() {
    return (
        <main className="min-h-screen bg-gradient-to-b from-cyan-50 via-white to-slate-100 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900">
            <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white/85 dark:bg-zinc-950/80 backdrop-blur-sm">
                <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-5">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <div>
                            <Logo variant="text" textWidth={240} withLink={false} priority />
                            <p className="mt-2 text-sm md:text-base text-zinc-600 dark:text-zinc-300 font-medium">
                                Institutional-grade Natural Gas Intelligence
                            </p>
                        </div>
                        <nav className="flex items-center gap-2 md:gap-3 text-sm font-semibold">
                            <Link href="/dashboard" className="px-3 py-1.5 rounded-md hover:bg-cyan-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200">
                                Dashboard
                            </Link>
                            <Link href="/signals" className="px-3 py-1.5 rounded-md hover:bg-cyan-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200">
                                Signals
                            </Link>
                            <Link href="/trading-zone" className="px-3 py-1.5 rounded-md hover:bg-cyan-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200">
                                Trading Zone
                            </Link>
                            <Link href="#plans" className="px-3 py-1.5 rounded-md hover:bg-cyan-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200">
                                Plans
                            </Link>
                        </nav>
                    </div>
                </div>
            </header>

            <section className="max-w-[1200px] mx-auto px-4 md:px-8 pt-14 md:pt-16 pb-10">
                <div className="relative overflow-hidden rounded-3xl border border-cyan-200/70 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/60 p-8 md:p-12 shadow-2xl">
                    <div className="absolute -top-24 -right-16 h-56 w-56 rounded-full bg-cyan-300/25 blur-3xl dark:bg-cyan-500/10" />
                    <div className="absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-emerald-300/25 blur-3xl dark:bg-emerald-500/10" />

                    <div className="relative">
                        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 dark:border-zinc-700 bg-cyan-50/80 dark:bg-zinc-800/80 px-3 py-1 text-xs font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-300">
                            <Activity className="h-3.5 w-3.5" />
                            Launching NatGasPulse Core Suite
                        </div>
                        <h1 className="mt-5 text-4xl md:text-6xl font-black tracking-tight text-zinc-900 dark:text-zinc-100 max-w-5xl leading-tight">
                            Trade Natural Gas with a Professional Intelligence Stack
                        </h1>
                        <p className="mt-5 text-zinc-600 dark:text-zinc-300 max-w-3xl text-base md:text-lg">
                            One integrated workspace for price structure, weather drivers, storage context, and actionable trade intelligence across MCX and NYMEX.
                        </p>

                        <div className="mt-8 flex flex-wrap items-center gap-3">
                            <Link href="/dashboard" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white font-bold">
                                Open Dashboard
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                            <Link href="/trading-zone" className="px-5 py-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white font-bold dark:bg-zinc-700 dark:hover:bg-zinc-600">
                                Start Trading Zone
                            </Link>
                            <Link href="#plans" className="px-5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-100 font-bold">
                                View Launch Plans
                            </Link>
                        </div>

                        <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/85 dark:bg-zinc-900/70 p-4">
                                <p className="text-xs font-bold tracking-widest uppercase text-zinc-500">Coverage</p>
                                <p className="text-2xl font-black mt-1 text-zinc-900 dark:text-zinc-100">MCX + NYMEX</p>
                            </div>
                            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/85 dark:bg-zinc-900/70 p-4">
                                <p className="text-xs font-bold tracking-widest uppercase text-zinc-500">Modules</p>
                                <p className="text-2xl font-black mt-1 text-zinc-900 dark:text-zinc-100">Signals + Greeks</p>
                            </div>
                            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/85 dark:bg-zinc-900/70 p-4">
                                <p className="text-xs font-bold tracking-widest uppercase text-zinc-500">Status</p>
                                <p className="text-2xl font-black mt-1 text-emerald-600 dark:text-emerald-400">Live Launch</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="max-w-[1200px] mx-auto px-4 md:px-8 py-6 md:py-10">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
                    {platformPillars.map((pillar) => {
                        const Icon = pillar.icon;
                        return (
                            <article key={pillar.title} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/40 p-6">
                                <div className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-cyan-100 dark:bg-zinc-800 text-cyan-700 dark:text-cyan-300">
                                    <Icon className="h-5 w-5" />
                                </div>
                                <h3 className="mt-4 text-lg font-black text-zinc-900 dark:text-zinc-100">{pillar.title}</h3>
                                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{pillar.description}</p>
                            </article>
                        );
                    })}
                </div>
            </section>

            <section id="plans" className="max-w-[1200px] mx-auto px-4 md:px-8 py-14 md:py-16">
                <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white/85 dark:bg-zinc-900/45 p-8 md:p-10">
                    <div className="max-w-3xl">
                        <h2 className="text-3xl md:text-4xl font-black tracking-tight text-zinc-900 dark:text-zinc-100">
                            Subscription Plans: Zero-Cost Launch Offer
                        </h2>
                        <p className="mt-3 text-zinc-600 dark:text-zinc-300">
                            All subscription plans are discounted to <span className="font-black text-emerald-600 dark:text-emerald-400">Rs 0</span> for the launch phase.
                        </p>
                    </div>

                    <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
                        {launchPlans.map((plan) => (
                            <article
                                key={plan.name}
                                className={`rounded-2xl border p-6 ${plan.highlight
                                    ? 'border-cyan-400/70 dark:border-cyan-500/40 bg-cyan-50/70 dark:bg-cyan-950/20 shadow-lg'
                                    : 'border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/55'
                                    }`}
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <h3 className="text-xl font-black text-zinc-900 dark:text-zinc-100">{plan.name}</h3>
                                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                                        {plan.tag}
                                    </span>
                                </div>
                                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{plan.description}</p>

                                <div className="mt-5">
                                    <p className="text-sm line-through text-zinc-500">{plan.oldPrice}</p>
                                    <p className="text-4xl font-black text-emerald-600 dark:text-emerald-400">{plan.newPrice}</p>
                                </div>

                                <ul className="mt-5 space-y-2 text-sm">
                                    {plan.features.map((feature) => (
                                        <li key={feature} className="flex items-start gap-2 text-zinc-700 dark:text-zinc-200">
                                            <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-500" />
                                            <span>{feature}</span>
                                        </li>
                                    ))}
                                </ul>

                                <Link
                                    href="/dashboard"
                                    className={`mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-bold ${plan.highlight
                                        ? 'bg-cyan-600 hover:bg-cyan-700 text-white'
                                        : 'bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-700 dark:hover:bg-zinc-600'
                                        }`}
                                >
                                    Activate Plan at Rs 0
                                    <ArrowRight className="h-4 w-4" />
                                </Link>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            <section className="max-w-[1200px] mx-auto px-4 md:px-8 pb-20">
                <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/45 p-6 md:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                    <div>
                        <h3 className="text-xl md:text-2xl font-black text-zinc-900 dark:text-zinc-100">
                            Built for serious commodity traders
                        </h3>
                        <p className="mt-2 text-zinc-600 dark:text-zinc-300 max-w-2xl">
                            Professional-grade data reliability, transparent analytics, and launch pricing at Rs 0 across all plans.
                        </p>
                        <div className="mt-4 flex flex-wrap gap-3 text-xs font-bold uppercase tracking-wide">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200">
                                <ShieldCheck className="h-3.5 w-3.5" /> Risk-aware workflows
                            </span>
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200">
                                <Database className="h-3.5 w-3.5" /> Data-rich dashboards
                            </span>
                        </div>
                    </div>
                    <Link href="/dashboard" className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white font-black">
                        Launch Workspace
                        <ArrowRight className="h-4 w-4" />
                    </Link>
                </div>
            </section>
        </main>
    );
}
