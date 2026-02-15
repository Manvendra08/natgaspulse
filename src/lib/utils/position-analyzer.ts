/**
 * Position Analysis & Adjustment Recommendation Engine
 */

import type { ZerodhaPosition } from '@/lib/api-clients/zerodha';
import { calculateGreeks, type Greeks } from './greeks';
import { parseOptionSymbol, getYearsToExpiry } from './symbol-parser';
import { fetchGreeksForPositions, type PublicOptionGreeks } from './public-option-greeks';

export interface PositionAnalysis {
    symbol: string;
    quantity: number;
    quantityUnits: number;
    numberOfLots: number;
    lotSize: number;
    instrumentType: 'OPTION' | 'FUTURE' | 'OTHER';
    avgPrice: number;
    ltp: number;
    pnl: number;
    pnlPercent: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    greeks?: Greeks;
    isITM?: boolean;
    recommendations: AdjustmentRecommendation[];
}

export interface PortfolioAnalysis {
    netDelta: number;
    netTheta: number;
    dayDecay: number;
    recommendations: string[];
}

export interface AdjustmentRecommendation {
    action: 'HOLD' | 'ADD' | 'REDUCE' | 'EXIT' | 'HEDGE' | 'ROLL';
    reason: string;
    urgency: 'LOW' | 'MEDIUM' | 'HIGH';
    suggestedQuantity?: number;
    targetPrice?: number;
}

export interface MarketCondition {
    trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    volatility: 'LOW' | 'MEDIUM' | 'HIGH';
    rsi?: number;
    atr?: number;
    underlyingPrice?: number;
}

export interface AnalyzedPortfolio {
    positions: PositionAnalysis[];
    portfolio: PortfolioAnalysis;
}

const NAT_GAS_LOT_SIZES: Array<{ prefix: string; lotSize: number }> = [
    { prefix: 'NATGASMICRO', lotSize: 25 },
    { prefix: 'NATGASMINI', lotSize: 250 },
    { prefix: 'NATGAS', lotSize: 125 },
    { prefix: 'NATURALGASMICRO', lotSize: 25 },
    { prefix: 'NATURALGASMINI', lotSize: 250 },
    { prefix: 'NATURALGAS', lotSize: 125 }
];
const DEFAULT_NAT_GAS_LOT_SIZE = 125;
const IST_OFFSET_MINUTES = 5.5 * 60;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Analyze positions and generate adjustment recommendations.
 */
export async function analyzePositions(
    positions: ZerodhaPosition[],
    marketCondition: MarketCondition
): Promise<AnalyzedPortfolio> {
    const activePositions = positions.filter((pos) => pos.quantity !== 0);

    // Pull publicly available strike delta/theta when available.
    let publicGreeksBySymbol = new Map<string, PublicOptionGreeks>();
    try {
        publicGreeksBySymbol = await fetchGreeksForPositions(
            activePositions.map((pos) => pos.tradingsymbol)
        );
    } catch (error) {
        console.warn('Public option greek fetch failed, using fallback model:', error);
    }

    const analyzedPositions = activePositions.map((pos) =>
        analyzePosition(pos, marketCondition, publicGreeksBySymbol.get(pos.tradingsymbol))
    );

    let netDelta = 0;
    let netTheta = 0;

    analyzedPositions.forEach((pos) => {
        if (pos.instrumentType === 'FUTURE') {
            // Futures: delta is +/- lot size per lot, theta is always zero.
            netDelta += pos.numberOfLots * pos.lotSize;
            return;
        }

        if (pos.instrumentType !== 'OPTION' || !pos.greeks) {
            return;
        }

        // User formulas:
        // overall Theta = per-contract Theta * number of lots
        // Delta = option Delta * number of lots * lot size
        netTheta += pos.greeks.theta * pos.numberOfLots;
        netDelta += pos.greeks.delta * pos.numberOfLots * pos.lotSize;
    });

    // Decay = Theta * days till next market open (9 AM IST).
    const daysToNextOpen = getDaysToNextMarketOpenIST();
    const dayDecay = netTheta * daysToNextOpen;

    const portfolioRecs: string[] = [];
    const NET_DELTA_THRESHOLD = 500;

    if (Math.abs(netDelta) > NET_DELTA_THRESHOLD) {
        if (netDelta > 0) {
            portfolioRecs.push(`High Positive Delta (+${netDelta.toFixed(0)}). Portfolio is Long biased. Consider selling Calls or buying Puts to neutralize.`);
        } else {
            portfolioRecs.push(`High Negative Delta (${netDelta.toFixed(0)}). Portfolio is Short biased. Consider selling Puts or buying Calls to neutralize.`);
        }
    } else {
        portfolioRecs.push(`Portfolio Delta is balanced (${netDelta.toFixed(0)}). Good for neutral strategy.`);
    }

    if (dayDecay > 0) {
        portfolioRecs.push(`Positive decay (+Rs ${dayDecay.toLocaleString('en-IN', { maximumFractionDigits: 0 })} until next open).`);
    } else if (dayDecay < 0) {
        portfolioRecs.push(`Negative decay (Rs ${dayDecay.toLocaleString('en-IN', { maximumFractionDigits: 0 })} until next open).`);
    }

    return {
        positions: analyzedPositions,
        portfolio: {
            netDelta,
            netTheta,
            dayDecay,
            recommendations: portfolioRecs
        }
    };
}

