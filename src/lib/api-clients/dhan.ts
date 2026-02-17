import { normalizeDhanAuthToken } from '@/lib/utils/dhan-auth';

export interface DhanCredentials {
    authToken: string;
}

export interface DhanOptionChainRequest {
    segId: number;
    underlyingSid: number;
    expiry?: number;
}

export interface DhanOptionGreeks {
    delta?: number;
    theta?: number;
    gamma?: number;
    vega?: number;
    rho?: number;
    theoryprc?: number;
}

export interface DhanOptionLegRaw {
    sid?: number | string;
    sym?: string;
    disp_sym?: string;
    ltp?: number;
    OI?: number;
    vol?: number;
    iv?: number;
    optgeeks?: DhanOptionGreeks;
    bp?: number;
    ap?: number;
    bq?: number;
    aq?: number;
}

export interface DhanOptionStrikeRaw {
    ce?: DhanOptionLegRaw;
    pe?: DhanOptionLegRaw;
    mploss?: number;
    oipcr?: number;
    volpcr?: number;
    exptype?: string;
}

export interface DhanFutureLegRaw {
    sid?: number | string;
    sym?: string;
    disp_sym?: string;
    ltp?: number;
    daystoexp?: number;
    expdate?: number;
}

export interface DhanOptionChainRaw {
    oc?: Record<string, DhanOptionStrikeRaw>;
    explst?: number[];
    fl?: Record<string, DhanFutureLegRaw>;
    sltp?: number;
    exch?: string;
    seg?: string;
    olot?: number;
    omulti?: number;
    otick?: number;
    oinst?: string;
}

interface DhanOptionChainEnvelope {
    code?: number;
    message?: string;
    data?: DhanOptionChainRaw;
}

interface DhanFutureInstrument {
    exchange: string;
    segment: string;
    securityId: number;
    tradingSymbol: string;
    symbolName: string;
    expiry: string;
}

const DHAN_OPTCHAIN_URL = 'https://scanx.dhan.co/scanx/optchain';
const DHAN_SCRIP_MASTER_URL = 'https://images.dhan.co/api-data/api-scrip-master.csv';
const SCRIP_MASTER_TTL_MS = 6 * 60 * 60 * 1000;

let scripMasterCache:
    | {
          fetchedAt: number;
          futures: DhanFutureInstrument[];
      }
    | null = null;

