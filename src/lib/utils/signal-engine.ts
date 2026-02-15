/**
 * Multi-Timeframe Signal Engine for Natural Gas Trading
 * 
 * Combines 8 technical indicators across 5 timeframes with weighted confluence scoring.
 * Reuses RSI, SMA, EMA, MACD, Bollinger, Stochastic from existing technical.ts
 */

import {
    calculateRSI,
    calculateEMA,
    calculateMACD,
    calculateBollingerBands,
    calculateStochastic
} from './technical';

import type {
    CandleData,
    IndicatorValues,
    IndicatorSignal,
    TimeframeSignal,
    FuturesSetup,
    SignalDirection,
    Confidence,
    Timeframe
} from '@/lib/types/signals';

// ─── New Indicators (not in technical.ts) ──────────────────────

/** Average True Range (ATR) */
export function calculateATR(highs: number[], lows: number[], closes: number[], period: number = 14): number[] {
    const atr: number[] = new Array(closes.length).fill(null);
    if (closes.length < 2) return atr;

    const tr: number[] = [highs[0] - lows[0]];
    for (let i = 1; i < closes.length; i++) {
        tr.push(Math.max(
            highs[i] - lows[i],
            Math.abs(highs[i] - closes[i - 1]),
            Math.abs(lows[i] - closes[i - 1])
        ));
    }

    // First ATR is SMA of TR
    let sum = 0;
    for (let i = 0; i < period; i++) sum += tr[i];
    atr[period - 1] = sum / period;

    // Wilder's smoothing
    for (let i = period; i < tr.length; i++) {
        atr[i] = (atr[i - 1]! * (period - 1) + tr[i]) / period;
    }
    return atr;
}

/** Average Directional Index (ADX) with +DI and -DI */
export function calculateADX(
    highs: number[], lows: number[], closes: number[], period: number = 14
): { adx: number[]; plusDI: number[]; minusDI: number[] } {
    const len = closes.length;
    const adx: number[] = new Array(len).fill(null);
    const plusDI: number[] = new Array(len).fill(null);
    const minusDI: number[] = new Array(len).fill(null);

    if (len < period + 1) return { adx, plusDI, minusDI };

    // True Range, +DM, -DM
    const tr: number[] = [0];
    const plusDM: number[] = [0];
    const minusDM: number[] = [0];

    for (let i = 1; i < len; i++) {
        tr.push(Math.max(
            highs[i] - lows[i],
            Math.abs(highs[i] - closes[i - 1]),
            Math.abs(lows[i] - closes[i - 1])
        ));
        const upMove = highs[i] - highs[i - 1];
        const downMove = lows[i - 1] - lows[i];
        plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
        minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    }

    // Wilder smoothing for ATR14, +DM14, -DM14
    let smoothTR = 0, smoothPlusDM = 0, smoothMinusDM = 0;
    for (let i = 1; i <= period; i++) {
        smoothTR += tr[i];
        smoothPlusDM += plusDM[i];
        smoothMinusDM += minusDM[i];
    }

    const calcDI = (smoothDM: number, sTR: number) => sTR === 0 ? 0 : (smoothDM / sTR) * 100;

    plusDI[period] = calcDI(smoothPlusDM, smoothTR);
    minusDI[period] = calcDI(smoothMinusDM, smoothTR);

    const dxValues: number[] = [];
    const calcDX = (pDI: number, mDI: number) => {
        const sum = pDI + mDI;
        return sum === 0 ? 0 : (Math.abs(pDI - mDI) / sum) * 100;
    };
    dxValues.push(calcDX(plusDI[period]!, minusDI[period]!));

    for (let i = period + 1; i < len; i++) {
        smoothTR = smoothTR - smoothTR / period + tr[i];
        smoothPlusDM = smoothPlusDM - smoothPlusDM / period + plusDM[i];
        smoothMinusDM = smoothMinusDM - smoothMinusDM / period + minusDM[i];

        plusDI[i] = calcDI(smoothPlusDM, smoothTR);
        minusDI[i] = calcDI(smoothMinusDM, smoothTR);
        dxValues.push(calcDX(plusDI[i]!, minusDI[i]!));
    }

    // ADX = SMA of DX for `period` values
    if (dxValues.length >= period) {
        let dxSum = 0;
        for (let i = 0; i < period; i++) dxSum += dxValues[i];
        adx[2 * period - 1] = dxSum / period;

        for (let i = 2 * period; i < len; i++) {
            const dxIdx = i - period;
            adx[i] = (adx[i - 1]! * (period - 1) + dxValues[dxIdx]) / period;
        }
    }

    return { adx, plusDI, minusDI };
}

