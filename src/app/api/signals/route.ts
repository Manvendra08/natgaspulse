import { NextResponse } from 'next/server';
import {
    analyzeTimeframe,
    computeOverallSignal,
    determineMarketCondition,
    generateFuturesSetup,
    generateSummary
} from '@/lib/utils/signal-engine';
import { generateOptionsRecommendations } from '@/lib/utils/options-advisor';
import { getOptionChainAnalysis } from '@/lib/utils/option-chain-provider';
import { fetchRupeezyOptionChain } from '@/lib/utils/rupeezy-option-chain';
import { fetchMoneycontrolMcxSnapshot } from '@/lib/utils/moneycontrol-mcx';
import type { CandleData, Timeframe, SignalBotResponse } from '@/lib/types/signals';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type PriceSource = 'Rupeezy Active Future' | 'Moneycontrol Structured' | 'MCX Official' | 'Derived (NYMEX * USDINR)';

interface ActiveFutureSnapshot {
    symbol: string;
    ltp: number;
    previousClose: number | null;
    change: number | null;
    changePercent: number | null;
}

async function fetchCandles(symbol: string, interval: string, range: string): Promise<CandleData[]> {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
        throw new Error(`Yahoo fetch failed (${interval}/${range}): ${res.status}`);
    }

    const payload = await res.json();
    const result = payload?.chart?.result?.[0];
    if (!result?.timestamp || !result?.indicators?.quote?.[0]) {
        return [];
    }

    const ts: number[] = result.timestamp;
    const q = result.indicators.quote[0];
    const candles: CandleData[] = [];

    for (let i = 0; i < ts.length; i++) {
        if (q.open[i] == null || q.close[i] == null) {
            continue;
        }

        candles.push({
            time: ts[i],
            open: q.open[i],
            high: q.high[i] ?? q.open[i],
            low: q.low[i] ?? q.open[i],
            close: q.close[i],
            volume: q.volume?.[i] ?? 0
        });
    }

    return candles;
}

function aggregateTo3H(candles1H: CandleData[]): CandleData[] {
    const result: CandleData[] = [];
    const startIndex = candles1H.length % 3;
    for (let i = startIndex; i < candles1H.length; i += 3) {
        const chunk = candles1H.slice(i, i + 3);
        if (chunk.length < 3) {
            continue;
        }
        result.push({
            time: chunk[0].time,
            open: chunk[0].open,
            high: Math.max(...chunk.map((c) => c.high)),
            low: Math.min(...chunk.map((c) => c.low)),
            close: chunk[chunk.length - 1].close,
            volume: chunk.reduce((sum, c) => sum + c.volume, 0)
        });
    }
    return result;
}

async function fetchUsdInrRate(): Promise<number> {
    try {
        const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD', {
            cache: 'no-store'
        });
        if (!response.ok) {
            return 84.5;
        }
        const data = await response.json();
        return Number(data?.rates?.INR) || 84.5;
    } catch {
        return 84.5;
    }
}

async function fetchActiveFutureSnapshot(): Promise<ActiveFutureSnapshot | null> {
    try {
        const chain = await fetchRupeezyOptionChain({
            exchange: 'MCX',
            underlying: 'NATURALGAS',
            maxStrikes: 6
        });

        if (!Number.isFinite(chain.futureLtp) || (chain.futureLtp ?? 0) <= 0) {
            return null;
        }

        const previousClose = Number.isFinite(chain.futureClose) && (chain.futureClose ?? 0) > 0
            ? (chain.futureClose as number)
            : null;
        const changeFromClose = previousClose != null
            ? (chain.futureLtp as number) - previousClose
            : null;
        const change = changeFromClose ?? chain.futureChange ?? null;
        const changePercent = previousClose != null
            ? (((chain.futureLtp as number) - previousClose) / previousClose) * 100
            : chain.futureChangePercent ?? null;

        return {
            symbol: chain.futureSymbol || 'NATURALGAS',
            ltp: chain.futureLtp as number,
            previousClose,
            change,
            changePercent
        };
    } catch {
        return null;
    }
}

