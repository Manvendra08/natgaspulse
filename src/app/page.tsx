import Link from 'next/link';
import Logo from '@/components/Logo';

export default function Home() {
    return (
        <main className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-violet-50 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900">
            <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white/85 dark:bg-zinc-950/80 backdrop-blur-sm">
                <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-6">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <div>
                            <Logo variant="text" textWidth={250} withLink={false} priority />
                            <p className="mt-2 text-sm md:text-base text-zinc-600 dark:text-zinc-300 font-medium">
                                Real-Time Natural Gas Market Intelligence
                            </p>
                        </div>
                        <nav className="flex items-center gap-2 md:gap-3 text-sm font-semibold">
                            <Link href="/dashboard" className="px-3 py-1.5 rounded-md hover:bg-sky-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200">
                                Dashboard
                            </Link>
                            <Link href="/dashboard#charts" className="px-3 py-1.5 rounded-md hover:bg-sky-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200">
                                Charts
                            </Link>
                            <Link href="/dashboard#alerts" className="px-3 py-1.5 rounded-md hover:bg-sky-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200">
                                Alerts
                            </Link>
                            <Link href="#about" className="px-3 py-1.5 rounded-md hover:bg-sky-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200">
                                About
                            </Link>
                        </nav>
                    </div>
                </div>
            </header>

            <section className="max-w-[1200px] mx-auto px-4 md:px-8 py-16">
                <div className="rounded-2xl border border-sky-200/70 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/60 p-8 md:p-12 shadow-xl">
                    <h1 className="text-3xl md:text-5xl font-black tracking-tight text-zinc-900 dark:text-zinc-100">
                        Trade Natural Gas with Real-Time Intelligence
                    </h1>
                    <p className="mt-4 text-zinc-600 dark:text-zinc-300 max-w-3xl">
                        Monitor EIA storage prints, NOAA weather shifts, NYMEX and MCX parity, and actionable forecast signals in one terminal.
                    </p>
                    <div className="mt-8 flex flex-wrap items-center gap-3">
                        <Link href="/dashboard" className="px-5 py-2.5 rounded-md bg-sky-500 hover:bg-sky-600 text-white font-bold">
                            Open Dashboard
                        </Link>
                        <Link href="/forecaster" className="px-5 py-2.5 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-bold dark:bg-zinc-700 dark:hover:bg-zinc-600">
                            View Forecaster
                        </Link>
                        <Link href="/signals" className="px-5 py-2.5 rounded-md bg-violet-600 hover:bg-violet-700 text-white font-bold">
                            Signal Bot
                        </Link>
                    </div>
                </div>
            </section>

            <section id="about" className="max-w-[1200px] mx-auto px-4 md:px-8 pb-20">
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/40 p-6 md:p-8">
                    <h2 className="text-xl md:text-2xl font-black text-zinc-900 dark:text-zinc-100">About NatGasPulse</h2>
                    <p className="mt-3 text-zinc-600 dark:text-zinc-300">
                        NatGasPulse combines market, weather, and storage analytics to support data-driven natural gas decision workflows.
                    </p>
                </div>
            </section>
        </main>
    );
}