function isFuture(symbol: string): boolean {
    return /FUT$/i.test(symbol.trim());
}

function inferLotSizeFromSymbol(symbol: string): number | null {
    const upper = symbol.toUpperCase();
    const match = NAT_GAS_LOT_SIZES.find((entry) => upper.startsWith(entry.prefix));
    return match?.lotSize ?? null;
}

function inferLotSize(position: ZerodhaPosition): number {
    const fromSymbol = inferLotSizeFromSymbol(position.tradingsymbol);
    if (fromSymbol) {
        return fromSymbol;
    }

    const multiplier = Math.abs(position.multiplier || 1);
    if (multiplier > 1) {
        return multiplier;
    }

    if (/NAT(?:URAL)?GAS/i.test(position.tradingsymbol)) {
        return DEFAULT_NAT_GAS_LOT_SIZE;
    }

    return 1;
}

function inferPositionScale(quantity: number, lotSize: number): { numberOfLots: number; quantityUnits: number } {
    if (quantity === 0) {
        return { numberOfLots: 0, quantityUnits: 0 };
    }

    if (lotSize <= 1) {
        return { numberOfLots: quantity, quantityUnits: quantity };
    }

    const absQty = Math.abs(quantity);
    const looksLikeUnits = absQty % lotSize === 0;

    if (looksLikeUnits) {
        return {
            numberOfLots: quantity / lotSize,
            quantityUnits: quantity
        };
    }

    // Quantity appears to already be in lots.
    return {
        numberOfLots: quantity,
        quantityUnits: quantity * lotSize
    };
}

function getDaysToNextMarketOpenIST(now: Date = new Date()): number {
    const nowISTMs = now.getTime() + IST_OFFSET_MINUTES * 60 * 1000;
    const nowIST = new Date(nowISTMs);

    let nextOpenISTMs = Date.UTC(
        nowIST.getUTCFullYear(),
        nowIST.getUTCMonth(),
        nowIST.getUTCDate(),
        9,
        0,
        0,
        0
    );

    if (nowISTMs >= nextOpenISTMs) {
        nextOpenISTMs += DAY_MS;
    }

    while (isWeekendInISTFrame(nextOpenISTMs)) {
        nextOpenISTMs += DAY_MS;
    }

    const hoursToNextOpen = Math.max(0, (nextOpenISTMs - nowISTMs) / (1000 * 60 * 60));
    return hoursToNextOpen / 24;
}

function isWeekendInISTFrame(istMs: number): boolean {
    const weekday = new Date(istMs).getUTCDay();
    return weekday === 0 || weekday === 6;
}

