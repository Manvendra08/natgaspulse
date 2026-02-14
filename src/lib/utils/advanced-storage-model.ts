import type { PredictorSeason, StoragePredictionResult } from '@/lib/utils/storage-predictor';

export interface AdvancedPredictionInput {
    weightedHDD: number;
    weightedCDD: number;
    season: PredictorSeason;
    normalWeightedHDD: number;
    normalWeightedCDD: number;
    includesWeekend: boolean;
    henryHubPrice: number;
    lngUtilizationRate: number;
    currentStorageBcf: number;
    baseIndustrialDemand?: number;
    baseLngExportBcfPerDay?: number;
}

export interface AdvancedPredictionBreakdown {
    weatherTerm: number;
    temperatureDeviationMultiplier: number;
    weekendFactor: number;
    industrialTerm: number;
    priceFactor: number;
    lngExportTerm: number;
    lngUtilizationRate: number;
    storageLevelAdjustment: number;
}

export interface AdvancedPredictionResult extends StoragePredictionResult {
    breakdown: AdvancedPredictionBreakdown;
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function getTemperatureDeviationMultiplier(actual: number, normal: number) {
    if (normal <= 0) return 1;
    if (actual > normal * 1.2) return 1.15;
    if (actual < normal * 0.8) return 0.85;
    return 1;
}

function getPriceFactor(henryHubPrice: number) {
    if (henryHubPrice > 3.5) return 0.95;
    if (henryHubPrice < 2.0) return 1.03;
    return 1;
}

export function calculateAdvancedPrediction(input: AdvancedPredictionInput): AdvancedPredictionResult {
    const weatherIndex = input.season === 'winter' ? input.weightedHDD : input.weightedCDD;
    const normalIndex = input.season === 'winter' ? input.normalWeightedHDD : input.normalWeightedCDD;
    const weatherCoefficient = input.season === 'winter' ? 1.8 : 0.8;

    const temperatureDeviationMultiplier = getTemperatureDeviationMultiplier(weatherIndex, normalIndex);
    const weekendFactor = input.includesWeekend ? 0.85 : 1;
    const priceFactor = getPriceFactor(input.henryHubPrice);

    const normalizedUtilization = input.lngUtilizationRate > 1
        ? input.lngUtilizationRate / 100
        : input.lngUtilizationRate;
    const lngUtilizationRate = clamp(normalizedUtilization, 0, 1.25);

    const baseIndustrial = input.baseIndustrialDemand ?? 50;
    const baseLngExport = input.baseLngExportBcfPerDay ?? 13;

    const weatherTerm = (weatherIndex * weatherCoefficient) * temperatureDeviationMultiplier * weekendFactor;
    const industrialTerm = baseIndustrial * priceFactor;
    const lngExportTerm = (baseLngExport * 7) * lngUtilizationRate;

    const preStorageAdjustment = weatherTerm + industrialTerm + lngExportTerm;
    const storageLevelAdjustment = input.currentStorageBcf < 2000 ? preStorageAdjustment * 0.1 : 0;

    const predicted = preStorageAdjustment + storageLevelAdjustment;

    return {
        predicted: Number(predicted.toFixed(2)),
        confidenceLow: Number((predicted * 0.85).toFixed(2)),
        confidenceHigh: Number((predicted * 1.15).toFixed(2)),
        breakdown: {
            weatherTerm: Number(weatherTerm.toFixed(2)),
            temperatureDeviationMultiplier,
            weekendFactor,
            industrialTerm: Number(industrialTerm.toFixed(2)),
            priceFactor,
            lngExportTerm: Number(lngExportTerm.toFixed(2)),
            lngUtilizationRate: Number(lngUtilizationRate.toFixed(3)),
            storageLevelAdjustment: Number(storageLevelAdjustment.toFixed(2))
        }
    };
}

