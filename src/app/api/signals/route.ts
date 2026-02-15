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
import type { CandleData, Timeframe, SignalBotResponse } from '@/lib/types/signals';

// ─── Yahoo Finance helpers ─────────────────────────────────────

async function fetchCandles(symbol: string, interval: string, range: string): Promise<CandleData[]> {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) throw new Error(`Yahoo fetch failed (${interval}/${range}): ${res.status}`);

    const payload = await res.json();
    const result = payload?.chart?.result?.[0];
    if (!result?.timestamp || !result?.indicators?.quote?.[0]) return [];

    const ts: number[] = result.timestamp;
    const q = result.indicators.quote[0];
    const candles: CandleData[] = [];

    for (let i = 0; i < ts.length; i++) {
        if (q.open[i] == null || q.close[i] == null) continue;
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

/** Aggregate 1H candles into 3H candles */
function aggregateTo3H(candles1H: CandleData[]): CandleData[] {
    const result: CandleData[] = [];
    for (let i = 0; i < candles1H.length; i += 3) {
        const chunk = candles1H.slice(i, i + 3);
        if (chunk.length === 0) continue;
        result.push({
            time: chunk[0].time,
            open: chunk[0].open,
            high: Math.max(...chunk.map(c => c.high)),
            low: Math.min(...chunk.map(c => c.low)),
            close: chunk[chunk.length - 1].close,
            volume: chunk.reduce((s, c) => s + c.volume, 0)
        });
    }
    return result;
}

// ─── Route handler ─────────────────────────────────────────────

async function fetchUsdInrRate() {
    try {
        const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD', {
            next: { revalidate: 3600 }
        });
        if (!response.ok) return 84.50; // Fallback
        const data = await response.json();
        return Number(data?.rates?.INR) || 84.50;
    } catch {
        return 84.50;
    }
}

async function tryFetchOfficialMpxSnapshot(): Promise<number | null> {
    const endpoints = [
        // Dhan (Usually accessible)
        {
            url: 'https://dhan.co/commodity/natural-gas-futures-summary/',
            parser: (html: string) => {
                const compact = html.replace(/\s+/g, ' ');
                // Dhan scraper match based on test script
                const match = compact.match(/Natural\s*Gas.*?(\d{3,}\.\d{2})/i);
                return match ? Number(match[1]) : null;
            }
        },
        // MCX Official (Often blocked by WAF)
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
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Referer': 'https://www.google.com/'
                },
                next: { revalidate: 60 }
            });

            if (!response.ok) continue;

            const html = await response.text();
            const price = parser(html);

            if (price && !Number.isNaN(price) && price > 100) {
                return price;
            }
        } catch (e) {
            console.warn(`Scraping failed for ${url}`, e);
        }
    }
    return null;
}

function convertToMcx(candles: CandleData[], usdinr: number, premium: number): CandleData[] {
    // Apply dynamic premium to shift NYMEX candles to Match MCX Official Price
    return candles.map(c => ({
        ...c,
        open: c.open * usdinr + premium,
        high: c.high * usdinr + premium,
        low: c.low * usdinr + premium,
        close: c.close * usdinr + premium
    }));
}

export async function GET() {
    try {
        // Fetch all timeframes & USDINR & MCX Official in parallel
        const [candles1H, candles1D, candles1W, candles1M, usdinr, officialMcxPrice] = await Promise.all([
            fetchCandles('NG=F', '1h', '30d'),
            fetchCandles('NG=F', '1d', '1y'),
            fetchCandles('NG=F', '1wk', '5y'),
            fetchCandles('NG=F', '1mo', '10y'),
            fetchUsdInrRate(),
            tryFetchOfficialMpxSnapshot()
        ]);

        // Calculate Real Premium based on Live MCX Price
        let premium = 24; // Default
        let source: 'MCX Official' | 'Derived (NYMEX * USDINR)' = 'Derived (NYMEX * USDINR)';

        if (officialMcxPrice && candles1H.length > 0) {
            const lastNymex = candles1H[candles1H.length - 1].close;
            // Premium = Official - (NYMEX * Rate)
            const impliedPremium = officialMcxPrice - (lastNymex * usdinr);
            // Sanity check: Premium should be reasonable (e.g. 10-50 INR). 
            // If it's wild (fetching error?), ignore.
            if (impliedPremium > 0 && impliedPremium < 100) {
                premium = impliedPremium;
                source = 'MCX Official';
            }
        }

        // Convert NYMEX candles using the Real Premium
        const mcx1H = convertToMcx(candles1H, usdinr, premium);
        const mcx1D = convertToMcx(candles1D, usdinr, premium);
        const mcx1W = convertToMcx(candles1W, usdinr, premium);
        const mcx1M = convertToMcx(candles1M, usdinr, premium);

        // Aggregate 1H to 3H (using converted candles)
        const mcx3H = aggregateTo3H(mcx1H);

        // Map of timeframes to their candle data
        const tfMap: [Timeframe, CandleData[]][] = [
            ['1H', mcx1H],
            ['3H', mcx3H],
            ['1D', mcx1D],
            ['1W', mcx1W],
            ['1M', mcx1M]
        ];

        // Analyze each timeframe (now interacting with INR prices)
        const timeframeSignals = tfMap.map(([tf, candles]) => analyzeTimeframe(tf, candles));

        // Overall verdict
        const { signal, score, confidence } = computeOverallSignal(timeframeSignals);

        // Get daily TF for market condition & futures setup
        const dailyTF = timeframeSignals.find(t => t.timeframe === '1D') || timeframeSignals[0];
        const marketCondition = determineMarketCondition(dailyTF);
        const futuresSetup = generateFuturesSetup(dailyTF, signal);

        // Fetch & Analyze Option Chain
        // Use the most accurate price we have (dailyTF.lastPrice is the MCX-adjusted price)
        const optionChainAnalysis = await getOptionChainAnalysis(dailyTF.lastPrice);

        // Options advice with Chain Analysis
        const optionsRecommendations = generateOptionsRecommendations(
            dailyTF.lastPrice,
            dailyTF.indicators,
            signal,
            marketCondition,
            optionChainAnalysis
        );

        const summary = generateSummary(signal, confidence, score, marketCondition, timeframeSignals);

        const response: SignalBotResponse = {
            timestamp: new Date().toISOString(),
            currentPrice: dailyTF.lastPrice,
            overallSignal: signal,
            overallConfidence: confidence,
            overallScore: score,
            timeframes: timeframeSignals,
            futuresSetup,
            optionsRecommendations,
            marketCondition,
            summary: source === 'MCX Official' ? `(Source: MCX Official) ${summary}` : summary,
            dataSource: source as 'MCX Official' | 'Derived (NYMEX * USDINR)',
            optionChainAnalysis // Include in response
        };

        return NextResponse.json(response, { status: 200 });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Signal engine error';
        console.error('Signal API error:', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
