import { NextResponse } from 'next/server';
import { fetchHenryHubPrices } from '@/lib/api-clients/eia';
import type { McxPublicDataResponse, McxPricePoint } from '@/lib/types/mcx';
import { fetchRupeezyOptionChain } from '@/lib/utils/rupeezy-option-chain';
import { fetchMoneycontrolMcxSnapshot } from '@/lib/utils/moneycontrol-mcx';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type YahooCandle = {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
};

interface ActiveFutureSnapshot {
    symbol: string;
    ltp: number;
    previousClose: number | null;
    change: number | null;
    changePercent: number | null;
    asOf: string;
}

interface TradingViewSnapshot {
    symbol: string;
    ltp: number;
    change: number | null;
    changePercent: number | null;
    asOf: string;
}

interface McxMonthSnapshot {
    contract: string;
    price: number;
    change: number;
    changePercent: number;
    asOf: string;
}

interface DerivedNymexMonthSnapshot {
    price: number;
    change: number;
    changePercent: number;
    asOf: string;
}

function toFixedNumber(value: number, digits: number = 2) {
    return Number(value.toFixed(digits));
}

function subtractBusinessDays(source: Date, count: number): Date {
    const date = new Date(source.getTime());
    let remaining = Math.max(0, count);
    while (remaining > 0) {
        date.setUTCDate(date.getUTCDate() - 1);
        const day = date.getUTCDay();
        if (day !== 0 && day !== 6) {
            remaining -= 1;
        }
    }
    return date;
}

// Source: https://groww.in/blog/natural-gas-futures-and-options-expiry
const GROWW_NATURAL_GAS_FUTURES_2026: number[] = [27, 24, 26, 27, 26, 25, 28, 26, 25, 27, 24, 28];
const GROWW_NATURAL_GAS_OPTIONS_2026: Array<number | null> = [22, 20, null, null, null, null, null, null, null, null, null, null];

function toIsoAtNoonUtc(year: number, monthIndex: number, day: number): string {
    return new Date(Date.UTC(year, monthIndex, day, 12, 0, 0)).toISOString();
}

function buildGrowwCalendar2026() {
    const result: Array<{ contract: string; expiryDate: string; expiryType: 'FUT' | 'OPT' }> = [];

    for (let contractMonth = 0; contractMonth < 12; contractMonth++) {
        const contract = new Date(Date.UTC(2026, contractMonth, 1)).toLocaleDateString('en-US', {
            month: 'short',
            year: 'numeric',
            timeZone: 'UTC'
        });

        result.push({
            contract,
            expiryDate: toIsoAtNoonUtc(2026, contractMonth, GROWW_NATURAL_GAS_FUTURES_2026[contractMonth]),
            expiryType: 'FUT'
        });

        const optionsDay = GROWW_NATURAL_GAS_OPTIONS_2026[contractMonth];
        if (optionsDay != null) {
            result.push({
                contract,
                expiryDate: toIsoAtNoonUtc(2026, contractMonth, optionsDay),
                expiryType: 'OPT'
            });
        }
    }

    return result;
}

function buildExpiryCalendarForYear(contractYear: number) {
    if (contractYear === 2026) {
        return buildGrowwCalendar2026();
    }

    const result: Array<{ contract: string; expiryDate: string; expiryType: 'FUT' | 'OPT' }> = [];

    for (let contractMonth = 0; contractMonth < 12; contractMonth++) {
        const monthAfterContractStarts = new Date(Date.UTC(contractYear, contractMonth + 1, 1));
        const futuresExpiry = subtractBusinessDays(monthAfterContractStarts, 4);
        const optionsExpiry = subtractBusinessDays(futuresExpiry, 2);
        const contract = new Date(Date.UTC(contractYear, contractMonth, 1)).toLocaleDateString('en-US', {
            month: 'short',
            year: 'numeric',
            timeZone: 'UTC'
        });

        result.push({
            contract,
            expiryDate: new Date(Date.UTC(
                futuresExpiry.getUTCFullYear(),
                futuresExpiry.getUTCMonth(),
                futuresExpiry.getUTCDate(),
                12,
                0,
                0
            )).toISOString(),
            expiryType: 'FUT'
        });
        result.push({
            contract,
            expiryDate: new Date(Date.UTC(
                optionsExpiry.getUTCFullYear(),
                optionsExpiry.getUTCMonth(),
                optionsExpiry.getUTCDate(),
                12,
                0,
                0
            )).toISOString(),
            expiryType: 'OPT'
        });
    }

    return result;
}