export async function fetchDhanOptionChainRaw(
    credentials: DhanCredentials,
    request: DhanOptionChainRequest
): Promise<DhanOptionChainRaw> {
    const authToken = normalizeDhanAuthToken(credentials.authToken);
    if (!authToken) {
        throw new Error('Missing Dhan auth token');
    }

    const payload = {
        Data: {
            Seg: Number(request.segId),
            Sid: Number(request.underlyingSid),
            Exp: Number(request.expiry ?? -1)
        }
    };

    const tokenCandidates = buildAuthTokenCandidates(authToken);
    let lastUnauthorizedDetails = '';

    for (const tokenCandidate of tokenCandidates) {
        const response = await fetch(DHAN_OPTCHAIN_URL, {
            method: 'POST',
            headers: {
                Auth: tokenCandidate,
                'Content-Type': 'application/json',
                Accept: 'application/json, text/plain, */*',
                Origin: 'https://web.dhan.co',
                Referer: 'https://web.dhan.co/advancedoptionchain',
                'User-Agent': 'Mozilla/5.0'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const details = await safeReadText(response);
            if (response.status === 401) {
                lastUnauthorizedDetails = details || lastUnauthorizedDetails;
                continue;
            }
            throw new Error(`Dhan option chain fetch failed: ${response.status}${details ? ` (${details})` : ''}`);
        }

        const envelope = (await response.json()) as DhanOptionChainEnvelope;
        if (typeof envelope.code !== 'number') {
            throw new Error('Unexpected Dhan option chain response format');
        }

        if (envelope.code !== 0) {
            const msg = envelope.message || 'Unknown Dhan API error';
            throw new Error(`Dhan option chain API error: ${msg}`);
        }

        if (!envelope.data) {
            throw new Error('Dhan option chain response has no data payload');
        }

        return envelope.data;
    }

    throw new Error(
        `Dhan authentication failed (401). Please login to Dhan and refresh token. Use Local Storage key "policeToken".${lastUnauthorizedDetails ? ` (${lastUnauthorizedDetails})` : ''}`
    );
}

export async function resolveDhanUnderlyingInstrument(
    exchange: string,
    segment: string,
    underlying: string
): Promise<DhanFutureInstrument> {
    const futures = await getDhanFutureInstruments();

    const normalizedExchange = exchange.toUpperCase();
    const normalizedSegment = segment.toUpperCase();
    const normalizedUnderlying = normalizeSymbol(underlying);

    const candidates = futures
        .filter((row) =>
            row.exchange === normalizedExchange &&
            row.segment === normalizedSegment &&
            normalizeSymbol(row.symbolName) === normalizedUnderlying
        )
        .sort((a, b) => toDateTs(a.expiry) - toDateTs(b.expiry));

    if (candidates.length === 0) {
        throw new Error(`No Dhan underlying instrument found for ${exchange}:${underlying}`);
    }

    const now = Date.now();
    const nearest = candidates.find((row) => toDateTs(row.expiry) >= now - 24 * 60 * 60 * 1000);
    return nearest || candidates[0];
}

export function mapDhanSegId(exchange: string, segment: string): number {
    const ex = exchange.toUpperCase();
    const seg = segment.toUpperCase();

    if (seg === 'I') return 0;

    if (ex === 'NSE') {
        if (seg === 'E') return 1;
        if (seg === 'D') return 2;
        if (seg === 'C') return 3;
        if (seg === 'M') return 10;
    }

    if (ex === 'BSE') {
        if (seg === 'E') return 4;
        if (seg === 'C') return 7;
        if (seg === 'D') return 8;
        if (seg === 'M') return 9;
    }

    if (ex === 'MCX' && seg === 'M') return 5;
    if (ex === 'NCDEX' && seg === 'M') return 6;
    if (ex === 'ICEX' && seg === 'M') return 11;

    return -1;
}

async function getDhanFutureInstruments(): Promise<DhanFutureInstrument[]> {
    const now = Date.now();
    if (scripMasterCache && now - scripMasterCache.fetchedAt < SCRIP_MASTER_TTL_MS) {
        return scripMasterCache.futures;
    }

    const response = await fetch(DHAN_SCRIP_MASTER_URL, {
        headers: {
            'User-Agent': 'Mozilla/5.0'
        }
    });

    if (!response.ok) {
        throw new Error(`Dhan scrip master fetch failed: ${response.status}`);
    }

    const csv = await response.text();
    const rows = csv.split(/\r?\n/).filter(Boolean);
    if (rows.length <= 1) {
        throw new Error('Dhan scrip master is empty');
    }

    const header = parseCsvLine(rows[0]);
    const index = (key: string) => header.findIndex((h) => h === key);

    const idx = {
        exchange: index('SEM_EXM_EXCH_ID'),
        segment: index('SEM_SEGMENT'),
        securityId: index('SEM_SMST_SECURITY_ID'),
        instrumentName: index('SEM_INSTRUMENT_NAME'),
        tradingSymbol: index('SEM_TRADING_SYMBOL'),
        expiryDate: index('SEM_EXPIRY_DATE'),
        symbolName: index('SM_SYMBOL_NAME')
    };

    const futures: DhanFutureInstrument[] = [];
    for (let i = 1; i < rows.length; i++) {
        const values = parseCsvLine(rows[i]);
        if (values.length === 0) continue;

        if (values[idx.instrumentName] !== 'FUTCOM') continue;

        const securityId = Number(values[idx.securityId]);
        if (!Number.isFinite(securityId) || securityId <= 0) continue;

        futures.push({
            exchange: (values[idx.exchange] || '').toUpperCase(),
            segment: (values[idx.segment] || '').toUpperCase(),
            securityId,
            tradingSymbol: values[idx.tradingSymbol] || '',
            symbolName: values[idx.symbolName] || '',
            expiry: values[idx.expiryDate] || ''
        });
    }

    scripMasterCache = {
        fetchedAt: now,
        futures
    };

    return futures;
}

function parseCsvLine(line: string): string[] {
    const out: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];

        if (ch === '"') {
            if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (ch === ',' && !inQuotes) {
            out.push(current);
            current = '';
            continue;
        }

        current += ch;
    }

    out.push(current);
    return out;
}

function normalizeSymbol(value: string): string {
    return value.toUpperCase().replace(/\s+/g, '');
}

function toDateTs(value: string): number {
    if (!value) return Number.MAX_SAFE_INTEGER;
    const dateOnly = value.includes(' ') ? value.split(' ')[0] : value;
    const ts = new Date(`${dateOnly}T00:00:00Z`).getTime();
    return Number.isFinite(ts) ? ts : Number.MAX_SAFE_INTEGER;
}

async function safeReadText(response: Response): Promise<string> {
    try {
        const text = await response.text();
        return text.trim();
    } catch {
        return '';
    }
}

function buildAuthTokenCandidates(primaryToken: string): string[] {
    const candidates = new Set<string>();
    const trimmed = primaryToken.trim();
    if (trimmed) {
        candidates.add(trimmed);
    }

    if (trimmed.includes('%')) {
        try {
            candidates.add(decodeURIComponent(trimmed));
        } catch {
            // Ignore decode failures.
        }
    }

    return Array.from(candidates).filter(Boolean);
}