/** Pivot Points (Standard) from last completed candle's H, L, C */
export function calculatePivotPoints(high: number, low: number, close: number) {
    const pp = (high + low + close) / 3;
    return {
        pivot: pp,
        r1: 2 * pp - low,
        r2: pp + (high - low),
        r3: high + 2 * (pp - low),
        s1: 2 * pp - high,
        s2: pp - (high - low),
        s3: low - 2 * (high - pp)
    };
}

/** Volume Weighted Average Price (simplified for daily) */
export function calculateVWAP(highs: number[], lows: number[], closes: number[], volumes: number[]): number[] {
    const vwap: number[] = [];
    let cumulativeTPV = 0;
    let cumulativeVol = 0;

    for (let i = 0; i < closes.length; i++) {
        const typicalPrice = (highs[i] + lows[i] + closes[i]) / 3;
        const vol = volumes[i] || 1;
        cumulativeTPV += typicalPrice * vol;
        cumulativeVol += vol;
        vwap.push(cumulativeVol === 0 ? typicalPrice : cumulativeTPV / cumulativeVol);
    }
    return vwap;
}

// ─── Indicator Analysis ────────────────────────────────────────

function computeAllIndicators(candles: CandleData[]): IndicatorValues {
    if (candles.length < 3) {
        return emptyIndicators();
    }

    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const volumes = candles.map(c => c.volume);
    const last = candles.length - 1;

    // RSI
    const rsiArr = calculateRSI(closes, 14);
    const rsi = rsiArr[last] || null;

    // EMA 20, 50
    const ema20Arr = calculateEMA(closes, 20);
    const ema50Arr = calculateEMA(closes, 50);
    const ema20 = ema20Arr[last];
    const ema50 = ema50Arr[last];

    // MACD
    const macd = calculateMACD(closes);
    const macdLine = macd.macd[last] ?? null;
    const macdSignal = macd.signal[last] ?? null;
    const macdHistogram = macd.histogram[last] ?? null;

    // Stochastic
    const stoch = calculateStochastic(highs, lows, closes);
    const stochK = stoch.k[last] ?? null;
    const stochD = stoch.d[last] ?? null;

    // Bollinger Bands
    const bb = calculateBollingerBands(closes);
    const bbLast = bb[last] || { upper: null, middle: null, lower: null };

    // ADX
    const adxData = calculateADX(highs, lows, closes);
    const adx = adxData.adx[last] ?? null;
    const plusDI = adxData.plusDI[last] ?? null;
    const minusDI = adxData.minusDI[last] ?? null;

    // ATR
    const atrArr = calculateATR(highs, lows, closes);
    const atr = atrArr[last] ?? null;

    // VWAP
    const vwapArr = calculateVWAP(highs, lows, closes, volumes);
    const vwap = vwapArr[last] ?? null;

    // Pivot Points (from previous candle)
    const prevIdx = Math.max(0, last - 1);
    const pivots = calculatePivotPoints(highs[prevIdx], lows[prevIdx], closes[prevIdx]);

    return {
        rsi,
        macdLine,
        macdSignal,
        macdHistogram,
        ema20,
        ema50,
        stochK,
        stochD,
        bollingerUpper: bbLast.upper,
        bollingerMiddle: bbLast.middle,
        bollingerLower: bbLast.lower,
        adx,
        plusDI,
        minusDI,
        atr,
        vwap,
        pivotPoint: pivots.pivot,
        pivotR1: pivots.r1,
        pivotR2: pivots.r2,
        pivotR3: pivots.r3,
        pivotS1: pivots.s1,
        pivotS2: pivots.s2,
        pivotS3: pivots.s3
    };
}

function emptyIndicators(): IndicatorValues {
    return {
        rsi: null, macdLine: null, macdSignal: null, macdHistogram: null,
        ema20: null, ema50: null, stochK: null, stochD: null,
        bollingerUpper: null, bollingerMiddle: null, bollingerLower: null,
        adx: null, plusDI: null, minusDI: null, atr: null, vwap: null,
        pivotPoint: null, pivotR1: null, pivotR2: null, pivotR3: null,
        pivotS1: null, pivotS2: null, pivotS3: null
    };
}

// ─── Per-Indicator Signal Generation ───────────────────────────

