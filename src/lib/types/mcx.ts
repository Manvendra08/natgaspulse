export interface McxContractSpec {
    symbol: string;
    contractName: string;
    lotSize: string;
    tickSize: string;
    tickValueInr: number;
    marginRequirementPercent: number;
    tradingHours: string;
    expiryRule: string;
}

export interface McxExpiryItem {
    contract: string;
    expiryDate: string;
}

export interface McxPricePoint {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    settlement: number;
    volume: number;
    openInterest: number;
    oiChange: number;
}

export interface McxSourceStatus {
    officialAvailable: boolean;
    provider: 'mcx-official' | 'fallback-yahoo';
    delayedByMinutes: number;
    lastSyncAt: string;
    message: string;
}

export interface McxPublicDataResponse {
    sourceStatus: McxSourceStatus;
    usdinr: number;
    delayedPrice: {
        lastPrice: number;
        change: number;
        changePercent: string;
        asOf: string;
        delayMinutes: number;
    };
    contractSpec: McxContractSpec;
    expiryCalendar: McxExpiryItem[];
    latestSettlement: {
        date: string;
        settlementPrice: number;
        volume: number;
        openInterest: number;
        oiChange: number;
    };
    historical: McxPricePoint[];
    eiaHenryHub: Array<{ date: string; value: number }>;
}

