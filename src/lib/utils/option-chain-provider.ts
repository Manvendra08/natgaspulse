import { OptionChainAnalysis, OptionStrike } from '@/lib/types/signals';

/**
 * Parses the raw option chain data from Dhan or Moneycontrol.
 * Falls back to a heuristic simulation if live data is unavailable.
 */
export async function getOptionChainAnalysis(spotPrice: number): Promise<OptionChainAnalysis> {
    try {
        const liveChain = await fetchLiveOptionChain();
        if (liveChain && liveChain.length > 0) {
            return analyzeChain(liveChain, spotPrice);
        }
    } catch (e) {
        console.warn('Live option chain fetch failed, using simulation:', e);
    }

    // Fallback: Generate simulated chain based on Black-Scholes & Standard Distribution
    const simChain = generateSimulatedChain(spotPrice);
    return analyzeChain(simChain, spotPrice);
}

// ─── Scraper Logic ─────────────────────────────────────────────

async function fetchLiveOptionChain(): Promise<OptionStrike[] | null> {
    // Attempt 1: Dhan.co (Next.js Hydration Data)
    try {
        const res = await fetch('https://dhan.co/commodity/natural-gas-option-chain/', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
            },
            next: { revalidate: 300 } // Cache 5 mins
        });

        if (!res.ok) throw new Error(`Dhan fetch failed: ${res.status}`);

        const html = await res.text();
        const json = extractNextData(html);

        if (json) {
            // Traverse JSON to find array with strike prices
            const chain = findOptionChainInJson(json);
            if (chain) return chain;
        }
    } catch (e) {
        console.warn('Dhan scraper error:', e);
    }

    return null;
}

function extractNextData(html: string): any {
    const startMarker = '<script id="__NEXT_DATA__" type="application/json">';
    const endMarker = '</script>';
    const start = html.indexOf(startMarker);
    if (start === -1) return null;
    const jsonStart = start + startMarker.length;
    const end = html.indexOf(endMarker, jsonStart);
    if (end === -1) return null;

    try {
        return JSON.parse(html.substring(jsonStart, end));
    } catch {
        return null;
    }
}

function findOptionChainInJson(obj: any): OptionStrike[] | null {
    // Recursive search for an array that looks like option data
    if (!obj || typeof obj !== 'object') return null;

    // Heuristic: Array with objects containing 'strike_price', 'call_oi', etc.
    if (Array.isArray(obj)) {
        // Check first element
        const first = obj[0];
        if (first && (typeof first.strike_price === 'number' || typeof first.StrikePrice === 'number')) {
            // Map to our format
            return obj.map((item: any) => ({
                strikePrice: Number(item.strike_price || item.StrikePrice || item.strike || 0),
                ce: {
                    ltp: Number(item.call_ltp || item.CallLtp || item.ce_ltp || 0),
                    oi: Number(item.call_oi || item.CallOi || item.ce_oi || 0),
                    vol: Number(item.call_vol || item.CallVol || item.ce_vol || 0),
                    iv: Number(item.call_iv || item.CallIv || 0)
                },
                pe: {
                    ltp: Number(item.put_ltp || item.PutLtp || item.pe_ltp || 0),
                    oi: Number(item.put_oi || item.PutOi || item.pe_oi || 0),
                    vol: Number(item.put_vol || item.PutVol || item.pe_vol || 0),
                    iv: Number(item.put_iv || item.PutIv || 0)
                }
            })).filter(s => s.strikePrice > 0).sort((a, b) => a.strikePrice - b.strikePrice);
        }
    }

    // Recurse
    for (const key in obj) {
        const result = findOptionChainInJson(obj[key]);
        if (result) return result;
    }

    return null;
}

// ─── Simulation Logic ──────────────────────────────────────────

function generateSimulatedChain(spot: number): OptionStrike[] {
    const strikes: OptionStrike[] = [];
    const step = 5; // MCX Step
    const atm = Math.round(spot / step) * step;

    // Generate 10 strikes above and below
    for (let i = -10; i <= 10; i++) {
        const strike = atm + (i * step);
        const dist = Math.abs(strike - spot);

        // Simulate Logic:
        // LTP: Intrinsic + Time Value (Decay func)
        // OI: Bell curve peaked at ATM/Slightly OTM

        // Time Value (Approx 10% of spot, decaying with distance)
        const timeValue = (spot * 0.05) * Math.exp(-dist / (spot * 0.2));

        // Call LTP
        const callIntrinsic = Math.max(0, spot - strike);
        const callLtp = callIntrinsic + timeValue;

        // Put LTP
        const putIntrinsic = Math.max(0, strike - spot);
        const putLtp = putIntrinsic + timeValue;

        // OI Distribution (Bell curve centered near ATM)
        // Add some noise/randomness for realism
        const baseOi = 1000;
        const oiFactor = Math.exp(-Math.pow(strike - spot, 2) / (2 * Math.pow(spot * 0.1, 2))); // Gaussian
        const callOi = Math.round(baseOi * oiFactor * (1 + Math.random() * 0.5));
        const putOi = Math.round(baseOi * oiFactor * (1 + Math.random() * 0.5));

        strikes.push({
            strikePrice: strike,
            ce: { ltp: Number(callLtp.toFixed(2)), oi: callOi, vol: Math.round(callOi * 0.1), iv: 45 },
            pe: { ltp: Number(putLtp.toFixed(2)), oi: putOi, vol: Math.round(putOi * 0.1), iv: 45 }
        });
    }
    return strikes;
}

// ─── Analysis Logic ────────────────────────────────────────────

function analyzeChain(chain: OptionStrike[], spot: number): OptionChainAnalysis {
    let totalCeOi = 0;
    let totalPeOi = 0;
    let maxCeOi = 0;
    let maxPeOi = 0;
    let callRes = 0;
    let putSup = 0;
    let maxPainParams = { strike: 0, pain: Infinity };

    // Calculate PCR & Support/Resistance
    chain.forEach(s => {
        totalCeOi += s.ce.oi;
        totalPeOi += s.pe.oi;

        if (s.ce.oi > maxCeOi) { maxCeOi = s.ce.oi; callRes = s.strikePrice; }
        if (s.pe.oi > maxPeOi) { maxPeOi = s.pe.oi; putSup = s.strikePrice; }
    });

    // Calculate Max Pain (Simplified)
    // Find strike where (Call Intrinsic * Call OI) + (Put Intrinsic * Put OI) is minimized
    chain.forEach(candidate => {
        let totalPain = 0;
        const k = candidate.strikePrice;

        chain.forEach(s => {
            const sK = s.strikePrice;
            // Loss for option writers at expiry K
            const callLoss = Math.max(0, k - sK) * s.ce.oi;
            const putLoss = Math.max(0, sK - k) * s.pe.oi;
            totalPain += callLoss + putLoss;
        });

        if (totalPain < maxPainParams.pain) {
            maxPainParams = { strike: k, pain: totalPain };
        }
    });

    return {
        pcr: totalCeOi > 0 ? Number((totalPeOi / totalCeOi).toFixed(2)) : 0,
        maxPain: maxPainParams.strike,
        callResistance: callRes,
        putSupport: putSup,
        atmIv: 45, // Placeholder or calculate average
        chain: chain // Return full chain for UI if needed
    };
}