async function fetchUsdInrRate() {
    try {
        const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD', {
            next: { revalidate: 900 }
        });
        if (!response.ok) return 83.5;
        const data = await response.json();
        return Number(data?.rates?.INR) || 83.5;
    } catch {
        return 83.5;
    }
}

async function fetchYahooCandles(symbol: string, range: string, interval: string): Promise<YahooCandle[]> {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
    const response = await fetch(url, { next: { revalidate: 300 } });
    if (!response.ok) throw new Error(`Yahoo fetch failed: ${response.status}`);

    const payload = await response.json();
    const result = payload?.chart?.result?.[0];
    if (!result || !result.timestamp || !result.indicators?.quote?.[0]) return [];

    const timestamps: number[] = result.timestamp;
    const quote = result.indicators.quote[0];
    const open: Array<number | null> = quote.open || [];
    const high: Array<number | null> = quote.high || [];
    const low: Array<number | null> = quote.low || [];
    const close: Array<number | null> = quote.close || [];
    const volume: Array<number | null> = quote.volume || [];

    const candles: YahooCandle[] = [];
    for (let i = 0; i < timestamps.length; i++) {
        if (open[i] == null || high[i] == null || low[i] == null || close[i] == null) continue;
        candles.push({
            time: timestamps[i],
            open: open[i] as number,
            high: high[i] as number,
            low: low[i] as number,
            close: close[i] as number,
            volume: (volume[i] as number) || 0
        });
    }

    return candles;
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
            changePercent,
            asOf: chain.fetchedAt
        };
    } catch {
        return null;
    }
}

async function tryFetchOfficialMpxSnapshot() {
    const endpoints = [
        'https://www.mcxindia.com/market-data/market-watch',
        'https://www.mcxindia.com'
    ];

    for (const endpoint of endpoints) {
        try {
            const response = await fetch(endpoint, {
                method: 'GET',
                headers: {
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36',
                    accept: 'text/html,application/xhtml+xml,application/xml'
                },
                cache: 'no-store'
            });

            if (!response.ok) continue;

            const html = await response.text();
            const compact = html.replace(/\s+/g, ' ');
            const match = compact.match(/Natural\s*Gas[\s\S]{0,250}?([0-9]+(?:\.[0-9]+)?)/i);
            if (match) {
                const parsed = Number(match[1]);
                if (!Number.isNaN(parsed) && parsed > 0) {
                    return parsed;
                }
            }
        } catch {
            // Best-effort only. If blocked by anti-bot, fallback is used.
        }
    }

    return null;
}

function buildFallbackMcxSeries(candles: YahooCandle[], usdinr: number, premiumSeed: number = 24): McxPricePoint[] {
    const result: McxPricePoint[] = [];
    let previousOi = 22000;

    for (let i = 0; i < candles.length; i++) {
        const item = candles[i];
        const premium = premiumSeed + Math.sin(i / 19) * 1.2 + Math.cos(i / 7) * 0.5;

        const open = toFixedNumber(item.open * usdinr + premium, 2);
        const high = toFixedNumber(item.high * usdinr + premium, 2);
        const low = toFixedNumber(item.low * usdinr + premium, 2);
        const close = toFixedNumber(item.close * usdinr + premium, 2);

        const scaledVolume = Math.max(100, Math.round(item.volume / 250));
        const oiDelta = Math.round((scaledVolume - 600) / 12 + (close - open) * 4);
        const openInterest = Math.max(5000, previousOi + oiDelta);
        const settlement = toFixedNumber((high + low + close) / 3, 2);

        result.push({
            date: new Date(item.time * 1000).toISOString(),
            open,
            high: Math.max(high, open, close),
            low: Math.min(low, open, close),
            close,
            settlement,
            volume: scaledVolume,
            openInterest,
            oiChange: openInterest - previousOi
        });

        previousOi = openInterest;
    }

    return result;
}