async function tryFetchOfficialMpxSnapshot(): Promise<number | null> {
    const endpoints = [
        {
            url: 'https://dhan.co/commodity/natural-gas-futures-summary/',
            parser: (html: string) => {
                const compact = html.replace(/\s+/g, ' ');
                const match = compact.match(/Natural\s*Gas.*?(\d{3,}\.\d{2})/i);
                return match ? Number(match[1]) : null;
            }
        },
        {
            url: 'https://www.mcxindia.com/market-data/market-watch',
            parser: (html: string) => {
                const compact = html.replace(/\s+/g, ' ');
                const match = compact.match(/Natural\s*Gas[\s\S]{0,300}?([0-9]+(?:\.[0-9]+)?)/i);
                return match ? Number(match[1]) : null;
            }
        }
    ];

    for (const { url, parser } of endpoints) {
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
                    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9'
                },
                cache: 'no-store'
            });

            if (!response.ok) {
                continue;
            }

            const html = await response.text();
            const price = parser(html);
            if (price && Number.isFinite(price) && price > 100) {
                return price;
            }
        } catch {
            // Best-effort only.
        }
    }

    return null;
}

function convertToMcx(candles: CandleData[], usdinr: number, premium: number): CandleData[] {
    return candles.map((c) => ({
        ...c,
        open: c.open * usdinr + premium,
        high: c.high * usdinr + premium,
        low: c.low * usdinr + premium,
        close: c.close * usdinr + premium
    }));
}

function injectLatestPrice(candles: CandleData[], livePrice: number | null): CandleData[] {
    if (!candles.length || !Number.isFinite(livePrice) || (livePrice ?? 0) <= 0) {
        return candles;
    }

    const copied = candles.map((item) => ({ ...item }));
    const idx = copied.length - 1;
    copied[idx].close = livePrice as number;
    copied[idx].high = Math.max(copied[idx].high, livePrice as number);
    copied[idx].low = Math.min(copied[idx].low, livePrice as number);
    return copied;
}