function generateIndicatorSignals(ind: IndicatorValues, lastPrice: number): IndicatorSignal[] {
    const signals: IndicatorSignal[] = [];

    // RSI
    if (ind.rsi !== null) {
        let sig: SignalDirection = 'HOLD';
        let desc = `RSI at ${ind.rsi.toFixed(1)}`;
        if (ind.rsi < 30) { sig = 'BUY'; desc += ' — Oversold, potential reversal up'; }
        else if (ind.rsi > 70) { sig = 'SELL'; desc += ' — Overbought, potential reversal down'; }
        else if (ind.rsi < 45) { sig = 'BUY'; desc += ' — Recovering from oversold zone'; }
        else if (ind.rsi > 55) { sig = 'SELL'; desc += ' — Approaching overbought zone'; }
        else { desc += ' — Neutral zone'; }
        signals.push({ name: 'RSI(14)', value: ind.rsi, signal: sig, description: desc });
    }

    // MACD
    if (ind.macdLine !== null && ind.macdSignal !== null) {
        const diff = ind.macdLine - ind.macdSignal;
        let sig: SignalDirection = 'HOLD';
        let desc = `MACD: ${ind.macdLine.toFixed(4)}`;
        if (diff > 0 && ind.macdHistogram !== null && ind.macdHistogram > 0) {
            sig = 'BUY'; desc += ' — Bullish crossover, histogram rising';
        } else if (diff < 0 && ind.macdHistogram !== null && ind.macdHistogram < 0) {
            sig = 'SELL'; desc += ' — Bearish crossover, histogram falling';
        } else { desc += ' — Near signal line, indecisive'; }
        signals.push({ name: 'MACD', value: ind.macdLine, signal: sig, description: desc });
    }

    // EMA Cross
    if (ind.ema20 !== null && ind.ema50 !== null) {
        let sig: SignalDirection = 'HOLD';
        let desc = `EMA20: ${ind.ema20.toFixed(3)}, EMA50: ${ind.ema50.toFixed(3)}`;
        if (ind.ema20 > ind.ema50) { sig = 'BUY'; desc += ' — Golden cross (bullish)'; }
        else if (ind.ema20 < ind.ema50) { sig = 'SELL'; desc += ' — Death cross (bearish)'; }
        signals.push({ name: 'EMA(20/50)', value: ind.ema20, signal: sig, description: desc });
    }

    // Stochastic
    if (ind.stochK !== null && ind.stochD !== null) {
        let sig: SignalDirection = 'HOLD';
        let desc = `%K: ${ind.stochK.toFixed(1)}, %D: ${ind.stochD.toFixed(1)}`;
        if (ind.stochK < 20 && ind.stochK > ind.stochD) {
            sig = 'BUY'; desc += ' — Oversold crossover up';
        } else if (ind.stochK > 80 && ind.stochK < ind.stochD) {
            sig = 'SELL'; desc += ' — Overbought crossover down';
        } else if (ind.stochK < 30) { sig = 'BUY'; desc += ' — Near oversold'; }
        else if (ind.stochK > 70) { sig = 'SELL'; desc += ' — Near overbought'; }
        signals.push({ name: 'Stochastic', value: ind.stochK, signal: sig, description: desc });
    }

    // Bollinger Bands
    if (ind.bollingerUpper !== null && ind.bollingerLower !== null && ind.bollingerMiddle !== null) {
        const range = ind.bollingerUpper - ind.bollingerLower;
        const pos = range > 0 ? (lastPrice - ind.bollingerLower) / range : 0.5;
        let sig: SignalDirection = 'HOLD';
        let desc = `Price at ${(pos * 100).toFixed(0)}% of band`;
        if (pos < 0.15) { sig = 'BUY'; desc += ' — Near lower band, oversold'; }
        else if (pos > 0.85) { sig = 'SELL'; desc += ' — Near upper band, overbought'; }
        else if (pos < 0.35) { sig = 'BUY'; desc += ' — Lower half, potential bounce'; }
        else if (pos > 0.65) { sig = 'SELL'; desc += ' — Upper half, potential pullback'; }
        signals.push({ name: 'Bollinger', value: pos * 100, signal: sig, description: desc });
    }

    // VWAP
    if (ind.vwap !== null) {
        let sig: SignalDirection = 'HOLD';
        let desc = `VWAP: ${ind.vwap.toFixed(3)}`;
        if (lastPrice > ind.vwap * 1.002) { sig = 'BUY'; desc += ' — Price above VWAP (bullish)'; }
        else if (lastPrice < ind.vwap * 0.998) { sig = 'SELL'; desc += ' — Price below VWAP (bearish)'; }
        else { desc += ' — Price at VWAP'; }
        signals.push({ name: 'VWAP', value: ind.vwap, signal: sig, description: desc });
    }

    // Pivot Points
    if (ind.pivotPoint !== null && ind.pivotR1 !== null && ind.pivotS1 !== null) {
        let sig: SignalDirection = 'HOLD';
        let desc = `Pivot: ${ind.pivotPoint.toFixed(3)}`;
        if (lastPrice > ind.pivotR1) { sig = 'BUY'; desc += ` — Above R1 (${ind.pivotR1.toFixed(3)}), strong bullish`; }
        else if (lastPrice < ind.pivotS1!) { sig = 'SELL'; desc += ` — Below S1 (${ind.pivotS1!.toFixed(3)}), strong bearish`; }
        else if (lastPrice > ind.pivotPoint) { sig = 'BUY'; desc += ' — Above pivot, mild bullish'; }
        else { sig = 'SELL'; desc += ' — Below pivot, mild bearish'; }
        signals.push({ name: 'Pivot Points', value: ind.pivotPoint, signal: sig, description: desc });
    }

    return signals;
}

