/**
 * Options Advisor — Pro Trader Logic
 *
 * Strategy selection based on:
 *   - IV regime (high/low vs rolling average)
 *   - PCR (Put-Call Ratio) — contrarian signal
 *   - DTE (Days to Expiry) — spread vs naked filter
 *   - Directional bias from futures signal engine
 *   - VIX proxy from ATR%
 *
 * Outputs: Strategy name | Strikes | Max Profit | Max Loss | Breakevens | IV context label
 */

import type {
    IndicatorValues,
    OptionsRecommendation,
    SignalDirection,
    Confidence,
    OptionChainAnalysis
} from '@/lib/types/signals';

export const MCX_NG_SPECS = {
    lotSize: 125,
    lotSizeLabel: '125 MMBtu',
    tickSize: 0.10,
    tickValue: 125,
    marginPercent: 12.5,
    tradingHours: '09:00–23:30 IST',
    exchange: 'MCX'
};

export const NYMEX_NG_SPECS = {
    lotSize: 10000,
    lotSizeLabel: '10,000 MMBtu',
    tickSize: 0.001,
    tickValue: 10,
    tradingHours: '18:00–17:00 ET (Sun–Fri)',
    exchange: 'NYMEX'
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ProOptionsRecommendation extends OptionsRecommendation {
    strategy: string;           // e.g. "Iron Condor", "Bull Call Spread"
    strikes: string;            // human-readable strike description
    maxProfit: string;          // e.g. "₹1,250 / lot"
    maxLoss: string;            // e.g. "₹3,750 / lot"
    breakevens: string;         // e.g. "₹185 / ₹215"
    ivContext: string;          // e.g. "High IV (1.4× avg) — favor selling"
    dte: number | null;         // days to expiry used in decision
    confidence: Confidence;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STRIKE_STEP = 5;
const roundMcx = (p: number) => Math.round(p / STRIKE_STEP) * STRIKE_STEP;

function fmt(n: number, decimals = 2): string {
    return n.toFixed(decimals);
}

function fmtRs(n: number): string {
    return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

/**
 * Estimate DTE from option chain expiry string (YYYY-MM-DD).
 * Returns null if unavailable.
 */
function estimateDTE(chain?: OptionChainAnalysis): number | null {
    // OptionChainAnalysis doesn't carry expiry directly — use ATM IV as proxy
    // If chain has atmIv we can infer DTE is near-term; otherwise assume 15
    if (!chain) return null;
    // Heuristic: if ATM IV > 60%, likely near expiry (< 7 DTE); if < 30%, > 15 DTE
    if (chain.atmIv > 60) return 5;
    if (chain.atmIv > 40) return 10;
    return 20;
}

/**
 * Classify IV regime relative to a baseline.
 * For MCX Nat Gas, typical ATM IV is ~35–50%.
 * High IV: > 1.2× baseline (60%+), Low IV: < 0.8× baseline (28%-)
 */
function classifyIV(atmIv: number): { label: string; regime: 'HIGH' | 'NORMAL' | 'LOW' } {
    const baseline = 42; // typical MCX NG ATM IV %
    const ratio = atmIv / baseline;
    if (ratio >= 1.2) return { label: `High IV (${fmt(ratio, 1)}× avg) — favor selling`, regime: 'HIGH' };
    if (ratio <= 0.8) return { label: `Low IV (${fmt(ratio, 1)}× avg) — favor buying`, regime: 'LOW' };
    return { label: `Normal IV (${fmt(ratio, 1)}× avg)`, regime: 'NORMAL' };
}

/**
 * Classify PCR for contrarian signal.
 * PCR > 1.2 → contrarian bullish (too many puts = floor)
 * PCR < 0.8 → contrarian bearish (too many calls = ceiling)
 */
function classifyPCR(pcr: number): { label: string; contrarian: 'BULLISH' | 'BEARISH' | 'NEUTRAL' } {
    if (pcr >= 1.2) return { label: `PCR ${fmt(pcr)} — contrarian bullish (put-heavy)`, contrarian: 'BULLISH' };
    if (pcr <= 0.8) return { label: `PCR ${fmt(pcr)} — contrarian bearish (call-heavy)`, contrarian: 'BEARISH' };
    return { label: `PCR ${fmt(pcr)} — neutral`, contrarian: 'NEUTRAL' };
}

// ── Strategy Builders ─────────────────────────────────────────────────────────

function buildIronCondor(
    price: number,
    atr: number,
    chain: OptionChainAnalysis,
    ivCtx: string,
    dte: number
): ProOptionsRecommendation {
    const callSell = roundMcx(chain.callResistance > price ? chain.callResistance : price + 1.5 * atr);
    const callBuy = roundMcx(callSell + STRIKE_STEP * 3);
    const putSell = roundMcx(chain.putSupport < price ? chain.putSupport : price - 1.5 * atr);
    const putBuy = roundMcx(putSell - STRIKE_STEP * 3);
    const width = callSell - putSell;
    const premium = atr * 0.4; // estimated net credit
    const maxProfitVal = premium * MCX_NG_SPECS.lotSize;
    const maxLossVal = (STRIKE_STEP * 3 - premium) * MCX_NG_SPECS.lotSize;

    return {
        action: 'SELL',
        optionType: 'CE',
        strikePrice: callSell,
        expectedMove: Math.round(atr * 1.5 * 100) / 100,
        rationale: `Iron Condor: Sell ${callSell}CE / Buy ${callBuy}CE + Sell ${putSell}PE / Buy ${putBuy}PE. Range-bound with ${ivCtx}. Max pain ₹${chain.maxPain}. DTE: ${dte}d.`,
        riskLevel: 'MEDIUM',
        strategy: 'Iron Condor',
        strikes: `${putBuy}PE / ${putSell}PE / ${callSell}CE / ${callBuy}CE`,
        maxProfit: `${fmtRs(maxProfitVal)} / lot`,
        maxLoss: `${fmtRs(maxLossVal)} / lot`,
        breakevens: `${fmtRs(putSell - premium)} / ${fmtRs(callSell + premium)}`,
        ivContext: ivCtx,
        dte,
        confidence: 'MEDIUM'
    };
}

function buildShortStrangle(
    price: number,
    atr: number,
    chain: OptionChainAnalysis,
    ivCtx: string,
    dte: number
): ProOptionsRecommendation {
    const callStrike = roundMcx(chain.callResistance > price ? chain.callResistance : price + 1.8 * atr);
    const putStrike = roundMcx(chain.putSupport < price ? chain.putSupport : price - 1.8 * atr);
    const premium = atr * 0.55;
    const maxProfitVal = premium * MCX_NG_SPECS.lotSize;

    return {
        action: 'SELL',
        optionType: 'CE',
        strikePrice: callStrike,
        expectedMove: Math.round(atr * 1.8 * 100) / 100,
        rationale: `Short Strangle: Sell ${callStrike}CE + Sell ${putStrike}PE. ${ivCtx}. Collect premium in high-IV environment. DTE: ${dte}d. Undefined risk — use stop at 2× premium.`,
        riskLevel: 'HIGH',
        strategy: 'Short Strangle',
        strikes: `${putStrike}PE / ${callStrike}CE`,
        maxProfit: `${fmtRs(maxProfitVal)} / lot (net credit)`,
        maxLoss: 'Unlimited — use stop at 2× credit',
        breakevens: `${fmtRs(putStrike - premium)} / ${fmtRs(callStrike + premium)}`,
        ivContext: ivCtx,
        dte,
        confidence: 'MEDIUM'
    };
}

function buildBullCallSpread(
    price: number,
    atr: number,
    chain: OptionChainAnalysis,
    ivCtx: string,
    dte: number,
    pcrCtx: string
): ProOptionsRecommendation {
    const buyStrike = roundMcx(price);
    const sellStrike = roundMcx(chain.callResistance > price ? chain.callResistance : price + 1.5 * atr);
    const width = sellStrike - buyStrike;
    const debit = atr * 0.35;
    const maxProfitVal = (width - debit) * MCX_NG_SPECS.lotSize;
    const maxLossVal = debit * MCX_NG_SPECS.lotSize;

    return {
        action: 'BUY',
        optionType: 'CE',
        strikePrice: buyStrike,
        expectedMove: Math.round(atr * 1.5 * 100) / 100,
        rationale: `Bull Call Spread: Buy ${buyStrike}CE / Sell ${sellStrike}CE. Bullish bias with defined risk. ${ivCtx}. ${pcrCtx}. DTE: ${dte}d.`,
        riskLevel: 'MEDIUM',
        strategy: 'Bull Call Spread',
        strikes: `Buy ${buyStrike}CE / Sell ${sellStrike}CE`,
        maxProfit: `${fmtRs(maxProfitVal)} / lot`,
        maxLoss: `${fmtRs(maxLossVal)} / lot`,
        breakevens: `${fmtRs(buyStrike + debit)}`,
        ivContext: ivCtx,
        dte,
        confidence: 'HIGH'
    };
}

function buildBearPutSpread(
    price: number,
    atr: number,
    chain: OptionChainAnalysis,
    ivCtx: string,
    dte: number,
    pcrCtx: string
): ProOptionsRecommendation {
    const buyStrike = roundMcx(price);
    const sellStrike = roundMcx(chain.putSupport < price ? chain.putSupport : price - 1.5 * atr);
    const width = buyStrike - sellStrike;
    const debit = atr * 0.35;
    const maxProfitVal = (width - debit) * MCX_NG_SPECS.lotSize;
    const maxLossVal = debit * MCX_NG_SPECS.lotSize;

    return {
        action: 'BUY',
        optionType: 'PE',
        strikePrice: buyStrike,
        expectedMove: Math.round(atr * 1.5 * 100) / 100,
        rationale: `Bear Put Spread: Buy ${buyStrike}PE / Sell ${sellStrike}PE. Bearish bias with defined risk. ${ivCtx}. ${pcrCtx}. DTE: ${dte}d.`,
        riskLevel: 'MEDIUM',
        strategy: 'Bear Put Spread',
        strikes: `Buy ${buyStrike}PE / Sell ${sellStrike}PE`,
        maxProfit: `${fmtRs(maxProfitVal)} / lot`,
        maxLoss: `${fmtRs(maxLossVal)} / lot`,
        breakevens: `${fmtRs(buyStrike - debit)}`,
        ivContext: ivCtx,
        dte,
        confidence: 'HIGH'
    };
}

function buildLongStraddle(
    price: number,
    atr: number,
    chain: OptionChainAnalysis,
    ivCtx: string,
    dte: number
): ProOptionsRecommendation {
    const strike = roundMcx(price);
    const debit = atr * 0.7;
    const maxLossVal = debit * MCX_NG_SPECS.lotSize;

    return {
        action: 'BUY',
        optionType: 'CE',
        strikePrice: strike,
        expectedMove: Math.round(atr * 100) / 100,
        rationale: `Long Straddle: Buy ${strike}CE + Buy ${strike}PE. Low IV environment — cheap premium before expected move. ${ivCtx}. DTE: ${dte}d (>15 preferred).`,
        riskLevel: 'MEDIUM',
        strategy: 'Long Straddle',
        strikes: `${strike}CE + ${strike}PE (ATM)`,
        maxProfit: 'Unlimited (both sides)',
        maxLoss: `${fmtRs(maxLossVal)} / lot (total debit)`,
        breakevens: `${fmtRs(strike - debit)} / ${fmtRs(strike + debit)}`,
        ivContext: ivCtx,
        dte,
        confidence: 'MEDIUM'
    };
}

function buildBullPutSpread(
    price: number,
    atr: number,
    chain: OptionChainAnalysis,
    ivCtx: string,
    dte: number
): ProOptionsRecommendation {
    const sellStrike = roundMcx(chain.putSupport < price ? chain.putSupport : price - atr);
    const buyStrike = roundMcx(sellStrike - STRIKE_STEP * 3);
    const credit = atr * 0.25;
    const maxProfitVal = credit * MCX_NG_SPECS.lotSize;
    const maxLossVal = (STRIKE_STEP * 3 - credit) * MCX_NG_SPECS.lotSize;

    return {
        action: 'SELL',
        optionType: 'PE',
        strikePrice: sellStrike,
        expectedMove: Math.round(atr * 100) / 100,
        rationale: `Bull Put Spread: Sell ${sellStrike}PE / Buy ${buyStrike}PE. Bullish premium collection at OI support. ${ivCtx}. DTE: ${dte}d.`,
        riskLevel: 'LOW',
        strategy: 'Bull Put Spread',
        strikes: `Sell ${sellStrike}PE / Buy ${buyStrike}PE`,
        maxProfit: `${fmtRs(maxProfitVal)} / lot`,
        maxLoss: `${fmtRs(maxLossVal)} / lot`,
        breakevens: `${fmtRs(sellStrike - credit)}`,
        ivContext: ivCtx,
        dte,
        confidence: 'MEDIUM'
    };
}

function buildBearCallSpread(
    price: number,
    atr: number,
    chain: OptionChainAnalysis,
    ivCtx: string,
    dte: number
): ProOptionsRecommendation {
    const sellStrike = roundMcx(chain.callResistance > price ? chain.callResistance : price + atr);
    const buyStrike = roundMcx(sellStrike + STRIKE_STEP * 3);
    const credit = atr * 0.25;
    const maxProfitVal = credit * MCX_NG_SPECS.lotSize;
    const maxLossVal = (STRIKE_STEP * 3 - credit) * MCX_NG_SPECS.lotSize;

    return {
        action: 'SELL',
        optionType: 'CE',
        strikePrice: sellStrike,
        expectedMove: Math.round(atr * 100) / 100,
        rationale: `Bear Call Spread: Sell ${sellStrike}CE / Buy ${buyStrike}CE. Bearish premium collection at OI resistance. ${ivCtx}. DTE: ${dte}d.`,
        riskLevel: 'LOW',
        strategy: 'Bear Call Spread',
        strikes: `Sell ${sellStrike}CE / Buy ${buyStrike}CE`,
        maxProfit: `${fmtRs(maxProfitVal)} / lot`,
        maxLoss: `${fmtRs(maxLossVal)} / lot`,
        breakevens: `${fmtRs(sellStrike + credit)}`,
        ivContext: ivCtx,
        dte,
        confidence: 'MEDIUM'
    };
}

// ── Main Export ───────────────────────────────────────────────────────────────

export function generateOptionsRecommendations(
    currentPrice: number,
    indicators: IndicatorValues,
    overallSignal: SignalDirection,
    marketCondition: 'TRENDING' | 'RANGING' | 'VOLATILE',
    chainAnalysis?: OptionChainAnalysis
): OptionsRecommendation[] {
    const atr = indicators.atr || currentPrice * 0.025;
    const recommendations: ProOptionsRecommendation[] = [];

    // ── IV / PCR / DTE context ────────────────────────────────────────────────
    const atmIv = chainAnalysis?.atmIv ?? 42; // fallback to baseline
    const pcr = chainAnalysis?.pcr ?? 1.0;
    const dte = estimateDTE(chainAnalysis) ?? 15;

    const { label: ivLabel, regime: ivRegime } = classifyIV(atmIv);
    const { label: pcrLabel, contrarian: pcrContrarian } = classifyPCR(pcr);

    // Effective directional bias (may be overridden by PCR contrarian signal)
    let effectiveBias: SignalDirection = overallSignal;
    if (overallSignal === 'HOLD') {
        if (pcrContrarian === 'BULLISH') effectiveBias = 'BUY';
        else if (pcrContrarian === 'BEARISH') effectiveBias = 'SELL';
    }

    // ── DTE filter: < 7 DTE → only defined-risk sells, no buying ─────────────
    const nearExpiry = dte < 7;
    const hasChain = Boolean(chainAnalysis);

    // ── Strategy selection matrix ─────────────────────────────────────────────

    if (ivRegime === 'HIGH') {
        // High IV → favor selling premium
        if (marketCondition === 'RANGING' || overallSignal === 'HOLD') {
            // Iron Condor (defined risk) if DTE > 7, else Short Strangle (undefined)
            if (!nearExpiry && hasChain) {
                recommendations.push(buildIronCondor(currentPrice, atr, chainAnalysis!, ivLabel, dte));
            } else if (hasChain) {
                recommendations.push(buildShortStrangle(currentPrice, atr, chainAnalysis!, ivLabel, dte));
            }
        }
        if (effectiveBias === 'BUY' && hasChain) {
            // Bullish + High IV → Bull Put Spread (sell puts, collect premium)
            recommendations.push(buildBullPutSpread(currentPrice, atr, chainAnalysis!, ivLabel, dte));
        } else if (effectiveBias === 'SELL' && hasChain) {
            // Bearish + High IV → Bear Call Spread
            recommendations.push(buildBearCallSpread(currentPrice, atr, chainAnalysis!, ivLabel, dte));
        }
    } else if (ivRegime === 'LOW') {
        // Low IV → favor buying (cheap premium)
        if (!nearExpiry) {
            if (effectiveBias === 'BUY' && hasChain) {
                recommendations.push(buildBullCallSpread(currentPrice, atr, chainAnalysis!, ivLabel, dte, pcrLabel));
            } else if (effectiveBias === 'SELL' && hasChain) {
                recommendations.push(buildBearPutSpread(currentPrice, atr, chainAnalysis!, ivLabel, dte, pcrLabel));
            } else {
                // Neutral + Low IV → Long Straddle on expected event
                recommendations.push(buildLongStraddle(
                    currentPrice, atr,
                    chainAnalysis ?? { pcr: 1, maxPain: roundMcx(currentPrice), callResistance: roundMcx(currentPrice + 2 * atr), putSupport: roundMcx(currentPrice - 2 * atr), atmIv: 35, chain: [] },
                    ivLabel, dte
                ));
            }
        } else {
            // Near expiry + Low IV → avoid buying; use defined-risk sell if directional
            if (effectiveBias === 'BUY' && hasChain) {
                recommendations.push(buildBullPutSpread(currentPrice, atr, chainAnalysis!, ivLabel, dte));
            } else if (effectiveBias === 'SELL' && hasChain) {
                recommendations.push(buildBearCallSpread(currentPrice, atr, chainAnalysis!, ivLabel, dte));
            }
        }
    } else {
        // Normal IV → directional spreads
        if (effectiveBias === 'BUY' && hasChain) {
            if (!nearExpiry) {
                recommendations.push(buildBullCallSpread(currentPrice, atr, chainAnalysis!, ivLabel, dte, pcrLabel));
            }
            recommendations.push(buildBullPutSpread(currentPrice, atr, chainAnalysis!, ivLabel, dte));
        } else if (effectiveBias === 'SELL' && hasChain) {
            if (!nearExpiry) {
                recommendations.push(buildBearPutSpread(currentPrice, atr, chainAnalysis!, ivLabel, dte, pcrLabel));
            }
            recommendations.push(buildBearCallSpread(currentPrice, atr, chainAnalysis!, ivLabel, dte));
        } else if (marketCondition === 'RANGING' && hasChain && !nearExpiry) {
            recommendations.push(buildIronCondor(currentPrice, atr, chainAnalysis!, ivLabel, dte));
        }
    }

    // Fallback: if no chain data, use ATR-based simple recommendations
    if (recommendations.length === 0) {
        const fallbackChain: OptionChainAnalysis = {
            pcr,
            maxPain: roundMcx(currentPrice),
            callResistance: roundMcx(currentPrice + 2 * atr),
            putSupport: roundMcx(currentPrice - 2 * atr),
            atmIv,
            chain: []
        };
        if (effectiveBias === 'BUY') {
            recommendations.push(buildBullCallSpread(currentPrice, atr, fallbackChain, ivLabel, dte, pcrLabel));
        } else if (effectiveBias === 'SELL') {
            recommendations.push(buildBearPutSpread(currentPrice, atr, fallbackChain, ivLabel, dte, pcrLabel));
        } else {
            recommendations.push(buildIronCondor(currentPrice, atr, fallbackChain, ivLabel, dte));
        }
    }

    return recommendations as OptionsRecommendation[];
}
