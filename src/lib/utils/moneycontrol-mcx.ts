export interface MoneycontrolMcxSnapshot {
    symbol: string;
    expiry: string | null;
    contractMonth: string | null;
    lastPrice: number;
    change: number;
    changePercent: number;
    openInterest: number;
    openInterestChange: number;
    openInterestChangePercent: number;
    volume: number;
    bid: number;
    ask: number;
    previousClose: number;
    asOf: string;
    sourceUrl: string;
}

function parseNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    const cleaned = String(value ?? '')
        .replace(/,/g, '')
        .replace(/[^0-9.+-]/g, '');
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
}

function extractNextDataJson(html: string): string | null {
    const marker = '<script id="__NEXT_DATA__" type="application/json">';
    const markerIndex = html.indexOf(marker);
    if (markerIndex < 0) {
        return null;
    }

    const start = markerIndex + marker.length;
    const end = html.indexOf('</script>', start);
    if (end < 0) {
        return null;
    }

    return html.slice(start, end);
}

function parseLastUpdated(lastupd: unknown, lastupdTime: unknown): string {
    const compact = String(lastupd ?? '').replace(/\D/g, '');
    if (compact.length === 14) {
        const iso = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}T${compact.slice(8, 10)}:${compact.slice(10, 12)}:${compact.slice(12, 14)}+05:30`;
        const parsed = new Date(iso);
        if (Number.isFinite(parsed.getTime())) {
            return parsed.toISOString();
        }
    }

    const fallback = new Date(String(lastupdTime || '')).toISOString();
    if (fallback !== 'Invalid Date') {
        return fallback;
    }

    return new Date().toISOString();
}

/**
 * Moneycontrol commodity page currently exposes structured market data inside
 * the Next.js bootstrap payload (`__NEXT_DATA__`). If that payload is removed
 * or blocked, callers must fallback to their existing provider chain.
 */
export async function fetchMoneycontrolMcxSnapshot(expiry: string = '2026-02-24'): Promise<MoneycontrolMcxSnapshot | null> {
    const sourceUrl = `https://www.moneycontrol.com/commodity/mcx-naturalgas-price/?type=futures&exp=${encodeURIComponent(expiry)}`;

    try {
        const response = await fetch(sourceUrl, {
            cache: 'no-store',
            headers: {
                'User-Agent': 'Mozilla/5.0',
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        });

        if (!response.ok) {
            return null;
        }

        const html = await response.text();
        const nextDataJson = extractNextDataJson(html);
        if (!nextDataJson) {
            return null;
        }

        const payload = JSON.parse(nextDataJson) as {
            props?: {
                pageProps?: {
                    data?: {
                        commodityData?: Record<string, unknown>;
                    };
                };
            };
        };

        const commodityData = payload?.props?.pageProps?.data?.commodityData;
        if (!commodityData) {
            return null;
        }

        const lastPrice = parseNumber(commodityData.lastPrice);
        if (!Number.isFinite(lastPrice) || lastPrice <= 0) {
            return null;
        }

        const change = parseNumber(commodityData.change);
        const changePercent = parseNumber(commodityData.perChange);

        return {
            symbol: String(commodityData.symbol || 'NATURALGAS').toUpperCase(),
            expiry: String(commodityData.EXPIRY || '') || null,
            contractMonth: String(commodityData.contractMonth || '') || null,
            lastPrice,
            change,
            changePercent,
            openInterest: parseNumber(commodityData.openInt),
            openInterestChange: parseNumber(commodityData.openIntChg),
            openInterestChangePercent: parseNumber(commodityData.openIntChgPerc),
            volume: parseNumber(commodityData.tradedVol),
            bid: parseNumber(commodityData.bidPrice),
            ask: parseNumber(commodityData.askPrice),
            previousClose: parseNumber(commodityData.prevClose),
            asOf: parseLastUpdated(commodityData.lastupd, commodityData.lastupdTime),
            sourceUrl
        };
    } catch {
        return null;
    }
}