// ─── Score Aggregation ─────────────────────────────────────────

const INDICATOR_WEIGHTS: Record<string, number> = {
    'RSI(14)': 0.15,
    'MACD': 0.20,
    'EMA(20/50)': 0.20,
    'Stochastic': 0.10,
    'Bollinger': 0.10,
    'VWAP': 0.10,
    'Pivot Points': 0.15
};

function computeBiasScore(signals: IndicatorSignal[]): number {
    let weightedSum = 0;
    let totalWeight = 0;

    for (const s of signals) {
        const w = INDICATOR_WEIGHTS[s.name] || 0.1;
        const val = s.signal === 'BUY' ? 1 : s.signal === 'SELL' ? -1 : 0;
        weightedSum += val * w;
        totalWeight += w;
    }

    return totalWeight === 0 ? 0 : Math.round((weightedSum / totalWeight) * 100);
}

function scoreToBias(score: number): SignalDirection {
    if (score >= 25) return 'BUY';
    if (score <= -25) return 'SELL';
    return 'HOLD';
}

// ─── Timeframe Weights ─────────────────────────────────────────

const TIMEFRAME_WEIGHTS: Record<Timeframe, number> = {
    '1M': 0.05,
    '1W': 0.15,
    '1D': 0.35,
    '3H': 0.25,
    '1H': 0.20
};

// ─── Public API ────────────────────────────────────────────────

/** Analyse a single timeframe's candles and return signals */
export function analyzeTimeframe(timeframe: Timeframe, candles: CandleData[]): TimeframeSignal {
    const lastCandle = candles[candles.length - 1];
    const prevCandle = candles.length > 1 ? candles[candles.length - 2] : lastCandle;
    const lastPrice = lastCandle?.close || 0;
    const priceChange = lastPrice - (prevCandle?.close || lastPrice);
    const priceChangePercent = prevCandle?.close ? (priceChange / prevCandle.close) * 100 : 0;

    const indicators = computeAllIndicators(candles);
    const signals = generateIndicatorSignals(indicators, lastPrice);
    const biasScore = computeBiasScore(signals);

    return {
        timeframe,
        bias: scoreToBias(biasScore),
        biasScore,
        indicators,
        signals,
        lastPrice,
        priceChange,
        priceChangePercent,
        candleCount: candles.length
    };
}

/** Combine all timeframe signals into overall score */
export function computeOverallSignal(
    timeframeSignals: TimeframeSignal[]
): { signal: SignalDirection; score: number; confidence: Confidence } {
    let weightedSum = 0;
    let totalWeight = 0;

    for (const tf of timeframeSignals) {
        const w = TIMEFRAME_WEIGHTS[tf.timeframe] || 0.1;
        weightedSum += tf.biasScore * w;
        totalWeight += w;
    }

    const score = totalWeight === 0 ? 0 : Math.round(weightedSum / totalWeight);
    const signal = scoreToBias(score);

    // Confidence = agreement across timeframes
    const agreeing = timeframeSignals.filter(tf => tf.bias === signal).length;
    const ratio = agreeing / Math.max(timeframeSignals.length, 1);
    let confidence: Confidence = 'LOW';
    if (ratio >= 0.7 && Math.abs(score) >= 40) confidence = 'HIGH';
    else if (ratio >= 0.5 && Math.abs(score) >= 20) confidence = 'MEDIUM';

    return { signal, score, confidence };
}