function analyzePosition(
    position: ZerodhaPosition,
    market: MarketCondition,
    publicGreeks?: PublicOptionGreeks
): PositionAnalysis {
    const pnl = position.pnl || 0;
    const lotSize = inferLotSize(position);
    const { numberOfLots, quantityUnits } = inferPositionScale(position.quantity, lotSize);

    let pnlPercent = 0;
    if (position.average_price > 0) {
        if (position.quantity > 0) {
            pnlPercent = ((position.last_price - position.average_price) / position.average_price) * 100;
        } else {
            pnlPercent = ((position.average_price - position.last_price) / position.average_price) * 100;
        }
    }

    const parsed = parseOptionSymbol(position.tradingsymbol);
    const instrumentType: PositionAnalysis['instrumentType'] = parsed
        ? 'OPTION'
        : isFuture(position.tradingsymbol)
            ? 'FUTURE'
            : 'OTHER';

    let greeks: Greeks | undefined;
    let isITM = false;

    if (parsed) {
        let fallbackGreeks: Greeks | undefined;
        if (market.underlyingPrice) {
            const timeToExpiry = getYearsToExpiry(parsed.expiryDate);
            fallbackGreeks = calculateGreeks(
                parsed.type,
                market.underlyingPrice,
                parsed.strike,
                timeToExpiry
            );
        }

        if (publicGreeks) {
            greeks = {
                delta: publicGreeks.delta,
                theta: publicGreeks.theta,
                gamma: fallbackGreeks?.gamma ?? 0,
                vega: fallbackGreeks?.vega ?? 0,
                rho: fallbackGreeks?.rho ?? 0
            };
        } else {
            greeks = fallbackGreeks;
        }

        if (market.underlyingPrice) {
            if (parsed.type === 'CE') {
                isITM = market.underlyingPrice > parsed.strike;
            } else {
                isITM = parsed.strike > market.underlyingPrice;
            }
        }
    } else if (instrumentType === 'FUTURE') {
        greeks = {
            delta: numberOfLots >= 0 ? 1 : -1,
            theta: 0,
            gamma: 0,
            vega: 0,
            rho: 0
        };
    }

    const riskLevel = determineRiskLevel(pnlPercent, position.quantity, market, isITM);
    const recommendations = generateRecommendations(position, pnlPercent, market, riskLevel, isITM, greeks);

    return {
        symbol: position.tradingsymbol,
        quantity: position.quantity,
        quantityUnits,
        numberOfLots,
        lotSize,
        instrumentType,
        avgPrice: position.average_price,
        ltp: position.last_price,
        pnl,
        pnlPercent,
        riskLevel,
        greeks,
        isITM,
        recommendations
    };
}

function determineRiskLevel(
    pnlPercent: number,
    quantity: number,
    market: MarketCondition,
    isITM: boolean
): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    if (pnlPercent < -15 || (market.volatility === 'HIGH' && Math.abs(quantity) > 1000)) {
        return 'CRITICAL';
    }

    if (pnlPercent < -10 || (quantity < 0 && isITM)) {
        return 'HIGH';
    }

    if (pnlPercent < -5) {
        return 'MEDIUM';
    }

    return 'LOW';
}

function generateRecommendations(
    position: ZerodhaPosition,
    pnlPercent: number,
    market: MarketCondition,
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
    isITM: boolean,
    greeks?: Greeks
): AdjustmentRecommendation[] {
    const recommendations: AdjustmentRecommendation[] = [];
    const isShort = position.quantity < 0;

    if (isITM && isShort) {
        recommendations.push({
            action: 'ROLL',
            reason: 'ALERT: Option is In-The-Money (ITM). Gamma risk is high. Consider rolling out and away to OTM to protect capital.',
            urgency: 'HIGH',
            suggestedQuantity: Math.abs(position.quantity)
        });
    }

    if (isShort && pnlPercent > 90) {
        recommendations.push({
            action: 'EXIT',
            reason: `ALERT: Max Profit approached (${pnlPercent.toFixed(1)}%). Theta decay is minimal now. Close position to free up margin.`,
            urgency: 'HIGH',
            suggestedQuantity: Math.abs(position.quantity)
        });
    }

    if (recommendations.length > 0) {
        return recommendations;
    }

    if (pnlPercent < -15) {
        recommendations.push({
            action: 'EXIT',
            reason: `Critical loss of ${pnlPercent.toFixed(2)}%. Exit to prevent further damage.`,
            urgency: 'HIGH',
            suggestedQuantity: Math.abs(position.quantity)
        });
        return recommendations;
    }

    if (greeks) {
        if (isShort && Math.abs(greeks.delta) > 0.6) {
            recommendations.push({
                action: 'HEDGE',
                reason: `High Delta (${greeks.delta.toFixed(2)}). Position is acting like a Future. Consider hedging.`,
                urgency: 'MEDIUM'
            });
        }
    }

    if (pnlPercent > 50) {
        recommendations.push({
            action: 'REDUCE',
            reason: `Strong profit (${pnlPercent.toFixed(0)}%). Consider booking partial profits.`,
            urgency: 'LOW'
        });
    }

    if (recommendations.length === 0) {
        recommendations.push({
            action: 'HOLD',
            reason: `Position is stable. Monitor P&L (${pnlPercent.toFixed(2)}%).`,
            urgency: 'LOW'
        });
    }

    return recommendations;
}
