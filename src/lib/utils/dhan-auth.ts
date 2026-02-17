const TOKEN_KEYS = [
    'policeToken',
    'authToken',
    'token',
    'verification_token',
    'verificationToken',
    'fundamentalToken'
] as const;

type TokenLikeRecord = Record<string, unknown>;

export function normalizeDhanAuthToken(input: unknown): string {
    const token = extractDhanAuthToken(input);
    return token ?? '';
}

export function extractDhanAuthToken(input: unknown): string | null {
    if (input == null) {
        return null;
    }

    if (typeof input === 'object') {
        return extractFromRecord(input as TokenLikeRecord);
    }

    const raw = String(input).trim();
    if (!raw) {
        return null;
    }

    const withoutBearer = stripBearerPrefix(raw);
    if (withoutBearer !== raw) {
        const parsed = extractDhanAuthToken(withoutBearer);
        if (parsed) {
            return parsed;
        }
    }

    const fromJson = tryParseJson(raw);
    if (fromJson != null) {
        const parsed = extractDhanAuthToken(fromJson);
        if (parsed) {
            return parsed;
        }
    }

    const decoded = tryDecodeURIComponent(raw);
    if (decoded && decoded !== raw) {
        const parsed = extractDhanAuthToken(decoded);
        if (parsed) {
            return parsed;
        }
    }

    const unwrapped = unwrapQuotes(raw);
    if (unwrapped !== raw) {
        const parsed = extractDhanAuthToken(unwrapped);
        if (parsed) {
            return parsed;
        }
    }

    const kvToken = extractFromKeyValueText(raw);
    if (kvToken) {
        return kvToken;
    }

    const jwtToken = extractJwtLikeToken(raw);
    if (jwtToken) {
        return jwtToken;
    }

    return raw;
}

function extractFromRecord(record: TokenLikeRecord): string | null {
    for (const key of TOKEN_KEYS) {
        const candidate = record[key];
        if (candidate == null) {
            continue;
        }

        const parsed = extractDhanAuthToken(candidate);
        if (parsed) {
            return parsed;
        }
    }

    if (typeof record.data === 'object' && record.data != null) {
        const parsed = extractDhanAuthToken(record.data);
        if (parsed) {
            return parsed;
        }
    }

    return null;
}

function unwrapQuotes(value: string): string {
    let current = value.trim();
    while (
        current.length >= 2 &&
        ((current.startsWith('"') && current.endsWith('"')) ||
            (current.startsWith("'") && current.endsWith("'")))
    ) {
        current = current.slice(1, -1).trim();
    }
    return current;
}

function tryParseJson(value: string): unknown | null {
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

function extractFromKeyValueText(value: string): string | null {
    const patterns = [
        /\bpoliceToken\b\s*[:=]\s*['"]?([^'",\s}]+)/i,
        /\bpoliceToken\b\s+([^\s]+)/i,
        /\bauthToken\b\s*[:=]\s*['"]?([^'",\s}]+)/i,
        /\bverification_token\b\s*[:=]\s*['"]?([^'",\s}]+)/i,
        /\btoken\b\s*[:=]\s*['"]?([^'",\s}]+)/i
    ];

    for (const pattern of patterns) {
        const match = value.match(pattern);
        if (match?.[1]) {
            return unwrapQuotes(match[1]);
        }
    }

    return null;
}

function extractJwtLikeToken(value: string): string | null {
    const match = value.match(/[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/);
    return match?.[0] ?? null;
}

function stripBearerPrefix(value: string): string {
    return value.replace(/^Bearer\s+/i, '').trim();
}

function tryDecodeURIComponent(value: string): string | null {
    if (!value.includes('%')) {
        return null;
    }

    try {
        return decodeURIComponent(value);
    } catch {
        return null;
    }
}
