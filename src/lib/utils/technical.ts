/**
 * Simple Technical Analysis Indicators
 */

export function calculateRSI(prices: number[], period: number = 14): number[] {
    if (prices.length < period + 1) return Array(prices.length).fill(0);

    const rsi = new Array(prices.length).fill(0);
    let gains = 0;
    let losses = 0;

    // First period
    for (let i = 1; i <= period; i++) {
        const diff = prices[i] - prices[i - 1];
        if (diff >= 0) gains += diff;
        else losses += Math.abs(diff);
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    if (avgLoss === 0) {
        rsi[period] = 100;
    } else {
        rsi[period] = 100 - 100 / (1 + avgGain / avgLoss);
    }

    // Subsequent periods
    for (let i = period + 1; i < prices.length; i++) {
        const diff = prices[i] - prices[i - 1];
        const gain = diff >= 0 ? diff : 0;
        const loss = diff < 0 ? Math.abs(diff) : 0;

        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;

        if (avgLoss === 0) {
            rsi[i] = 100;
        } else {
            rsi[i] = 100 - 100 / (1 + avgGain / avgLoss);
        }
    }

    return rsi;
}

export function calculateSMA(prices: number[], period: number): number[] {
    const sma = new Array(prices.length).fill(0); // Use 0 for initial nulls if needed, or null
    // Actually, keeping null might break some consumers, but charts prefer null.
    // Let's use null but array init with fill(0) is typed number[].
    // Improved:
    const result = [];
    for (let i = 0; i < period - 1; i++) result.push(null);

    for (let i = period - 1; i < prices.length; i++) {
        const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
        result.push(sum / period);
    }
    return result as any[];
}

export function calculateBollingerBands(prices: number[], period: number = 20, multiplier: number = 2) {
    const sma = calculateSMA(prices, period);
    const bands = [];

    for (let i = 0; i < prices.length; i++) {
        if (i < period - 1) {
            bands.push({ upper: null, middle: null, lower: null });
            continue;
        }

        const mean = sma[i];
        if (mean === null) { // Should not happen if loop logic matches
            bands.push({ upper: null, middle: null, lower: null });
            continue;
        }

        // Variance
        const slice = prices.slice(i - period + 1, i + 1);
        const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
        const stdDev = Math.sqrt(variance);

        bands.push({
            upper: mean + multiplier * stdDev,
            middle: mean,
            lower: mean - multiplier * stdDev
        });
    }
    return bands;
}
export function calculateEMA(prices: number[], period: number): number[] {
    const k = 2 / (period + 1);
    const ema = new Array(prices.length).fill(null);
    if (prices.length === 0) return ema;

    // First EMA is SMA
    let sum = 0;
    for (let i = 0; i < period; i++) sum += prices[i];
    ema[period - 1] = sum / period;

    for (let i = period; i < prices.length; i++) {
        ema[i] = (prices[i] - ema[i - 1]) * k + ema[i - 1];
    }
    return ema;
}

export function calculateMACD(prices: number[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9) {
    const fastEma = calculateEMA(prices, fastPeriod);
    const slowEma = calculateEMA(prices, slowPeriod);

    const macdLine = [];
    for (let i = 0; i < prices.length; i++) {
        if (fastEma[i] === null || slowEma[i] === null) {
            macdLine.push(null);
        } else {
            macdLine.push(fastEma[i] - slowEma[i]);
        }
    }

    const validMacdLine = macdLine.filter(val => val !== null) as number[];
    const signalEma = calculateEMA(validMacdLine, signalPeriod);

    // Align signal line back with original prices array
    const signalLine = new Array(macdLine.length - validMacdLine.length).fill(null).concat(signalEma);

    const histogram = [];
    for (let i = 0; i < macdLine.length; i++) {
        const m = macdLine[i];
        const s = signalLine[i];
        if (m === null || s === null) {
            histogram.push(null);
        } else {
            histogram.push(m - s);
        }
    }

    return {
        macd: macdLine,
        signal: signalLine,
        histogram: histogram
    };
}

export function calculateStochastic(
    highs: number[],
    lows: number[],
    closes: number[],
    kPeriod: number = 14,
    dPeriod: number = 3
) {
    const kValues: Array<number | null> = new Array(closes.length).fill(null);

    for (let i = kPeriod - 1; i < closes.length; i++) {
        const windowHigh = Math.max(...highs.slice(i - kPeriod + 1, i + 1));
        const windowLow = Math.min(...lows.slice(i - kPeriod + 1, i + 1));
        const range = windowHigh - windowLow;

        if (range === 0) {
            kValues[i] = 50;
            continue;
        }

        kValues[i] = ((closes[i] - windowLow) / range) * 100;
    }

    const dValues: Array<number | null> = new Array(closes.length).fill(null);
    for (let i = 0; i < closes.length; i++) {
        if (i < kPeriod - 1 + dPeriod - 1) continue;
        const window = kValues.slice(i - dPeriod + 1, i + 1).filter((v): v is number => v !== null);
        if (window.length === dPeriod) {
            dValues[i] = window.reduce((sum, v) => sum + v, 0) / dPeriod;
        }
    }

    return { k: kValues, d: dValues };
}

export function calculateFibonacciRetracement(high: number, low: number) {
    const diff = high - low;
    return [
        { label: '0.0%', value: high },
        { label: '23.6%', value: high - diff * 0.236 },
        { label: '38.2%', value: high - diff * 0.382 },
        { label: '50.0%', value: high - diff * 0.5 },
        { label: '61.8%', value: high - diff * 0.618 },
        { label: '78.6%', value: high - diff * 0.786 },
        { label: '100.0%', value: low }
    ];
}
