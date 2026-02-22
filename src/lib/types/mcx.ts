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
    expiryType: 'FUT' | 'OPT';
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
    provider: 'rupeezy-active-future' | 'tradingview-scanner' | 'moneycontrol-scrape' | 'mcx-official' | 'fallback-yahoo';
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
    henryHubLive: {
        price: number;
        change: number;
        changePercent: number;
        asOf: string;
        source: 'yahoo-finance-ng-f' | 'eia-futures-daily';
    };
    moneycontrolLive: {
        available: boolean;
        price: number | null;
        openInterest: number | null;
        volume: number | null;
        bid: number | null;
        ask: number | null;
        asOf: string | null;
        sourceUrl: string;
    };
    activeMonth: {
        contract: string;
        price: number;
        change: number;
        changePercent: number;
        asOf: string;
    };
    nextMonth: {
        contract: string;
        price: number;
        change: number;
        changePercent: number;
        asOf: string;
    } | null;
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
