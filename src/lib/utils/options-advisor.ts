/**
 * Options Strike Advisor for Natural Gas Trading
 * 
 * Uses ATR-based expected moves and support/resistance levels
 * to recommend option strikes for buying and selling.
 */

import type {
    IndicatorValues,
    OptionsRecommendation,
    SignalDirection,
    Confidence
} from '@/lib/types/signals';

/** MCX Natural Gas contract specs */
export const MCX_NG_SPECS = {
    lotSize: 125,           // MMBtu
    lotSizeLabel: '125 MMBtu',
    tickSize: 0.10,         // INR
    tickValue: 125,         // INR per tick per lot
    marginPercent: 12.5,
    tradingHours: '09:00–23:30 IST',
    exchange: 'MCX'
};

/** NYMEX Henry Hub contract specs */
export const NYMEX_NG_SPECS = {
    lotSize: 10000,         // MMBtu
    lotSizeLabel: '10,000 MMBtu',
    tickSize: 0.001,        // USD
    tickValue: 10,          // USD per tick per lot
    tradingHours: '18:00–17:00 ET (Sun–Fri)',
    exchange: 'NYMEX'
};

/** Round a strike to the nearest standard interval */
function roundToStrike(price: number, interval: number = 0.05): number {
    return Math.round(price / interval) * interval;
}

/** Generate options recommendations based on indicators, market condition, and option chain analysis */
export function generateOptionsRecommendations(
    currentPrice: number,
    indicators: IndicatorValues,
    overallSignal: SignalDirection,
    marketCondition: 'TRENDING' | 'RANGING' | 'VOLATILE',
    chainAnalysis?: import('@/lib/types/signals').OptionChainAnalysis
): OptionsRecommendation[] {
    const recommendations: OptionsRecommendation[] = [];
    const atr = indicators.atr || currentPrice * 0.025;
    const expectedMove = 1.5 * atr;

    // MCX Strike Step
    const STRIKE_STEP = 5;
    const roundMcx = (p: number) => Math.round(p / STRIKE_STEP) * STRIKE_STEP;

    // Helper: Format chain info if available
    const chainInfo = chainAnalysis
        ? ` (PCR: ${chainAnalysis.pcr}, MaxPain: ₹${chainAnalysis.maxPain})`
        : '';

    if (marketCondition === 'RANGING' || (indicators.adx !== null && indicators.adx < 22)) {
        // Range-bound: recommend SELLING options (premium collection)

        // Use Option Chain Resistance if available, else ATR
        const callStrikeRaw = chainAnalysis && chainAnalysis.callResistance > currentPrice
            ? chainAnalysis.callResistance
            : currentPrice + 1.5 * atr;
        const otmCallStrike = roundMcx(callStrikeRaw);

        // Use Option Chain Support if available, else ATR
        const putStrikeRaw = chainAnalysis && chainAnalysis.putSupport < currentPrice
            ? chainAnalysis.putSupport
            : currentPrice - 1.5 * atr;
        const otmPutStrike = roundMcx(putStrikeRaw);

        recommendations.push({
            action: 'SELL',
            optionType: 'CE',
            strikePrice: otmCallStrike,
            expectedMove: Math.round(expectedMove * 100) / 100,
            rationale: `Range-bound MCX market${chainInfo}. High OI Resistance at ₹${chainAnalysis?.callResistance || 'N/A'}. Sell OTM Call at ₹${otmCallStrike} — 1.5× ATR above CMP.`,
            riskLevel: 'MEDIUM'
        });

        recommendations.push({
            action: 'SELL',
            optionType: 'PE',
            strikePrice: otmPutStrike,
            expectedMove: Math.round(expectedMove * 100) / 100,
            rationale: `Range-bound. High OI Support at ₹${chainAnalysis?.putSupport || 'N/A'}. Sell OTM Put at ₹${otmPutStrike} — 1.5× ATR below CMP. Iron condor viable.`,
            riskLevel: 'MEDIUM'
        });
    }

    if (overallSignal === 'BUY') {
        // Bullish: buy CE at support, or buy near-ATM
        // If Max Pain is higher than current price, it supports bullish bias

        const atmCallStrike = roundMcx(currentPrice);
        const supportStrike = chainAnalysis ? chainAnalysis.putSupport : (indicators.pivotS1 || currentPrice - 0.5 * atr);

        const pcrBullish = chainAnalysis && chainAnalysis.pcr < 0.7 ? " (Oversold PCR supports bounce)" : "";

        recommendations.push({
            action: 'BUY',
            optionType: 'CE',
            strikePrice: atmCallStrike,
            expectedMove: Math.round(expectedMove * 100) / 100,
            rationale: `Bullish signal${chainInfo}. Buy ATM Call at ₹${atmCallStrike}. Strong OI Support at ₹${supportStrike}.${pcrBullish}`,
            riskLevel: marketCondition === 'TRENDING' ? 'HIGH' : 'MEDIUM'
        });

        // Also recommend selling a Put for premium (Bull Put Spread)
        const sellPutStrike = roundMcx(chainAnalysis?.putSupport || (currentPrice - 1.5 * atr));
        recommendations.push({
            action: 'SELL',
            optionType: 'PE',
            strikePrice: sellPutStrike,
            expectedMove: Math.round(expectedMove * 100) / 100,
            rationale: `Bullish bias. Sell OTM Put at ₹${sellPutStrike} (Major OI Support). Premium collection strategy.`,
            riskLevel: 'LOW'
        });
    } else if (overallSignal === 'SELL') {
        // Bearish: buy PE at resistance, or buy near-ATM

        const atmPutStrike = roundMcx(currentPrice);
        const resistanceStrike = chainAnalysis ? chainAnalysis.callResistance : (indicators.pivotR1 || currentPrice + 0.5 * atr);

        const pcrBearish = chainAnalysis && chainAnalysis.pcr > 1.3 ? " (Overbought PCR supports drop)" : "";

        recommendations.push({
            action: 'BUY',
            optionType: 'PE',
            strikePrice: atmPutStrike,
            expectedMove: Math.round(expectedMove * 100) / 100,
            rationale: `Bearish signal${chainInfo}. Buy ATM Put at ₹${atmPutStrike}. Strong OI Resistance at ₹${resistanceStrike}.${pcrBearish}`,
            riskLevel: marketCondition === 'TRENDING' ? 'HIGH' : 'MEDIUM'
        });

        // Also recommend selling a Call for premium (Bear Call Spread)
        const sellCallStrike = roundMcx(chainAnalysis?.callResistance || (currentPrice + 1.5 * atr));
        recommendations.push({
            action: 'SELL',
            optionType: 'CE',
            strikePrice: sellCallStrike,
            expectedMove: Math.round(expectedMove * 100) / 100,
            rationale: `Bearish bias. Sell OTM Call at ₹${sellCallStrike} (Major OI Resistance). Safe play above resistance.`,
            riskLevel: 'LOW'
        });
    }

    return recommendations;
}
