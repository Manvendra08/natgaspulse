/**
 * Black-Scholes Greeks Calculator
 */

/**
 * Cumulative Normal Distribution Function (CDF)
 * Approximation using Abramowitz and Stegun method
 */
function cumulativeNormalDistribution(x: number): number {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp(-x * x / 2);
    const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    if (x > 0) return 1 - prob;
    return prob;
}

/**
 * Standard Normal Probability Density Function (PDF)
 */
function standardNormalDistribution(x: number): number {
    return Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
}

export interface Greeks {
    delta: number;
    theta: number; // Daily Theta
    gamma: number;
    vega: number;
    rho: number;
}

/**
 * Calculate Greeks using Black-Scholes model
 * @param type 'CE' (Call) or 'PE' (Put)
 * @param S Underlying Price
 * @param K Strike Price
 * @param T Time to Expiry (in years)
 * @param r Risk-free Interest Rate (decimal, e.g., 0.07 for 7%)
 * @param sigma Implied Volatility (decimal, e.g., 0.60 for 60%)
 */
export function calculateGreeks(
    type: 'CE' | 'PE',
    S: number,
    K: number,
    T: number,
    r: number = 0.07,
    sigma: number = 0.60
): Greeks {
    if (T <= 0) {
        // Expired or expiring today.
        // Delta is 1 if ITM, 0 if OTM.
        const isITM = type === 'CE' ? S > K : S < K;
        return {
            delta: isITM ? (type === 'CE' ? 1 : -1) : 0,
            theta: 0,
            gamma: 0,
            vega: 0,
            rho: 0
        };
    }

    const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);

    const nd1 = cumulativeNormalDistribution(d1);
    const nd2 = cumulativeNormalDistribution(d2);
    const nPrimed1 = standardNormalDistribution(d1);

    let delta = 0;
    let theta = 0;
    let rho = 0;

    if (type === 'CE') {
        delta = nd1;
        // Theta per year
        const thetaYear = -(S * nPrimed1 * sigma) / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * nd2;
        theta = thetaYear / 365; // Convert to daily decay

        rho = K * T * Math.exp(-r * T) * nd2;
    } else {
        delta = nd1 - 1;
        // Theta per year
        const thetaYear = -(S * nPrimed1 * sigma) / (2 * Math.sqrt(T)) + r * K * Math.exp(-r * T) * (1 - nd2);
        theta = thetaYear / 365; // Convert to daily decay

        rho = -K * T * Math.exp(-r * T) * (1 - nd2);
    }

    const gamma = nPrimed1 / (S * sigma * Math.sqrt(T));
    const vega = S * Math.sqrt(T) * nPrimed1 / 100; // Divided by 100 to show change per 1% IV change

    return { delta, theta, gamma, vega, rho };
}
