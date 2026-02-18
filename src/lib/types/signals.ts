// Signal Bot Types for Multi-Timeframe Natural Gas Trading

export type Timeframe = '1H' | '3H' | '1D' | '1W' | '1M';
export type SignalDirection = 'BUY' | 'SELL' | 'HOLD';
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type OptionType = 'CE' | 'PE';
export type SignalDataSource = 'Rupeezy Active Future' | 'MCX Official' | 'Derived (NYMEX * USDINR)';

export interface CandleData {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface IndicatorValues {
    rsi: number | null;
    macdLine: number | null;
    macdSignal: number | null;
    macdHistogram: number | null;
    ema20: number | null;
    ema50: number | null;
    stochK: number | null;
    stochD: number | null;
    bollingerUpper: number | null;
    bollingerMiddle: number | null;
    bollingerLower: number | null;
    adx: number | null;
    plusDI: number | null;
    minusDI: number | null;
    atr: number | null;
    vwap: number | null;
    pivotPoint: number | null;
    pivotR1: number | null;
    pivotR2: number | null;
    pivotR3: number | null;
    pivotS1: number | null;
    pivotS2: number | null;
    pivotS3: number | null;
}

export interface IndicatorSignal {
    name: string;
    value: number | null;
    signal: SignalDirection;
    description: string;
}

export interface TimeframeSignal {
    timeframe: Timeframe;
    bias: SignalDirection;
    biasScore: number; // -100 to +100
    indicators: IndicatorValues;
    signals: IndicatorSignal[];
    lastPrice: number;
    referenceClose: number;
    priceChange: number;
    priceChangePercent: number;
    intervalPriceChange: number;
    intervalPriceChangePercent: number;
    candleCount: number;
}

export interface FuturesSetup {
    timeframe?: Timeframe;
    direction: SignalDirection;
    entry: number;
    stopLoss: number;
    target1: number;
    target2: number;
    riskRewardRatio: number;
    atrValue: number;
    rationale: string;
}

export interface OptionsRecommendation {
    action: 'BUY' | 'SELL';
    optionType: OptionType;
    strikePrice: number;
    expectedMove: number;
    rationale: string;
    riskLevel: Confidence;
}

export interface SignalBotResponse {
    timestamp: string;
    currentPrice: number;
    activeContract?: string;
    previousClose?: number;
    liveChange?: number;
    liveChangePercent?: number;
    overallSignal: SignalDirection;
    overallConfidence: Confidence;
    overallScore: number; // -100 to +100
    timeframes: TimeframeSignal[];
    futuresSetup: FuturesSetup | null;
    futuresSetups?: FuturesSetup[];
    optionsRecommendations: OptionsRecommendation[];
    marketCondition: 'TRENDING' | 'RANGING' | 'VOLATILE';
    summary: string;
    dataSource?: SignalDataSource;
    optionChainAnalysis?: OptionChainAnalysis; // New field
}

export interface OptionStrike {
    strikePrice: number;
    ce: { ltp: number; oi: number; vol: number; iv: number }; // Call Data
    pe: { ltp: number; oi: number; vol: number; iv: number }; // Put Data
}

export interface OptionChainAnalysis {
    pcr: number; // Put Call Ratio
    maxPain: number; // Max Pain Strike
    callResistance: number; // Strike with Max Call OI
    putSupport: number; // Strike with Max Put OI
    atmIv: number; // Average IV of ATM strikes
    chain: OptionStrike[]; // The raw chain data (subset)
}