export async function GET() {
    try {
        const [candles1H, candles1D, candles1W, candles1M, usdinr, activeSnapshot, moneycontrolSnapshot, officialMcxPrice] = await Promise.all([
            fetchCandles('NG=F', '1h', '60d'),
            fetchCandles('NG=F', '1d', '2y'),
            fetchCandles('NG=F', '1wk', '5y'),
            fetchCandles('NG=F', '1mo', '10y'),
            fetchUsdInrRate(),
            fetchActiveFutureSnapshot(),
            fetchMoneycontrolMcxSnapshot(),
            tryFetchOfficialMpxSnapshot()
        ]);

        if (!candles1H.length || !candles1D.length || !candles1W.length || !candles1M.length) {
            throw new Error('Insufficient candle data to generate signal');
        }

        const lastNymex = candles1H[candles1H.length - 1].close;
        const anchorPrice = activeSnapshot?.ltp ?? moneycontrolSnapshot?.lastPrice ?? officialMcxPrice ?? null;

        let source: PriceSource = 'Derived (NYMEX * USDINR)';
        let premium = 24;

        if (anchorPrice && Number.isFinite(lastNymex) && lastNymex > 0) {
            const impliedPremium = anchorPrice - (lastNymex * usdinr);
            if (Number.isFinite(impliedPremium) && impliedPremium > -200 && impliedPremium < 300) {
                premium = impliedPremium;
                source = activeSnapshot
                    ? 'Rupeezy Active Future'
                    : moneycontrolSnapshot
                        ? 'Moneycontrol Structured'
                        : 'MCX Official';
            }
        }

        let mcx1H = convertToMcx(candles1H, usdinr, premium);
        let mcx1D = convertToMcx(candles1D, usdinr, premium);
        let mcx1W = convertToMcx(candles1W, usdinr, premium);
        let mcx1M = convertToMcx(candles1M, usdinr, premium);

        mcx1H = injectLatestPrice(mcx1H, anchorPrice);
        mcx1D = injectLatestPrice(mcx1D, anchorPrice);
        mcx1W = injectLatestPrice(mcx1W, anchorPrice);
        mcx1M = injectLatestPrice(mcx1M, anchorPrice);

        const mcx3H = aggregateTo3H(mcx1H);
        const currentPrice = anchorPrice && Number.isFinite(anchorPrice)
            ? anchorPrice
            : mcx1H[mcx1H.length - 1].close;
        const previousClose = activeSnapshot?.previousClose
            ?? moneycontrolSnapshot?.previousClose
            ?? (mcx1D.length > 1 ? mcx1D[mcx1D.length - 2].close : null);

        const tfMap: Array<{ timeframe: Timeframe; candles: CandleData[]; periodOpen: number }> = [
            {
                timeframe: '1H',
                candles: mcx1H,
                periodOpen: mcx1H[mcx1H.length - 1]?.open || currentPrice
            },
            {
                timeframe: '3H',
                candles: mcx3H,
                periodOpen: mcx3H[mcx3H.length - 1]?.open || currentPrice
            },
            {
                timeframe: '1D',
                candles: mcx1D,
                periodOpen: mcx1D[mcx1D.length - 1]?.open || currentPrice
            },
            {
                timeframe: '1W',
                candles: mcx1W,
                periodOpen: mcx1W[mcx1W.length - 1]?.open || currentPrice
            },
            {
                timeframe: '1M',
                candles: mcx1M,
                periodOpen: mcx1M[mcx1M.length - 1]?.open || currentPrice
            }
        ];

        const timeframeSignals = tfMap
            .map(({ timeframe, candles, periodOpen }) => analyzeTimeframe(timeframe, candles, {
                periodOpen,
                currentClose: currentPrice
            }))
            .filter((tf) => tf.candleCount > 0);

        if (!timeframeSignals.length) {
            throw new Error('Timeframe analysis unavailable');
        }

        const computedLiveChange = previousClose != null ? currentPrice - previousClose : null;
        const computedLiveChangePercent = previousClose != null && previousClose > 0
            ? ((currentPrice - previousClose) / previousClose) * 100
            : null;
        const liveChange = computedLiveChange ?? activeSnapshot?.change ?? moneycontrolSnapshot?.change ?? undefined;
        const liveChangePercent = computedLiveChangePercent ?? activeSnapshot?.changePercent ?? moneycontrolSnapshot?.changePercent ?? undefined;
        const { signal, score, confidence } = computeOverallSignal(timeframeSignals, liveChangePercent);

        const dailyTF = timeframeSignals.find((t) => t.timeframe === '1D') || timeframeSignals[0];
        const marketCondition = determineMarketCondition(dailyTF, liveChangePercent);
        const recommendedTfs: Timeframe[] = ['1H', '3H', '1D', '1W', '1M'];
        const futuresSetups = recommendedTfs
            .map((tf) => timeframeSignals.find((signalTf) => signalTf.timeframe === tf))
            .filter((tf): tf is typeof timeframeSignals[number] => Boolean(tf))
            .map((tf) => generateFuturesSetup(tf, signal))
            .filter((setup): setup is NonNullable<typeof setup> => Boolean(setup));
        const futuresSetup = futuresSetups.find((setup) => setup.timeframe === '1D') || futuresSetups[0] || null;

        const optionChainAnalysis = await getOptionChainAnalysis(currentPrice);

        const optionsRecommendations = generateOptionsRecommendations(
            currentPrice,
            dailyTF.indicators,
            signal,
            marketCondition,
            optionChainAnalysis
        );

        const summary = generateSummary(
            signal,
            confidence,
            score,
            marketCondition,
            timeframeSignals,
            liveChangePercent
        );

        const response: SignalBotResponse = {
            timestamp: new Date().toISOString(),
            currentPrice,
            activeContract: activeSnapshot?.symbol || moneycontrolSnapshot?.contractMonth || 'NATURALGAS',
            previousClose: previousClose ?? undefined,
            overallSignal: signal,
            overallConfidence: confidence,
            overallScore: score,
            timeframes: timeframeSignals,
            futuresSetup,
            futuresSetups,
            optionsRecommendations,
            marketCondition,
            summary,
            dataSource: source,
            liveChange,
            liveChangePercent,
            marketStats: {
                openInterest: moneycontrolSnapshot?.openInterest,
                volume: moneycontrolSnapshot?.volume,
                bid: moneycontrolSnapshot?.bid,
                ask: moneycontrolSnapshot?.ask,
                asOf: moneycontrolSnapshot?.asOf
            },
            optionChainAnalysis
        };

        return NextResponse.json(response, {
            status: 200,
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
            }
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Signal engine error';
        console.error('Signal API error:', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
