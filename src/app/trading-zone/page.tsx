'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Navbar from '@/components/layout/Navbar';
import {
    Shield, AlertTriangle, Clock,
    RefreshCw, Settings, XCircle, Activity,
    ArrowUpRight, ArrowDownRight, Minus, Zap,
    Calculator, Scale
} from 'lucide-react';

interface Greeks {
    delta: number;
    theta: number;
    gamma: number;
    vega: number;
    rho: number;
}

interface PositionAnalysis {
    symbol: string;
    quantity: number;
    quantityUnits?: number;
    numberOfLots?: number;
    lotSize?: number;
    instrumentType?: 'OPTION' | 'FUTURE' | 'OTHER';
    avgPrice: number;
    ltp: number;
    pnl: number;
    pnlPercent: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    greeks?: Greeks;
    isITM?: boolean;
    recommendations: AdjustmentRecommendation[];
}

interface AdjustmentRecommendation {
    action: 'HOLD' | 'ADD' | 'REDUCE' | 'EXIT' | 'HEDGE' | 'ROLL';
    reason: string;
    urgency: 'LOW' | 'MEDIUM' | 'HIGH';
    suggestedQuantity?: number;
    targetPrice?: number;
}

interface PortfolioAnalysis {
    netDelta: number;
    netTheta: number;
    dayDecay?: number;
    recommendations: string[];
}

interface MarketCondition {
    trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    volatility: 'LOW' | 'MEDIUM' | 'HIGH';
    rsi?: number;
    atr?: number;
    underlyingPrice?: number;
}

interface PositionMonitorResponse {
    timestamp: string;
    positionCount: number;
    totalPnL: number;
    marketCondition: MarketCondition;
    positions: PositionAnalysis[];
    portfolio: PortfolioAnalysis;
}

interface OptionChainLegQuote {
    tradingsymbol: string;
    instrumentToken: number;
    optionType: 'CE' | 'PE';
    strikePrice: number;
    expiry: string;
    lotSize: number;
    ltp: number;
    oi: number;
    volume: number;
    buyQuantity: number;
    sellQuantity: number;
    bestBidPrice: number;
    bestBidQuantity: number;
    bestAskPrice: number;
    bestAskQuantity: number;
    spread: number;
    spreadPercent: number;
    delta?: number;
    theta?: number;
}

interface OptionChainRow {
    strikePrice: number;
    ce?: OptionChainLegQuote;
    pe?: OptionChainLegQuote;
}

interface OptionChainResponse {
    source: 'RUPEEZY_PUBLIC';
    fetchedAt: string;
    exchange: string;
    underlying: string;
    quoteError?: string | null;
    selectedExpiry: string | null;
    availableExpiries: string[];
    futureSymbol: string | null;
    futureLtp: number | null;
    futureChange?: number | null;
    futureChangePercent?: number | null;
    strikes: OptionChainRow[];
}

const PRICE_REFRESH_INTERVAL_MS = 5 * 1000;
const POSITION_REFRESH_INTERVAL_MS = 15 * 1000;
const OAUTH_PENDING_KEY = 'zerodha_oauth_pending_v1';

type PendingOAuthCredentials = {
    apiKey: string;
    apiSecret: string;
};

function savePendingOAuthCredentials(payload: PendingOAuthCredentials) {
    try {
        window.sessionStorage.setItem(OAUTH_PENDING_KEY, JSON.stringify(payload));
    } catch {
        // Ignore storage issues.
    }
}

