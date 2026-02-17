import { OptionChainAnalysis, OptionStrike } from '@/lib/types/signals';

interface RupeezyLegRaw {
    token?: number;
    ltp?: number;
    openInterest?: number;
    volume?: number;
    strikePrice?: number;
    greeks?: {
        iv?: number;
    };
}

interface RupeezyOptionDataRaw {
    strikePrice?: number;
    greekIv?: number;
    CE?: RupeezyLegRaw;
    PE?: RupeezyLegRaw;
}

interface RupeezyOptionChainRaw {
    status?: string;
    response?: {
        optionData?: RupeezyOptionDataRaw[];
    };
}

interface RupeezyLtpRaw {
    scrip_token?: number;
    ltp?: number;
    total_quantity_traded?: number;
    open_interest?: number;
}

const RUPEEZY_STOCKDATA_ENDPOINT = 'https://stockdata.rupeezy.in';
const RUPEEZY_CMS_ENDPOINT = 'https://cms.rupeezy.in';

/**
 * Pull option-chain for NATURALGAS from Rupeezy public endpoints.
 * Falls back to a deterministic simulation when upstream is unavailable.
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

    const simChain = generateSimulatedChain(spotPrice);
    return analyzeChain(simChain, spotPrice);
}

async function fetchLiveOptionChain(): Promise<OptionStrike[] | null> {
    const optionChainUrl = `${RUPEEZY_STOCKDATA_ENDPOINT}/flow/api/v1/stock/optionchain?symbol=NATURALGAS&InstrumentType=mcx&ExpiryDate=0&AddGreek=true`;

    const baseRes = await fetch(optionChainUrl, {
        headers: {
            Accept: 'application/json',
            'User-Agent': 'Mozilla/5.0'
        },
        cache: 'no-store'
    });

    if (!baseRes.ok) {
        throw new Error(`Rupeezy option-chain fetch failed: ${baseRes.status}`);
    }

    const basePayload = await baseRes.json() as RupeezyOptionChainRaw;
    if (basePayload.status !== 'success' || !basePayload.response?.optionData?.length) {
        return null;
    }

    const ltpMap = await fetchRupeezyLtpMap();

    const chain = basePayload.response.optionData
        .map((item) => {
            const strikePrice = normalizeRupeezyPrice(item.strikePrice ?? item.CE?.strikePrice ?? item.PE?.strikePrice);
            if (!Number.isFinite(strikePrice) || strikePrice <= 0) return null;

            const ceToken = toNum(item.CE?.token);
            const peToken = toNum(item.PE?.token);
            const ceSnap = ltpMap.get(ceToken);
            const peSnap = ltpMap.get(peToken);
            const iv = firstFinite(item.greekIv, item.CE?.greeks?.iv, item.PE?.greeks?.iv, 0);

            return {
                strikePrice,
                ce: {
                    ltp: firstFinite(ceSnap?.ltp, item.CE?.ltp, 0),
                    oi: firstFinite(ceSnap?.open_interest, item.CE?.openInterest, 0),
                    vol: firstFinite(ceSnap?.total_quantity_traded, item.CE?.volume, 0),
                    iv
                },
                pe: {
                    ltp: firstFinite(peSnap?.ltp, item.PE?.ltp, 0),
                    oi: firstFinite(peSnap?.open_interest, item.PE?.openInterest, 0),
                    vol: firstFinite(peSnap?.total_quantity_traded, item.PE?.volume, 0),
                    iv
                }
            } as OptionStrike;
        })
        .filter((item): item is OptionStrike => item !== null)
        .sort((a, b) => a.strikePrice - b.strikePrice);

    return chain.length ? chain : null;
}

async function fetchRupeezyLtpMap(): Promise<Map<number, RupeezyLtpRaw>> {
    const response = await fetch(`${RUPEEZY_CMS_ENDPOINT}/flow/api/v1/optionchainltpsmcx/NATURALGAS`, {
        headers: {
            Accept: 'application/json',
            'User-Agent': 'Mozilla/5.0'
        },
        cache: 'no-store'
    });

    if (!response.ok) {
        return new Map();
    }

    const payload = await response.json() as RupeezyLtpRaw[];
    const map = new Map<number, RupeezyLtpRaw>();

    for (const row of payload || []) {
        const token = toNum(row.scrip_token);
        if (token > 0) {
            map.set(token, row);
        }
    }

    return map;
}

function generateSimulatedChain(spot: number): OptionStrike[] {
    const strikes: OptionStrike[] = [];
    const step = 5;
    const atm = Math.round(spot / step) * step;

    for (let i = -10; i <= 10; i++) {
        const strike = atm + (i * step);
        const dist = Math.abs(strike - spot);

        const timeValue = (spot * 0.05) * Math.exp(-dist / (spot * 0.2));
        const callIntrinsic = Math.max(0, spot - strike);
        const putIntrinsic = Math.max(0, strike - spot);
        const callLtp = callIntrinsic + timeValue;
        const putLtp = putIntrinsic + timeValue;

        const baseOi = 1000;
        const oiFactor = Math.exp(-Math.pow(strike - spot, 2) / (2 * Math.pow(spot * 0.1, 2)));
        const callOi = Math.round(baseOi * oiFactor);
        const putOi = Math.round(baseOi * oiFactor);

        strikes.push({
            strikePrice: strike,
            ce: { ltp: Number(callLtp.toFixed(2)), oi: callOi, vol: Math.round(callOi * 0.1), iv: 45 },
            pe: { ltp: Number(putLtp.toFixed(2)), oi: putOi, vol: Math.round(putOi * 0.1), iv: 45 }
        });
    }

    return strikes;
}

function analyzeChain(chain: OptionStrike[], spot: number): OptionChainAnalysis {
    let totalCeOi = 0;
    let totalPeOi = 0;
    let maxCeOi = 0;
    let maxPeOi = 0;
    let callRes = 0;
    let putSup = 0;
    let maxPainParams = { strike: 0, pain: Infinity };

    chain.forEach((s) => {
        totalCeOi += s.ce.oi;
        totalPeOi += s.pe.oi;

        if (s.ce.oi > maxCeOi) {
            maxCeOi = s.ce.oi;
            callRes = s.strikePrice;
        }
        if (s.pe.oi > maxPeOi) {
            maxPeOi = s.pe.oi;
            putSup = s.strikePrice;
        }
    });

    chain.forEach((candidate) => {
        let totalPain = 0;
        const k = candidate.strikePrice;

        chain.forEach((s) => {
            const sK = s.strikePrice;
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
        atmIv: 45,
        chain
    };
}

function normalizeRupeezyPrice(value: unknown): number {
    const n = toNum(value);
    if (n <= 0) return 0;
    return n > 5000 ? n / 100 : n;
}

function toNum(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function firstFinite(...values: Array<unknown>): number {
    for (const value of values) {
        const n = Number(value);
        if (Number.isFinite(n)) {
            return n;
        }
    }
    return 0;
}

