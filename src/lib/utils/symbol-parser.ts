/**
 * Utility to parse MCX Option symbols
 * Supports both common contract styles:
 * 1) SYMBOL YY MON STRIKE TYPE  (example: NATGAS26FEB300CE)
 * 2) SYMBOL DD MON STRIKE TYPE  (example: NATGAS20FEB300CE)
 */

const MONTH_MAP: Record<string, number> = {
    'JAN': 0, 'FEB': 1, 'MAR': 2, 'APR': 3, 'MAY': 4, 'JUN': 5,
    'JUL': 6, 'AUG': 7, 'SEP': 8, 'OCT': 9, 'NOV': 10, 'DEC': 11
};

export interface ParsedOption {
    symbol: string;
    expiryDate: Date;
    strike: number;
    type: 'CE' | 'PE';
    isValid: boolean;
}

function buildExpiryDate(year: number, month: number, day: number): Date | null {
    const candidate = new Date(year, month, day, 15, 30, 0, 0);
    if (
        candidate.getFullYear() !== year ||
        candidate.getMonth() !== month ||
        candidate.getDate() !== day
    ) {
        return null;
    }
    return candidate;
}

function pickNearestFutureDate(candidates: Date[], now: Date): Date | null {
    const graceMs = 24 * 60 * 60 * 1000; // Keep "today" valid through end-of-day transitions.
    const future = candidates
        .filter((date) => date.getTime() >= now.getTime() - graceMs)
        .sort((a, b) => a.getTime() - b.getTime());

    if (future.length > 0) {
        return future[0];
    }

    if (candidates.length === 0) {
        return null;
    }

    return candidates.sort((a, b) => b.getTime() - a.getTime())[0];
}

function resolveExpiryDateFromToken(token: number, month: number, now: Date): Date | null {
    const currentYear = now.getFullYear();
    const parsedYear = 2000 + token;

    // If token cannot be a day, interpret directly as year.
    if (token > 31) {
        return buildExpiryDate(parsedYear, month, 26);
    }

    const dayThisYear = buildExpiryDate(currentYear, month, token);
    const dayNextYear = buildExpiryDate(currentYear + 1, month, token);
    const yearStyle = buildExpiryDate(parsedYear, month, 26);

    // For live positions, symbols that map to a past year are usually DD-MMM contracts.
    if (parsedYear < currentYear || parsedYear > currentYear + 1) {
        return pickNearestFutureDate(
            [dayThisYear, dayNextYear].filter((d): d is Date => d !== null),
            now
        );
    }

    // Ambiguous token: choose the closest non-expired candidate.
    return pickNearestFutureDate(
        [dayThisYear, dayNextYear, yearStyle].filter((d): d is Date => d !== null),
        now
    );
}

export function parseOptionSymbol(tradingSymbol: string): ParsedOption | null {
    // Regex to match MCX Natural Gas Options
    // Matches: (SYMBOL) (TOKEN) (MON) (STRIKE) (TYPE)
    // Supports optional spaces
    const pattern = /^([A-Z]+)\s*(\d{2})\s*([A-Z]{3})\s*(\d+(?:\.\d+)?)\s*(CE|PE)$/i;
    const match = tradingSymbol.toUpperCase().match(pattern);

    if (!match) {
        return null;
    }

    const [, symbol, tokenStr, monthStr, strikeStr, type] = match;

    const token = parseInt(tokenStr, 10);
    const month = MONTH_MAP[monthStr];

    if (month === undefined) {
        return null; // Invalid month
    }

    const expiryDate = resolveExpiryDateFromToken(token, month, new Date());
    if (!expiryDate) {
        return null;
    }

    return {
        symbol,
        expiryDate,
        strike: parseFloat(strikeStr),
        type: type as 'CE' | 'PE',
        isValid: true
    };
}

export function getYearsToExpiry(expiryDate: Date): number {
    const now = new Date();
    const diffTime = expiryDate.getTime() - now.getTime();
    const diffDays = diffTime / (1000 * 60 * 60 * 24);

    if (diffDays <= 0) return 0; // Expired or expiring today

    return diffDays / 365.25;
}