function loadPendingOAuthCredentials(): PendingOAuthCredentials | null {
    try {
        const raw = window.sessionStorage.getItem(OAUTH_PENDING_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as PendingOAuthCredentials;
        if (!parsed || typeof parsed.apiKey !== 'string' || typeof parsed.apiSecret !== 'string') {
            return null;
        }
        return {
            apiKey: parsed.apiKey.trim(),
            apiSecret: parsed.apiSecret.trim()
        };
    } catch {
        return null;
    }
}

function clearPendingOAuthCredentials() {
    try {
        window.sessionStorage.removeItem(OAUTH_PENDING_KEY);
    } catch {
        // Ignore storage issues.
    }
}

function normalizeTradingSymbol(symbol: string): string {
    return symbol.toUpperCase().replace(/\s+/g, '');
}

function formatCompact(value?: number): string {
    if (value == null || !Number.isFinite(value)) {
        return '-';
    }
    return value.toFixed(2);
}

function formatInteger(value?: number): string {
    if (value == null || !Number.isFinite(value)) {
        return '-';
    }
    return Math.round(value).toLocaleString('en-IN');
}

function formatGreeks(delta?: number, theta?: number): string {
    const d = Number.isFinite(delta) ? (delta as number).toFixed(3) : '-';
    const t = Number.isFinite(theta) ? (theta as number).toFixed(2) : '-';
    return `D ${d} | T ${t}`;
}

function formatSigned(value?: number | null, decimals = 2): string {
    if (!Number.isFinite(value)) return '-';
    const n = value as number;
    return `${n >= 0 ? '+' : ''}${n.toFixed(decimals)}`;
}

function formatLiveTimestamp(value: Date | null): string {
    if (!value) return '--:--:--';
    return value.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
}

function getFutureMonthLabel(expiry?: string | null): string {
    if (!expiry) return 'FUT';
    const ts = new Date(`${expiry}T00:00:00Z`).getTime();
    if (!Number.isFinite(ts)) return 'FUT';
    return `${new Date(ts).toLocaleString('en-IN', { month: 'short' }).toUpperCase()} FUT`;
}

export default function TradingZone() {
    const [data, setData] = useState<PositionMonitorResponse | null>(null);
    const [optionChain, setOptionChain] = useState<OptionChainResponse | null>(null);
    const [optionChainWarning, setOptionChainWarning] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastPriceUpdated, setLastPriceUpdated] = useState<Date | null>(null);
    const [lastPositionsUpdated, setLastPositionsUpdated] = useState<Date | null>(null);
    // credentials holds only what the user types in the form — never raw secrets from DB
    const [credentials, setCredentials] = useState({ apiKey: '', apiSecret: '', accessToken: '' });
    const [loginMethod, setLoginMethod] = useState<'TOKEN' | 'OAUTH'>('OAUTH');
    // hasStoredApiSetup = DB has encrypted api_key + api_secret for this user
    const [hasStoredApiSetup, setHasStoredApiSetup] = useState(false);
    // hasStoredAccessToken = DB has an encrypted access_token (session may still be valid)
    const [hasStoredAccessToken, setHasStoredAccessToken] = useState(false);
    const [isConfigured, setIsConfigured] = useState(false);
    const [isProcessingLogin, setIsProcessingLogin] = useState(false);
    const [positionView, setPositionView] = useState<'COMPACT' | 'DETAILED'>('COMPACT');
    const oauthAbortRef = useRef<AbortController | null>(null);

    const loadCredentialsFromProfile = useCallback(async () => {
        try {
            const res = await fetch('/api/profile/zerodha', { cache: 'no-store' });
            const json = await res.json().catch(() => null);
            return { ok: res.ok, payload: json };
        } catch {
            return { ok: false, payload: null };
        }
    }, []);

    useEffect(() => {
        (async () => {
            const { ok, payload } = await loadCredentialsFromProfile();
            if (!ok) {
                if (payload?.error) setError(String(payload.error));
                return;
            }
            if (payload?.warning) {
                setError(String(payload.warning));
            }
            // GET /api/profile/zerodha returns masked flags — never raw secrets
            const saved = payload?.credentials;
            if (saved) {
                // apiKeyMasked = "****xxxx" — confirms key is saved
                const keyStored = Boolean(saved.apiKeyMasked && saved.apiKeyMasked !== '****');
                const secretStored = Boolean(saved.hasApiSecret);
                const tokenStored = Boolean(saved.hasAccessToken);
                if (keyStored && secretStored) {
                    setHasStoredApiSetup(true);
                }
                if (tokenStored) {
                    setHasStoredAccessToken(true);
                    // If we have a stored access token, auto-configure (positions fetched server-side)
                    setIsConfigured(true);
                }
            }
        })();

        const params = new URLSearchParams(window.location.search);
        const requestToken = params.get('request_token');
        const status = params.get('status');

        if (status === 'success' && requestToken) {
            handleOAuthCallback(requestToken);
        } else if (status === 'error') {
            setError('Login failed or was cancelled by user.');
            clearPendingOAuthCredentials();
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }, [loadCredentialsFromProfile]);

    const handleOAuthCallback = async (requestToken: string) => {
        setIsProcessingLogin(true);
        setError(null);

        let apiKey = '';
        let apiSecret = '';
        let profileWarning = '';
        let usedPendingCredentials = false;
        const profileResult = await loadCredentialsFromProfile();
        const profileJson = profileResult.payload;
        apiKey = String(profileJson?.credentials?.apiKey || '');
        apiSecret = String(profileJson?.credentials?.apiSecret || '');
        profileWarning = String(profileJson?.warning || '');

        if (!apiKey || !apiSecret) {
            const pending = loadPendingOAuthCredentials();
            if (pending) {
                apiKey = pending.apiKey;
                apiSecret = pending.apiSecret;
                usedPendingCredentials = true;
            }
        }

        if (!apiKey || !apiSecret) {
            setError(
                profileWarning ||
                'Missing API Key/Secret in profile. Please enter credentials and start login again.'
            );
            setIsProcessingLogin(false);
            return;
        }

        try {
            oauthAbortRef.current?.abort();
            const controller = new AbortController();
            oauthAbortRef.current = controller;
            const res = await fetch('/api/auth/zerodha', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(
                    usedPendingCredentials
                        ? { requestToken, apiKey, apiSecret }
                        : { requestToken }
                ),
                signal: controller.signal
            });

            const response = await res.json();
            if (!res.ok) {
                throw new Error(response.error || 'Token exchange failed');
            }

            // Token exchange succeeded — access token is now stored in DB by /api/auth/zerodha
            // We never receive the raw access token on the client
            if (apiKey && apiSecret) {
                setHasStoredApiSetup(true);
            }
            setHasStoredAccessToken(true);
            setIsConfigured(true);
            clearPendingOAuthCredentials();
            window.history.replaceState({}, document.title, window.location.pathname);
            fetchPositions();
            fetchOptionChain();
        } catch (err: any) {
            if (err?.name === 'AbortError') {
                setError('Login aborted.');
            } else {
                console.error(err);
                setError(err.message || 'Login failed during token exchange');
            }
        } finally {
            setIsProcessingLogin(false);
        }
    };

    const handleLoginRedirect = async () => {
        setError(null);
        let apiKey = credentials.apiKey.trim();
        let apiSecret = credentials.apiSecret.trim();

        if (!apiKey || !apiSecret) {
            const profileResult = await loadCredentialsFromProfile();
            apiKey = apiKey || String(profileResult.payload?.credentials?.apiKey || '').trim();
            apiSecret = apiSecret || String(profileResult.payload?.credentials?.apiSecret || '').trim();
        }

        if (!apiKey || !apiSecret) {
            setError('API Key and API Secret are required for one-time setup.');
            return;
        }

        savePendingOAuthCredentials({ apiKey, apiSecret });

        // Persist key/secret to the signed-in user profile before redirecting.
        try {
            const saveRes = await fetch('/api/profile/zerodha', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credentials: { apiKey, apiSecret } })
            });
            if (!saveRes.ok) {
                const saveJson = await saveRes.json().catch(() => null);
                setError(saveJson?.error || 'Failed to save API credentials to profile.');
                return;
            }
            setHasStoredApiSetup(true);
            setCredentials((prev) => ({ ...prev, apiKey, apiSecret }));
        } catch {
            setError('Failed to save API credentials to profile.');
            return;
        }

        const redirectUrl = window.location.origin + window.location.pathname;
        const loginUrl = `https://kite.zerodha.com/connect/login?v=3&api_key=${apiKey}&redirect_params=${encodeURIComponent(`redirect_url=${redirectUrl}`)}`;
        window.location.href = loginUrl;
    };

    const handleManualConfigure = async () => {
        setError(null);
        const accessToken = credentials.accessToken.trim();
        if (!accessToken) {
            setError('Access token is required.');
            return;
        }

        if (!hasStoredApiSetup && !credentials.apiKey.trim()) {
            setError('API Key not found in profile. Complete one-time API setup first.');
            return;
        }

        // Save the manually-entered access token to DB (encrypted server-side)
        // Also save api_key if provided
        const saveBody: Record<string, string> = { accessToken };
        if (credentials.apiKey.trim()) saveBody.apiKey = credentials.apiKey.trim();
        if (credentials.apiSecret.trim()) saveBody.apiSecret = credentials.apiSecret.trim();

        try {
            const saveRes = await fetch('/api/profile/zerodha', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(saveBody)
            });
            if (!saveRes.ok) {
                const saveJson = await saveRes.json().catch(() => null);
                setError(saveJson?.error || 'Failed to save access token to profile.');
                return;
            }
        } catch {
            setError('Failed to save access token to profile.');
            return;
        }

        if (credentials.apiKey.trim() && credentials.apiSecret.trim()) {
            setHasStoredApiSetup(true);
        }
        setHasStoredAccessToken(true);
        setIsConfigured(true);
        fetchPositions();
        fetchOptionChain();
    };

    const handleLogout = () => {
        setIsConfigured(false);
        setHasStoredAccessToken(false);
        setCredentials({ apiKey: '', apiSecret: '', accessToken: '' });
        clearPendingOAuthCredentials();
        // Clear only the access token from DB — keep api_key/secret for next login
        fetch('/api/auth/zerodha', { method: 'DELETE' }).catch(() => null);
        setData(null);
        setOptionChain(null);
        setOptionChainWarning(null);
        setLastPriceUpdated(null);
        setLastPositionsUpdated(null);
        setError(null);
    };

    const fetchOptionChain = useCallback(async () => {
        const chainPayload: Record<string, unknown> = {
            exchange: 'MCX',
            underlying: 'NATURALGAS',
            maxStrikes: 30
        };

        try {
            const chainRes = await fetch('/api/option-chain', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(chainPayload)
            });

            const chainJson = await chainRes.json().catch(() => null);
            if (chainRes.ok && chainJson?.strikes) {
                setOptionChain(chainJson as OptionChainResponse);
                setOptionChainWarning(chainJson?.quoteError || null);
                setLastPriceUpdated(chainJson?.fetchedAt ? new Date(chainJson.fetchedAt) : new Date());
            } else {
                setOptionChain(null);
                setOptionChainWarning(
                    chainJson?.error || 'Live option chain unavailable. Position diagnostics use position feed only.'
                );
            }
        } catch {
            setOptionChain(null);
            setOptionChainWarning('Live option chain unavailable. Position diagnostics use position feed only.');
        }
    }, []);

    const fetchPositions = useCallback(async () => {
        // Positions are fetched server-side using the stored (encrypted) access token
        // No credentials needed on the client side
        const shouldShowLoader = !data;

        try {
            if (shouldShowLoader) {
                setLoading(true);
            }

            const res = await fetch('/api/positions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });

            const json = await res.json();
            if (!res.ok) {
                if (res.status === 403 || res.status === 401 || json.error?.includes('Token')) {
                    throw new Error('Session expired or invalid token. Please login again.');
                }
                throw new Error(json.error || `HTTP ${res.status}`);
            }

            setData(json);
            setError(null);
            setLastPositionsUpdated(json?.timestamp ? new Date(json.timestamp) : new Date());
        } catch (err: any) {
            setError(err.message || 'Failed to fetch positions');
        } finally {
            if (shouldShowLoader) {
                setLoading(false);
            }
        }
    }, [data]);

    useEffect(() => {
        if (!isConfigured) return;
        fetchPositions();
        fetchOptionChain();

        const positionTimer = setInterval(fetchPositions, POSITION_REFRESH_INTERVAL_MS);
        const priceTimer = setInterval(fetchOptionChain, PRICE_REFRESH_INTERVAL_MS);

        return () => {
            clearInterval(positionTimer);
            clearInterval(priceTimer);
        };
    }, [fetchOptionChain, fetchPositions, isConfigured]);

    if (isProcessingLogin) {
        return (
            <div className="min-h-screen bg-slate-100 dark:bg-zinc-950 flex flex-col">
                <Navbar />
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center space-y-4">
                        <RefreshCw className="w-12 h-12 text-violet-500 animate-spin mx-auto" />
                        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Logging in to Zerodha...</h2>
                        <p className="text-zinc-500">Exchanging request token for access token</p>
                        <button
                            onClick={() => {
                                oauthAbortRef.current?.abort();
                                setIsProcessingLogin(false);
                                setError('Login aborted.');
                                window.history.replaceState({}, document.title, window.location.pathname);
                            }}
                            className="mx-auto mt-2 px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 font-bold hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (!isConfigured) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-slate-100 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 flex flex-col">
                <Navbar />
                <div className="p-6 flex-1 flex items-center justify-center">
                    <div className="w-full max-w-md">
                        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 shadow-2xl">
                            <div className="flex items-center gap-3 mb-8">
                                <div className="p-3 bg-violet-500/10 rounded-xl border border-violet-500/30">
                                    <Settings className="w-6 h-6 text-violet-400" />
                                </div>
                                <div>
                                    <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100">Connect Zerodha</h1>
                                    <p className="text-sm text-zinc-500">Monitor positions and get alerts</p>
                                </div>
                            </div>
                            <div className="flex p-1 bg-slate-100 dark:bg-zinc-950 rounded-lg mb-6 border border-zinc-200 dark:border-zinc-800">
                                <button
                                    onClick={() => setLoginMethod('OAUTH')}
                                    className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-md transition ${loginMethod === 'OAUTH' ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-300'}`}
                                >
                                    Kite Login (Recommended)
                                </button>
                                <button
                                    onClick={() => setLoginMethod('TOKEN')}
                                    className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-md transition ${loginMethod === 'TOKEN' ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-300'}`}
                                >
                                    Manual Token
                                </button>
                            </div>
                            {error && (
                                <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
                                    <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
                                    <span className="text-sm text-red-400 font-bold">{error}</span>
                                </div>
                            )}
                            <div className="space-y-4">
                                {loginMethod === 'OAUTH' ? (
                                    <>
                                        {hasStoredApiSetup ? (
                                            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
                                                <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider">One-time setup completed</p>
                                                <p className="text-xs text-zinc-500 mt-1">Saved API key/secret will be used automatically.</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-4">
                                                <div>
                                                    <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">API Key</label>
                                                    <input
                                                        type="text"
                                                        value={credentials.apiKey}
                                                        onChange={(e) => setCredentials({ ...credentials, apiKey: e.target.value })}
                                                        className="w-full px-4 py-3 bg-slate-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-violet-500 transition font-mono text-sm"
                                                        placeholder="Enter API Key"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">API Secret</label>
                                                    <input
                                                        type="password"
                                                        value={credentials.apiSecret}
                                                        onChange={(e) => setCredentials({ ...credentials, apiSecret: e.target.value })}
                                                        className="w-full px-4 py-3 bg-slate-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-violet-500 transition font-mono text-sm"
                                                        placeholder="Enter API Secret"
                                                    />
                                                </div>
                                            </div>
                                        )}
                                        <button
                                            onClick={handleLoginRedirect}
                                            disabled={!hasStoredApiSetup && (!credentials.apiKey || !credentials.apiSecret)}
                                            className="w-full px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white disabled:bg-zinc-100 disabled:text-zinc-700 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500 font-bold rounded-lg transition flex items-center justify-center gap-2 mt-2"
                                        >
                                            <Zap className="w-4 h-4 fill-current" />
                                            Login with Zerodha
                                        </button>
                                        <p className="text-[10px] text-zinc-500 text-center mt-4">
                                            Redirects to official Kite login page. Use your User ID, Password and 2FA safely.
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        {hasStoredApiSetup ? (
                                            <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-3">
                                                <p className="text-xs font-bold text-cyan-400 uppercase tracking-wider">Token-only login enabled</p>
                                                <p className="text-xs text-zinc-500 mt-1">API details will be fetched from your profile automatically.</p>
                                            </div>
                                        ) : (
                                            <div>
                                                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">API Key</label>
                                                <input
                                                    type="text"
                                                    value={credentials.apiKey}
                                                    onChange={(e) => setCredentials({ ...credentials, apiKey: e.target.value })}
                                                    className="w-full px-4 py-3 bg-slate-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-violet-500 transition font-mono text-sm"
                                                    placeholder="Enter API Key (one-time setup required)"
                                                />
                                            </div>
                                        )}
                                        <div>
                                            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Access Token</label>
                                            <input
                                                type="password"
                                                value={credentials.accessToken}
                                                onChange={(e) => setCredentials({ ...credentials, accessToken: e.target.value })}
                                                className="w-full px-4 py-3 bg-slate-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-violet-500 transition font-mono text-sm"
                                                placeholder="Paste Access Token"
                                            />
                                        </div>
                                        <button
                                            onClick={handleManualConfigure}
                                            disabled={!credentials.accessToken || (!hasStoredApiSetup && !credentials.apiKey)}
                                            className="w-full px-6 py-3 bg-zinc-100 dark:bg-zinc-800 hover:bg-white dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 disabled:bg-zinc-100 disabled:text-zinc-700 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500 font-bold rounded-lg transition mt-2"
                                        >
                                            Connect Manually
                                        </button>
                                    </>
                                )}

                                <button
                                    onClick={() => {
                                        oauthAbortRef.current?.abort();
                                        setError(null);
                                        window.location.href = '/';
                                    }}
                                    className="w-full px-6 py-3 bg-transparent border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold rounded-lg transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const futurePrice = optionChain?.futureLtp;
    const futureChange = optionChain?.futureChange;
    const futureChangePercent = optionChain?.futureChangePercent;
    const futureLabel = `Natural Gas ${getFutureMonthLabel(optionChain?.selectedExpiry || null)}`;
    const futureValue = futurePrice != null && Number.isFinite(futurePrice)
        ? `Rs ${futurePrice.toFixed(2)}`
        : 'Rs -';
    const futureSubtext = futureChange != null && futureChangePercent != null
        ? `${formatSigned(futureChange, 2)} (${formatSigned(futureChangePercent, 2)}%)`
        : 'Awaiting live tick';
    const futureSubtextClass = futureChange == null
        ? 'text-zinc-500'
        : futureChange >= 0
            ? 'text-emerald-400'
            : 'text-red-400';
    const positionsUpdatedLabel = formatLiveTimestamp(lastPositionsUpdated);
    const pricesUpdatedLabel = formatLiveTimestamp(lastPriceUpdated);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-slate-100 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 flex flex-col uppercase-none">
            <Navbar />
            <div className="p-4 md:p-6">
                <div className="max-w-7xl mx-auto space-y-6 min-w-0">
                    <div className="bg-gradient-to-br from-white to-zinc-100 dark:from-zinc-900 dark:to-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-2xl">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="p-3 bg-violet-500/10 rounded-xl border border-violet-500/30">
                                    <Activity className="w-6 h-6 text-violet-400" />
                                </div>
                                <div>
                                    <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100">Trading Zone</h1>
                                    <p className="text-sm text-zinc-500">Position Monitor and Adjustment Advisor</p>
                                </div>
                            </div>
                            <div className="w-full md:w-auto flex items-center justify-between md:justify-end gap-4">
                                <div className="text-right space-y-1">
                                    <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 text-[10px] font-black uppercase tracking-wider">
                                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                        Live Auto Refresh
                                    </div>
                                    <div className="text-[11px] text-zinc-500 font-semibold">
                                        Prices (5s): <span className="font-mono text-zinc-700 dark:text-zinc-400">{pricesUpdatedLabel}</span>
                                    </div>
                                    <div className="text-[11px] text-zinc-500 font-semibold">
                                        Positions (15s): <span className="font-mono text-zinc-700 dark:text-zinc-400">{positionsUpdatedLabel}</span>
                                    </div>
                                </div>
                                <button onClick={() => setIsConfigured(false)} className="inline-flex items-center justify-center min-h-11 min-w-11 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition">
                                    <Settings className="w-4 h-4 text-zinc-700 dark:text-zinc-400" />
                                </button>
                            </div>
                        </div>

                        {data && (
                            <div className="space-y-4 mt-6">
                                <div className="grid grid-cols-2 lg:grid-cols-7 gap-4">
                                    <StatCard
                                        label={futureLabel}
                                        value={futureValue}
                                        subtext={futureSubtext}
                                        subtextClass={futureSubtextClass}
                                    />
                                    <StatCard
                                        label="Total P&L"
                                        value={data.totalPnL.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                                        valueClass={data.totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}
                                    />
                                    <StatCard
                                        label="Market Trend"
                                        value={data.marketCondition.trend}
                                        valueClass={
                                            data.marketCondition.trend === 'BULLISH' ? 'text-emerald-400' :
                                                data.marketCondition.trend === 'BEARISH' ? 'text-red-400' : 'text-zinc-700 dark:text-zinc-400'
                                        }
                                    />
                                    <StatCard
                                        label="Volatility"
                                        value={data.marketCondition.volatility}
                                        valueClass={
                                            data.marketCondition.volatility === 'HIGH' ? 'text-amber-400' : 'text-zinc-700 dark:text-zinc-400'
                                        }
                                    />
                                    <StatCard
                                        label="Net Delta"
                                        value={data.portfolio.netDelta.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                        valueClass={Math.abs(data.portfolio.netDelta) > 500 ? 'text-amber-400' : 'text-zinc-700 dark:text-zinc-400'}
                                        subtext="Rs P&L / 1 pt move"
                                    />
                                    <StatCard
                                        label="Net Theta"
                                        value={data.portfolio.netTheta.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
                                        valueClass={data.portfolio.netTheta > 0 ? 'text-emerald-400' : 'text-zinc-700 dark:text-zinc-400'}
                                        subtext="Per-day theta"
                                    />
                                    <StatCard
                                        label="Decay (to next open)"
                                        value={(data.portfolio.dayDecay || data.portfolio.netTheta || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
                                        valueClass={(data.portfolio.dayDecay || 0) > 0 ? 'text-emerald-400' : 'text-zinc-700 dark:text-zinc-400'}
                                        subtext="Projected decay value"
                                    />
                                </div>

                                {data.portfolio.recommendations.length > 0 && (
                                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Scale className="w-4 h-4 text-blue-400" />
                                            <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">Portfolio Strategy</span>
                                        </div>
                                        <div className="space-y-1">
                                            {data.portfolio.recommendations.map((rec, i) => (
                                                <p key={i} className="text-sm text-zinc-700 dark:text-zinc-300">{rec}</p>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <AlertTriangle className="w-5 h-5 text-red-400" />
                                <span className="text-red-400 font-bold">{error}</span>
                            </div>
                            <button onClick={handleLogout} className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold uppercase rounded-lg border border-red-500/20 transition">Reset Credentials</button>
                        </div>
                    )}

                    {loading && !data && (
                        <div className="flex items-center justify-center py-16">
                            <div className="flex flex-col items-center gap-4">
                                <RefreshCw className="w-8 h-8 text-violet-400 animate-spin" />
                                <span className="text-sm text-zinc-500 font-bold">Fetching positions...</span>
                            </div>
                        </div>
                    )}

                    {data && data.positions.length > 0 && (
                        <>
                            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 grid grid-cols-1 md:grid-cols-[1fr_auto] items-center gap-3">
                                <div>
                                    <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                                        Positions Overview
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 mt-1">
                                        {(() => {
                                            const openPositions = data.positions.filter((p) => (p.quantity || 0) !== 0);
                                            const openCount = openPositions.length;
                                            const profitCount = openPositions.filter((p) => (p.pnl || 0) > 0).length;
                                            const lossCount = openPositions.filter((p) => (p.pnl || 0) < 0).length;

                                            return (
                                                <>
                                                    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700">
                                                        <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Open</span>
                                                        <span className="text-sm font-black text-zinc-900 dark:text-zinc-100">{openCount}</span>
                                                    </span>
                                                    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                                                        <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">In Profit</span>
                                                        <span className="text-sm font-black text-emerald-400">{profitCount}</span>
                                                    </span>
                                                    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-red-500/10 border border-red-500/20">
                                                        <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">In Loss</span>
                                                        <span className="text-sm font-black text-red-400">{lossCount}</span>
                                                    </span>
                                                </>
                                            );
                                        })()}
                                    </div>
                                    <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mt-2">
                                        Contract: Natural Gas {getFutureMonthLabel(optionChain?.selectedExpiry || null)}
                                    </div>
                                </div>
                                <div className="inline-flex rounded-lg border border-zinc-300 dark:border-zinc-700 overflow-hidden">
                                    <button
                                        onClick={() => setPositionView('COMPACT')}
                                        className={`min-h-11 px-3 py-1.5 text-xs font-bold transition ${positionView === 'COMPACT'
                                            ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                                            : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                                            }`}
                                    >
                                        Compact
                                    </button>
                                    <button
                                        onClick={() => setPositionView('DETAILED')}
                                        className={`min-h-11 px-3 py-1.5 text-xs font-bold transition ${positionView === 'DETAILED'
                                            ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                                            : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                                            }`}
                                    >
                                        Detailed
                                    </button>
                                </div>
                            </div>

                            <div className={positionView === 'COMPACT' ? 'space-y-2' : 'grid grid-cols-1 gap-4'}>
                                {data.positions.map((position, idx) => {
                                    const positionKey = `${normalizeTradingSymbol(position.symbol)}-${idx}`;
                                    return (
                                        <PositionCard
                                            key={positionKey}
                                            position={position}
                                            compact={positionView === 'COMPACT'}
                                        />
                                    );
                                })}
                            </div>

                            {optionChain && optionChain.strikes.length > 0 && (
                                <OptionChainPanel chain={optionChain} />
                            )}

                            {optionChainWarning && (
                                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                                    <p className="text-amber-300 text-sm font-semibold">{optionChainWarning}</p>
                                </div>
                            )}
                        </>
                    )}

                    {data && data.positions.length === 0 && (
                        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-12 text-center">
                            <Shield className="w-12 h-12 text-zinc-700 dark:text-zinc-400 mx-auto mb-4" />
                            <p className="text-zinc-500 font-bold">No open positions</p>
                            <p className="text-xs text-zinc-800 dark:text-zinc-300 mt-2">Your positions will appear here once you have active trades</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function StatCard({
    label,
    value,
    valueClass = 'text-zinc-900 dark:text-zinc-100',
    subtext,
    subtextClass = 'text-zinc-500'
}: {
    label: string;
    value: string;
    valueClass?: string;
    subtext?: string;
    subtextClass?: string;
}) {
    return (
        <div className="bg-zinc-100 dark:bg-zinc-800/30 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
            <div className="text-xs text-zinc-500 font-bold uppercase tracking-wider mb-1">{label}</div>
            <div className={`text-lg font-black ${valueClass}`}>{value}</div>
            {subtext && <div className={`text-[10px] mt-1 ${subtextClass}`}>{subtext}</div>}
        </div>
    );
}

function OptionChainPanel({ chain }: { chain: OptionChainResponse }) {
    const atmStrike = chain.futureLtp == null
        ? null
        : chain.strikes.reduce((closest, row) => {
            if (closest == null) return row.strikePrice;
            return Math.abs(row.strikePrice - chain.futureLtp!) < Math.abs(closest - chain.futureLtp!)
                ? row.strikePrice
                : closest;
        }, null as number | null);

    return (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                    <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-100">Live Option Chain</h3>
                    <p className="text-xs text-zinc-500">
                        {chain.exchange}:{chain.underlying} | Expiry: {chain.selectedExpiry || 'N/A'} | Source: {chain.source}
                    </p>
                </div>
                <div className="text-right">
                    <p className="text-xs text-zinc-500">Future</p>
                    <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
                        {chain.futureSymbol || '-'} {chain.futureLtp ? `@ Rs ${chain.futureLtp.toFixed(2)}` : ''}
                    </p>
                </div>
            </div>

            <div className="space-y-3 md:hidden">
                {chain.strikes.map((row) => {
                    const isAtm = atmStrike != null && Math.abs(row.strikePrice - atmStrike) < 1e-6;
                    return (
                        <div
                            key={`mobile-${row.strikePrice}`}
                            className={`rounded-lg border p-3 ${isAtm
                                ? 'border-amber-500/30 bg-amber-500/10'
                                : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40'
                                }`}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <div className="text-sm font-black text-zinc-900 dark:text-zinc-100">
                                    Strike {row.strikePrice.toFixed(2)}
                                </div>
                                {isAtm && (
                                    <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500 text-[10px] font-black">
                                        ATM
                                    </span>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-[11px]">
                                <div className="space-y-1">
                                    <div className="font-black text-cyan-600 dark:text-cyan-300">CE</div>
                                    <div className="text-zinc-600 dark:text-zinc-300">Bid: {formatCompact(row.ce?.bestBidPrice)}</div>
                                    <div className="text-zinc-600 dark:text-zinc-300">Ask: {formatCompact(row.ce?.bestAskPrice)}</div>
                                    <div className="text-zinc-600 dark:text-zinc-300">OI: {formatInteger(row.ce?.oi)}</div>
                                    <div className="text-zinc-600 dark:text-zinc-300">{formatGreeks(row.ce?.delta, row.ce?.theta)}</div>
                                </div>
                                <div className="space-y-1">
                                    <div className="font-black text-rose-600 dark:text-rose-300">PE</div>
                                    <div className="text-zinc-600 dark:text-zinc-300">Bid: {formatCompact(row.pe?.bestBidPrice)}</div>
                                    <div className="text-zinc-600 dark:text-zinc-300">Ask: {formatCompact(row.pe?.bestAskPrice)}</div>
                                    <div className="text-zinc-600 dark:text-zinc-300">OI: {formatInteger(row.pe?.oi)}</div>
                                    <div className="text-zinc-600 dark:text-zinc-300">{formatGreeks(row.pe?.delta, row.pe?.theta)}</div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full text-xs">
                    <thead>
                        <tr className="text-zinc-700 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">
                            <th className="text-left py-2 pr-3">Strike</th>
                            <th className="text-right py-2 px-2 text-cyan-500">CE Bid</th>
                            <th className="text-right py-2 px-2 text-cyan-500">CE Ask</th>
                            <th className="text-right py-2 px-2 text-cyan-500">CE OI</th>
                            <th className="text-right py-2 px-2 text-cyan-500">Call Greek</th>
                            <th className="text-right py-2 px-2 text-rose-500">PE Bid</th>
                            <th className="text-right py-2 px-2 text-rose-500">PE Ask</th>
                            <th className="text-right py-2 px-2 text-rose-500">PE OI</th>
                            <th className="text-right py-2 pl-2 text-rose-500">Put Greek</th>
                        </tr>
                    </thead>
                    <tbody>
                        {chain.strikes.map((row) => {
                            const isAtm = atmStrike != null && Math.abs(row.strikePrice - atmStrike) < 1e-6;
                            return (
                                <tr
                                    key={row.strikePrice}
                                    className={`border-b border-zinc-200 dark:border-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800/20 ${isAtm ? 'bg-amber-500/10 dark:bg-amber-500/10' : ''}`}
                                >
                                    <td className="py-2 pr-3 text-zinc-900 dark:text-zinc-100 font-bold">
                                        {row.strikePrice.toFixed(2)}
                                        {isAtm && (
                                            <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500 text-[10px] font-black align-middle">
                                                ATM
                                            </span>
                                        )}
                                    </td>
                                    <td className="py-2 px-2 text-right text-cyan-700 dark:text-cyan-300">{formatCompact(row.ce?.bestBidPrice)}</td>
                                    <td className="py-2 px-2 text-right text-cyan-700 dark:text-cyan-300">{formatCompact(row.ce?.bestAskPrice)}</td>
                                    <td className="py-2 px-2 text-right text-cyan-700 dark:text-cyan-300">{formatInteger(row.ce?.oi)}</td>
                                    <td className="py-2 px-2 text-right text-cyan-700 dark:text-cyan-300">{formatGreeks(row.ce?.delta, row.ce?.theta)}</td>
                                    <td className="py-2 px-2 text-right text-rose-700 dark:text-rose-300">{formatCompact(row.pe?.bestBidPrice)}</td>
                                    <td className="py-2 px-2 text-right text-rose-700 dark:text-rose-300">{formatCompact(row.pe?.bestAskPrice)}</td>
                                    <td className="py-2 px-2 text-right text-rose-700 dark:text-rose-300">{formatInteger(row.pe?.oi)}</td>
                                    <td className="py-2 pl-2 text-right text-rose-700 dark:text-rose-300">{formatGreeks(row.pe?.delta, row.pe?.theta)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function PositionCard({
    position,
    compact
}: {
    position: PositionAnalysis;
    compact?: boolean;
}) {
    const isProfit = position.pnl >= 0;
    const primaryAlert = position.recommendations[0];
    const riskColors = {
        LOW: 'border-emerald-500/30 bg-emerald-500/5',
        MEDIUM: 'border-amber-500/30 bg-amber-500/5',
        HIGH: 'border-orange-500/30 bg-orange-500/5',
        CRITICAL: 'border-red-500/30 bg-red-500/5'
    };

    if (compact) {
        return (
            <div className={`bg-white dark:bg-zinc-900 border rounded-xl p-3 ${riskColors[position.riskLevel]}`}>
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3 items-start lg:items-center">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                            <h3 className="text-sm md:text-base font-black text-zinc-900 dark:text-zinc-100 truncate">{position.symbol}</h3>
                            {position.isITM && (
                                <span className="px-2 py-0.5 rounded bg-amber-500 text-amber-950 text-[10px] font-bold">ITM</span>
                            )}
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${position.riskLevel === 'LOW' ? 'bg-emerald-500/20 text-emerald-400' :
                                position.riskLevel === 'MEDIUM' ? 'bg-amber-500/20 text-amber-400' :
                                    position.riskLevel === 'HIGH' ? 'bg-orange-500/20 text-orange-400' :
                                        'bg-red-500/20 text-red-400'
                                }`}>
                                {position.riskLevel}
                            </span>
                        </div>

                        <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-[11px] text-zinc-500">
                            <span>Qty <span className="font-bold text-zinc-700 dark:text-zinc-300">{position.quantity}</span></span>
                            <span>Lots <span className="font-bold text-zinc-700 dark:text-zinc-300">{position.numberOfLots ?? '-'}</span></span>
                            <span>Avg <span className="font-bold text-zinc-700 dark:text-zinc-300">Rs {position.avgPrice.toFixed(2)}</span></span>
                            <span>LTP <span className="font-bold text-zinc-700 dark:text-zinc-300">Rs {position.ltp.toFixed(2)}</span></span>
                        </div>
                    </div>

                    <div className="w-full lg:w-auto lg:justify-self-end text-left lg:text-right">
                        <div className={`text-lg font-black ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                            {isProfit ? '+' : ''}{position.pnl.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                        </div>
                        <div className={`text-xs font-bold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                            {isProfit ? '+' : ''}{position.pnlPercent.toFixed(2)}%
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={`bg-white dark:bg-zinc-900 border rounded-xl p-6 ${riskColors[position.riskLevel]}`}>
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-4">
                <div>
                    <div className="flex items-center gap-2">
                        <h3 className="text-xl font-black text-zinc-900 dark:text-zinc-100">{position.symbol}</h3>
                        {position.isITM && (
                            <span className="px-2 py-0.5 rounded bg-amber-500 text-amber-950 text-[10px] font-bold">ITM</span>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-4 mt-2">
                        <span className="text-sm text-zinc-500">
                            Qty: <span className="font-bold text-zinc-700 dark:text-zinc-300">{position.quantity}</span>
                        </span>
                        {position.numberOfLots != null && (
                            <span className="text-sm text-zinc-500">
                                Lots: <span className="font-bold text-zinc-700 dark:text-zinc-300">{position.numberOfLots}</span>
                            </span>
                        )}
                        {position.lotSize != null && (
                            <span className="text-sm text-zinc-500">
                                Lot Size: <span className="font-bold text-zinc-700 dark:text-zinc-300">{position.lotSize}</span>
                            </span>
                        )}
                        <span className="text-sm text-zinc-500">
                            Avg: <span className="font-bold text-zinc-700 dark:text-zinc-300">Rs {position.avgPrice.toFixed(2)}</span>
                        </span>
                        <span className="text-sm text-zinc-500">
                            LTP: <span className="font-bold text-zinc-700 dark:text-zinc-300">Rs {position.ltp.toFixed(2)}</span>
                        </span>
                        {position.greeks && (
                            <div className="flex items-center gap-3 px-3 py-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg border border-zinc-300 dark:border-zinc-700">
                                <span className="text-xs text-zinc-700 dark:text-zinc-400 flex items-center gap-1" title="Delta">
                                    <Calculator className="w-3 h-3" /> Delta {position.greeks.delta.toFixed(2)}
                                </span>
                                <span className="text-xs text-zinc-700 dark:text-zinc-400 flex items-center gap-1" title="Theta (Daily)">
                                    <Clock className="w-3 h-3" /> Theta {position.greeks.theta.toFixed(1)}
                                </span>
                            </div>
                        )}
                        <div className="flex items-center gap-3 px-3 py-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg border border-zinc-300 dark:border-zinc-700">
                            <span className="text-xs text-zinc-500 font-bold uppercase tracking-wider">Alert</span>
                            {primaryAlert ? (
                                <span className="text-xs text-zinc-700 dark:text-zinc-300">
                                    <span className="font-black mr-2">{primaryAlert.action}</span>{primaryAlert.reason}
                                </span>
                            ) : (
                                <span className="text-xs text-zinc-500">No active alerts</span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="text-left md:text-right flex items-center md:block gap-4">
                    <div className={`text-2xl font-black ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isProfit ? '+' : ''}{position.pnl.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                    </div>
                    <div>
                        <div className={`text-sm font-bold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                            {isProfit ? '+' : ''}{position.pnlPercent.toFixed(2)}%
                        </div>
                        <div className={`text-xs font-bold mt-1 inline-block px-2 py-1 rounded ${position.riskLevel === 'LOW' ? 'bg-emerald-500/20 text-emerald-400' :
                            position.riskLevel === 'MEDIUM' ? 'bg-amber-500/20 text-amber-400' :
                                position.riskLevel === 'HIGH' ? 'bg-orange-500/20 text-orange-400' :
                                    'bg-red-500/20 text-red-400'
                            }`}>
                            {position.riskLevel} RISK
                        </div>
                    </div>
                </div>
            </div>

        </div>
    );
}

function RecommendationCard({ recommendation }: { recommendation: AdjustmentRecommendation }) {
    const actionColors = {
        HOLD: 'border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800/50',
        ADD: 'border-emerald-500/30 bg-emerald-500/10',
        REDUCE: 'border-amber-500/30 bg-amber-500/10',
        EXIT: 'border-red-500/30 bg-red-500/10',
        HEDGE: 'border-violet-500/30 bg-violet-500/10',
        ROLL: 'border-blue-500/30 bg-blue-500/10'
    };

    const actionIcons = {
        HOLD: Minus,
        ADD: ArrowUpRight,
        REDUCE: ArrowDownRight,
        EXIT: XCircle,
        HEDGE: Shield,
        ROLL: RefreshCw
    };

    const Icon = actionIcons[recommendation.action];

    return (
        <div className={`border rounded-lg p-4 ${actionColors[recommendation.action]}`}>
            <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                    <div className={`p-2 rounded-lg ${recommendation.action === 'HOLD' ? 'bg-zinc-200 dark:bg-zinc-700' :
                        recommendation.action === 'ADD' ? 'bg-emerald-500/20' :
                            recommendation.action === 'REDUCE' ? 'bg-amber-500/20' :
                                recommendation.action === 'EXIT' ? 'bg-red-500/20' :
                                    recommendation.action === 'ROLL' ? 'bg-blue-500/20' :
                                        'bg-violet-500/20'
                        }`}>
                        <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-black text-zinc-900 dark:text-zinc-100 uppercase">{recommendation.action}</span>
                            {recommendation.suggestedQuantity && (
                                <span className="text-xs text-zinc-500">Qty: {recommendation.suggestedQuantity}</span>
                            )}
                        </div>
                        <p className="text-xs text-zinc-700 dark:text-zinc-400 leading-relaxed">{recommendation.reason}</p>
                    </div>
                </div>
                <div className={`text-xs font-bold px-2 py-1 rounded ${recommendation.urgency === 'HIGH' ? 'bg-red-500/20 text-red-400' :
                    recommendation.urgency === 'MEDIUM' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-400'
                    }`}>
                    {recommendation.urgency}
                </div>
            </div>
        </div>
    );
}