/** Determine market condition from ADX */
export function determineMarketCondition(
    dailySignal: TimeframeSignal
): 'TRENDING' | 'RANGING' | 'VOLATILE' {
    const adx = dailySignal.indicators.adx;
    const atr = dailySignal.indicators.atr;
    const bb = dailySignal.indicators.bollingerUpper !== null && dailySignal.indicators.bollingerLower !== null
        ? dailySignal.indicators.bollingerUpper - dailySignal.indicators.bollingerLower
        : null;

    if (adx !== null && adx > 25) return 'TRENDING';
    if (atr !== null && bb !== null && atr > bb * 0.3) return 'VOLATILE';
    return 'RANGING';
}

/** Generate futures trade setup */
export function generateFuturesSetup(
    dailySignal: TimeframeSignal,
    overallDirection: SignalDirection
): FuturesSetup | null {
    if (overallDirection === 'HOLD') return null;

    const price = dailySignal.lastPrice;
    const atr = dailySignal.indicators.atr || price * 0.02;
    const ind = dailySignal.indicators;

    if (overallDirection === 'BUY') {
        const entry = price;
        const sl = Math.max(
            price - 1.5 * atr,
            ind.pivotS1 !== null ? ind.pivotS1 - 0.01 : price - 1.5 * atr
        );
        const target1 = ind.pivotR1 !== null ? ind.pivotR1 : price + 1.5 * atr;
        const target2 = ind.pivotR2 !== null ? ind.pivotR2 : price + 2.5 * atr;
        const risk = entry - sl;
        const rr = risk > 0 ? (target1 - entry) / risk : 0;

        return {
            direction: 'BUY',
            entry: round4(entry),
            stopLoss: round4(sl),
            target1: round4(target1),
            target2: round4(target2),
            riskRewardRatio: Math.round(rr * 100) / 100,
            atrValue: round4(atr),
            rationale: buildFuturesRationale(dailySignal, 'BUY')
        };
    } else {
        const entry = price;
        const sl = Math.min(
            price + 1.5 * atr,
            ind.pivotR1 !== null ? ind.pivotR1 + 0.01 : price + 1.5 * atr
        );
        const target1 = ind.pivotS1 !== null ? ind.pivotS1 : price - 1.5 * atr;
        const target2 = ind.pivotS2 !== null ? ind.pivotS2 : price - 2.5 * atr;
        const risk = sl - entry;
        const rr = risk > 0 ? (entry - target1) / risk : 0;

        return {
            direction: 'SELL',
            entry: round4(entry),
            stopLoss: round4(sl),
            target1: round4(target1),
            target2: round4(target2),
            riskRewardRatio: Math.round(rr * 100) / 100,
            atrValue: round4(atr),
            rationale: buildFuturesRationale(dailySignal, 'SELL')
        };
    }
}

function buildFuturesRationale(tf: TimeframeSignal, dir: SignalDirection): string {
    const parts: string[] = [];
    for (const s of tf.signals) {
        if (s.signal === dir) parts.push(`${s.name}: ${s.description}`);
    }
    return parts.length > 0 ? parts.slice(0, 3).join(' | ') : `${dir} signal from multi-indicator confluence`;
}

/** Generate summary text */
export function generateSummary(
    overallSignal: SignalDirection,
    confidence: Confidence,
    score: number,
    condition: string,
    timeframes: TimeframeSignal[]
): string {
    const bullishTFs = timeframes.filter(t => t.bias === 'BUY').map(t => t.timeframe).join(', ');
    const bearishTFs = timeframes.filter(t => t.bias === 'SELL').map(t => t.timeframe).join(', ');
    const dir = overallSignal === 'BUY' ? 'BULLISH' : overallSignal === 'SELL' ? 'BEARISH' : 'NEUTRAL';

    let text = `Overall ${dir} bias (score: ${score}) with ${confidence} confidence. Market is ${condition.toLowerCase()}.`;
    if (bullishTFs) text += ` Bullish on: ${bullishTFs}.`;
    if (bearishTFs) text += ` Bearish on: ${bearishTFs}.`;
    return text;
}

function round4(n: number): number {
    return Math.round(n * 10000) / 10000;
}
