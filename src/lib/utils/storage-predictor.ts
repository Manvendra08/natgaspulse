export type PredictorSeason = 'winter' | 'summer';

export interface RegionalDegreeInput {
    east: number;
    midwest: number;
    south: number;
    west: number;
    mountain: number;
}

export interface StoragePredictionResult {
    predicted: number;
    confidenceLow: number;
    confidenceHigh: number;
}

export type PredictorSentiment = 'highly_bullish' | 'bullish' | 'neutral' | 'bearish';

export interface AverageComparisonResult {
    deviationPercent: number;
    sentiment: PredictorSentiment;
}

const REGIONAL_WEIGHTS: RegionalDegreeInput = {
    east: 0.35,
    midwest: 0.3,
    south: 0.2,
    west: 0.1,
    mountain: 0.05
};

export function calculateWeightedHDD(regionData: RegionalDegreeInput): number {
    const weighted =
        regionData.east * REGIONAL_WEIGHTS.east +
        regionData.midwest * REGIONAL_WEIGHTS.midwest +
        regionData.south * REGIONAL_WEIGHTS.south +
        regionData.west * REGIONAL_WEIGHTS.west +
        regionData.mountain * REGIONAL_WEIGHTS.mountain;

    return Number(weighted.toFixed(2));
}

export function resolveSeason(date: Date = new Date()): PredictorSeason {
    const month = date.getMonth() + 1;
    return month >= 11 || month <= 3 ? 'winter' : 'summer';
}

export function predictStorageChange(weightedHDD: number, season: PredictorSeason): StoragePredictionResult {
    const predicted =
        season === 'winter'
            ? weightedHDD * 1.8 + 50 + 13
            : weightedHDD * 0.8 + 35 + 15;

    const confidenceLow = predicted * 0.85;
    const confidenceHigh = predicted * 1.15;

    return {
        predicted: Number(predicted.toFixed(2)),
        confidenceLow: Number(confidenceLow.toFixed(2)),
        confidenceHigh: Number(confidenceHigh.toFixed(2))
    };
}

export function compareToAverage(predicted: number, historicalAvg: number): AverageComparisonResult {
    if (!Number.isFinite(historicalAvg) || historicalAvg === 0) {
        return { deviationPercent: 0, sentiment: 'neutral' };
    }

    const deviationPercent = ((predicted - historicalAvg) / historicalAvg) * 100;

    let sentiment: PredictorSentiment = 'neutral';
    if (deviationPercent >= 20) sentiment = 'highly_bullish';
    else if (deviationPercent >= 8) sentiment = 'bullish';
    else if (deviationPercent <= -12) sentiment = 'bearish';

    return {
        deviationPercent: Number(deviationPercent.toFixed(2)),
        sentiment
    };
}

export function getAccuracyScore(predictions: number[], actuals: number[]): number {
    if (!predictions.length || !actuals.length) return 0;

    const sampleSize = Math.min(predictions.length, actuals.length);
    let errorSum = 0;
    let validCount = 0;

    for (let i = 0; i < sampleSize; i++) {
        const actual = actuals[i];
        const predicted = predictions[i];
        if (!Number.isFinite(actual) || actual === 0 || !Number.isFinite(predicted)) continue;
        errorSum += Math.abs((actual - predicted) / actual);
        validCount++;
    }

    if (!validCount) return 0;

    const mape = errorSum / validCount;
    const accuracy = Math.max(0, 100 - mape * 100);
    return Number(accuracy.toFixed(2));
}