function inferPremiumSeed(referencePrice: number | null, nymexPrice: number | null, usdinr: number): number {
    if (!referencePrice || !nymexPrice || !Number.isFinite(referencePrice) || !Number.isFinite(nymexPrice) || usdinr <= 0) {
        return 24;
    }

    const implied = referencePrice - (nymexPrice * usdinr);
    if (!Number.isFinite(implied) || implied < -200 || implied > 300) {
        return 24;
    }

    return implied;
}

function alignLatestWithReferencePrice(rows: McxPricePoint[], referencePrice: number | null): McxPricePoint[] {
    if (!rows.length || !referencePrice || !Number.isFinite(referencePrice) || referencePrice <= 0) {
        return rows;
    }

    const copy = rows.map((row) => ({ ...row }));
    const lastIdx = copy.length - 1;
    const last = copy[lastIdx];
    last.close = toFixedNumber(referencePrice, 2);
    last.high = Math.max(last.high, last.close, last.open);
    last.low = Math.min(last.low, last.close, last.open);
    last.settlement = toFixedNumber((last.high + last.low + last.close) / 3, 2);
    copy[lastIdx] = last;
    return copy;
}

async function fetchTradingViewActiveSnapshot(): Promise<TradingViewSnapshot | null> {
    try {
        const response = await fetch('https://scanner.tradingview.com/global/scan', {
            method: 'POST',
            cache: 'no-store',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            body: JSON.stringify({
                symbols: {
                    tickers: ['MCX:NATURALGAS1!'],
                    query: { types: [] }
                },
                columns: ['close', 'change', 'change_abs', 'name']
            })
        });

        if (!response.ok) {
            return null;
        }

        const payload = await response.json() as {
            data?: Array<{ s?: string; d?: unknown[] }>;
        };
        const row = payload?.data?.[0];
        const values = row?.d || [];

        const ltp = Number(values[0]);
        const changePercent = Number(values[1]);
        const change = Number(values[2]);

        if (!Number.isFinite(ltp) || ltp <= 0) {
            return null;
        }

        return {
            symbol: String(row?.s || 'MCX:NATURALGAS1!'),
            ltp,
            change: Number.isFinite(change) ? change : null,
            changePercent: Number.isFinite(changePercent) ? changePercent : null,
            asOf: new Date().toISOString()
        };
    } catch {
        return null;
    }
}

function normalizeScaledPrice(value: unknown): number {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return 0;
    return num > 5000 ? num / 100 : num;
}

function toExpiryTs(value: unknown): number {
    const digits = String(value ?? '').replace(/\D/g, '');
    if (digits.length !== 8) return Number.MAX_SAFE_INTEGER;
    const date = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}T00:00:00Z`;
    const ts = new Date(date).getTime();
    return Number.isFinite(ts) ? ts : Number.MAX_SAFE_INTEGER;
}

function formatContractLabel(expiryTs: number): string {
    if (!Number.isFinite(expiryTs) || expiryTs === Number.MAX_SAFE_INTEGER) {
        return 'MCX Contract';
    }
    return new Date(expiryTs).toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC'
    });
}

function getFutureMonthLabelFromIso(value: string): string {
    const ts = new Date(value).getTime();
    if (!Number.isFinite(ts)) return 'MCX Active';
    return new Date(ts).toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC'
    });
}

function buildDerivedNymexMonthSnapshot(
    intradayCandles: YahooCandle[],
    usdinr: number,
    premiumSeed: number
): DerivedNymexMonthSnapshot | null {
    if (!intradayCandles.length || usdinr <= 0 || !Number.isFinite(premiumSeed)) {
        return null;
    }

    const current = intradayCandles[intradayCandles.length - 1];
    const previous = intradayCandles[intradayCandles.length - 2] || current;

    const currentMcxProxy = toFixedNumber((current.close * usdinr) + premiumSeed, 2);
    const previousMcxProxy = toFixedNumber((previous.close * usdinr) + premiumSeed, 2);
    const change = toFixedNumber(currentMcxProxy - previousMcxProxy, 2);
    const changePercent = previousMcxProxy > 0
        ? toFixedNumber((change / previousMcxProxy) * 100, 2)
        : 0;

    return {
        price: currentMcxProxy,
        change,
        changePercent,
        asOf: new Date(current.time * 1000).toISOString()
    };
}

async function fetchRupeezyMonthSnapshots(underlying: string): Promise<{ active: McxMonthSnapshot | null; next: McxMonthSnapshot | null }> {
    try {
        const response = await fetch('https://cms.rupeezy.in/flow/api/v1/commondities', {
            cache: 'no-store',
            headers: {
                Accept: 'application/json',
                'User-Agent': 'Mozilla/5.0'
            }
        });
        if (!response.ok) {
            return { active: null, next: null };
        }

        const payload = (await response.json()) as Array<{
            symbol?: string;
            expiry_date?: string | number;
            ltp?: number;
            close?: number;
            percentage_change?: number;
        }>;
        const rows = (payload || [])
            .filter((row) => String(row.symbol || '').toUpperCase() === underlying.toUpperCase())
            .map((row) => {
                const expiryTs = toExpiryTs(row.expiry_date);
                const price = normalizeScaledPrice(row.ltp);
                const close = normalizeScaledPrice(row.close);
                const pct = Number(row.percentage_change);
                const fallbackChangePercent = Number.isFinite(pct) ? pct : 0;
                const changePercent = close > 0
                    ? ((price - close) / close) * 100
                    : fallbackChangePercent;
                const change = close > 0
                    ? price - close
                    : (price * changePercent) / 100;

                return {
                    expiryTs,
                    contract: formatContractLabel(expiryTs),
                    price: toFixedNumber(price, 2),
                    change: toFixedNumber(change, 2),
                    changePercent: toFixedNumber(changePercent, 2),
                    asOf: new Date().toISOString()
                };
            })
            .filter((row) => row.price > 0)
            .sort((a, b) => a.expiryTs - b.expiryTs);

        if (!rows.length) {
            return { active: null, next: null };
        }

        const now = Date.now();
        const activeIdx = rows.findIndex((row) => row.expiryTs >= now - 24 * 60 * 60 * 1000);
        const normalizedActiveIdx = activeIdx >= 0 ? activeIdx : 0;

        const active = rows[normalizedActiveIdx] || null;
        const next = rows[normalizedActiveIdx + 1] || null;

        return {
            active: active
                ? {
                    contract: active.contract,
                    price: active.price,
                    change: active.change,
                    changePercent: active.changePercent,
                    asOf: active.asOf
                }
                : null,
            next: next
                ? {
                    contract: next.contract,
                    price: next.price,
                    change: next.change,
                    changePercent: next.changePercent,
                    asOf: next.asOf
                }
                : null
        };
    } catch {
        return { active: null, next: null };
    }
}

function getRange(queryRange: string | null) {
    const supported = new Set(['6mo', '1y', '2y', '5y', '10y']);
    if (!queryRange || !supported.has(queryRange)) return '5y';
    return queryRange;
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const range = getRange(searchParams.get('range'));
    const expiryYear = Number(searchParams.get('expiryYear') || new Date().getUTCFullYear());
    const effectiveExpiryYear = Number.isFinite(expiryYear) ? Math.max(2020, Math.min(expiryYear, 2100)) : new Date().getUTCFullYear();

    try {
        const [usdinr, dailyCandles, intradayCandles, nextMonthIntradayCandles, activeFuture, tradingViewActive, moneycontrolSnapshot, officialPrice, eiaData, monthSnapshots] = await Promise.all([
            fetchUsdInrRate(),
            fetchYahooCandles('NG=F', range, '1d'),
            fetchYahooCandles('NG=F', '5d', '5m'),
            fetchYahooCandles('NGJ26.NYM', '5d', '5m').catch(() => []),
            fetchActiveFutureSnapshot(),
            fetchTradingViewActiveSnapshot(),
            fetchMoneycontrolMcxSnapshot(),
            tryFetchOfficialMpxSnapshot(),
            fetchHenryHubPrices(520).catch(() => []),
            fetchRupeezyMonthSnapshots('NATURALGAS')
        ]);

        if (dailyCandles.length < 5) {
            throw new Error('Insufficient market history');
        }

        const quotePoint = intradayCandles.length > 4 ? intradayCandles[intradayCandles.length - 4] : intradayCandles[intradayCandles.length - 1];
        const nymexReference = quotePoint?.close || dailyCandles[dailyCandles.length - 1].close;
        const referencePrice = activeFuture?.ltp ?? tradingViewActive?.ltp ?? moneycontrolSnapshot?.lastPrice ?? officialPrice ?? null;
        const premiumSeed = inferPremiumSeed(referencePrice, nymexReference, usdinr);

        let historical = buildFallbackMcxSeries(dailyCandles, usdinr, premiumSeed);
        historical = alignLatestWithReferencePrice(historical, referencePrice);

        const latest = historical[historical.length - 1];
        const previous = historical[historical.length - 2] || latest;

        const fallbackLast = toFixedNumber(nymexReference * usdinr + premiumSeed, 2);
        const delayedLast = activeFuture?.ltp ?? tradingViewActive?.ltp ?? moneycontrolSnapshot?.lastPrice ?? officialPrice ?? fallbackLast;
        const dayClose = (activeFuture?.previousClose ?? moneycontrolSnapshot?.previousClose) || previous.close;
        const delayedChange = toFixedNumber(delayedLast - dayClose, 2);
        const delayedPct = dayClose === 0
            ? '0.00'
            : ((delayedChange / dayClose) * 100).toFixed(2);
        const delayedAsOf = activeFuture?.asOf || tradingViewActive?.asOf || moneycontrolSnapshot?.asOf || (quotePoint ? new Date(quotePoint.time * 1000).toISOString() : latest.date);
        const provider = activeFuture
            ? 'rupeezy-active-future'
            : tradingViewActive
                ? 'tradingview-scanner'
                : moneycontrolSnapshot
                    ? 'moneycontrol-scrape'
                    : officialPrice !== null
                        ? 'mcx-official'
                        : 'fallback-yahoo';
        const delayedByMinutes = provider === 'rupeezy-active-future'
            ? 0
            : provider === 'tradingview-scanner'
                ? 1
                : provider === 'moneycontrol-scrape'
                    ? 10
                    : 15;

        const fallbackActiveContract = getFutureMonthLabelFromIso(activeFuture?.asOf || delayedAsOf);
        const fallbackActiveChange = activeFuture?.change ?? tradingViewActive?.change ?? delayedChange;
        const fallbackActiveChangePct = activeFuture?.changePercent ?? tradingViewActive?.changePercent ?? Number(delayedPct);
        const activeMonth = monthSnapshots.active || {
            contract: fallbackActiveContract,
            price: delayedLast,
            change: toFixedNumber(fallbackActiveChange || 0, 2),
            changePercent: toFixedNumber(fallbackActiveChangePct || 0, 2),
            asOf: delayedAsOf
        };

        const nextMonthDerived = buildDerivedNymexMonthSnapshot(nextMonthIntradayCandles, usdinr, premiumSeed);
        const nextMonth = monthSnapshots.next || (nextMonthDerived
            ? {
                contract: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1)).toLocaleDateString('en-US', {
                    month: 'short',
                    year: 'numeric',
                    timeZone: 'UTC'
                }),
                price: nextMonthDerived.price,
                change: nextMonthDerived.change,
                changePercent: nextMonthDerived.changePercent,
                asOf: nextMonthDerived.asOf
            }
            : null);

        const response: McxPublicDataResponse = {
            sourceStatus: {
                officialAvailable: activeFuture !== null || tradingViewActive !== null || moneycontrolSnapshot !== null || officialPrice !== null,
                provider,
                delayedByMinutes,
                lastSyncAt: new Date().toISOString(),
                message: provider === 'rupeezy-active-future'
                    ? `Active month future reference pulled from ${activeFuture?.symbol || 'NATURALGAS'} feed.`
                    : provider === 'tradingview-scanner'
                        ? `TradingView scanner fallback for ${tradingViewActive?.symbol || 'MCX:NATURALGAS1!'} active contract used for near-real-time MCX quote${monthSnapshots.next ? '' : '; next-month derived from NGJ26.NYM parity model.'}`
                        : provider === 'moneycontrol-scrape'
                            ? 'Moneycontrol structured payload parsed for MCX live price and market depth.'
                            : provider === 'mcx-official'
                                ? 'MCX public page parsed successfully for delayed quote.'
                                : 'MCX official endpoint blocked/unavailable from server network. Fallback model derived from free public NG=F data.'
            },
            usdinr: toFixedNumber(usdinr, 4),
            delayedPrice: {
                lastPrice: delayedLast,
                change: delayedChange,
                changePercent: delayedPct,
                asOf: delayedAsOf,
                delayMinutes: delayedByMinutes
            },
            henryHubLive: (() => {
                const intradayPrevious = intradayCandles.length > 1
                    ? intradayCandles[intradayCandles.length - 2].close
                    : nymexReference;
                const intradayChange = toFixedNumber(nymexReference - intradayPrevious, 4);
                const intradayChangePct = intradayPrevious > 0
                    ? toFixedNumber((intradayChange / intradayPrevious) * 100, 4)
                    : 0;

                if (Number.isFinite(nymexReference) && nymexReference > 0) {
                    return {
                        price: toFixedNumber(nymexReference, 4),
                        change: intradayChange,
                        changePercent: intradayChangePct,
                        asOf: quotePoint ? new Date(quotePoint.time * 1000).toISOString() : delayedAsOf,
                        source: 'yahoo-finance-ng-f' as const
                    };
                }

                const eiaLatest = eiaData?.[0];
                const eiaPrevious = eiaData?.[1] || eiaLatest;
                const eiaPrice = Number(eiaLatest?.value || 0);
                const eiaPrevPrice = Number(eiaPrevious?.value || eiaPrice);
                const eiaChange = toFixedNumber(eiaPrice - eiaPrevPrice, 4);
                const eiaChangePct = eiaPrevPrice > 0
                    ? toFixedNumber((eiaChange / eiaPrevPrice) * 100, 4)
                    : 0;

                return {
                    price: toFixedNumber(eiaPrice, 4),
                    change: eiaChange,
                    changePercent: eiaChangePct,
                    asOf: eiaLatest?.period ? new Date(eiaLatest.period).toISOString() : delayedAsOf,
                    source: 'eia-futures-daily' as const
                };
            })(),
            moneycontrolLive: {
                available: Boolean(moneycontrolSnapshot),
                price: moneycontrolSnapshot?.lastPrice ?? null,
                openInterest: moneycontrolSnapshot?.openInterest ?? null,
                volume: moneycontrolSnapshot?.volume ?? null,
                bid: moneycontrolSnapshot?.bid ?? null,
                ask: moneycontrolSnapshot?.ask ?? null,
                asOf: moneycontrolSnapshot?.asOf || null,
                sourceUrl: moneycontrolSnapshot?.sourceUrl || 'https://www.moneycontrol.com/commodity/mcx-naturalgas-price/?type=futures&exp=2026-02-24'
            },
            activeMonth,
            nextMonth,
            contractSpec: {
                symbol: 'NATURALGAS',
                contractName: 'MCX Natural Gas Futures',
                lotSize: '1250 MMBtu',
                tickSize: 'INR 0.10',
                tickValueInr: 125,
                marginRequirementPercent: 12.5,
                tradingHours: '09:00-23:30 IST (session dependent)',
                expiryRule: '2026 contract expiries mapped from Groww Natural Gas expiry calendar; other years use business-day approximation.'
            },
            expiryCalendar: buildExpiryCalendarForYear(effectiveExpiryYear),
            latestSettlement: {
                date: latest.date,
                settlementPrice: latest.settlement,
                volume: moneycontrolSnapshot?.volume || latest.volume,
                openInterest: moneycontrolSnapshot?.openInterest || latest.openInterest,
                oiChange: moneycontrolSnapshot?.openInterestChange || latest.oiChange
            },
            historical,
            eiaHenryHub: eiaData
                .slice()
                .reverse()
                .map((item) => ({
                    date: new Date(item.period).toISOString(),
                    value: Number(item.value)
                }))
        };

        return NextResponse.json(response, {
            status: 200,
            headers: {
                'Cache-Control': 'no-store, max-age=0'
            }
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to build MCX public data';
        console.error('MCX Public API error:', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
