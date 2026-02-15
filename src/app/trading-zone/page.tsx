'use client';

import { useEffect, useState, useCallback } from 'react';
import Navbar from '@/components/layout/Navbar';
import {
    TrendingUp, TrendingDown, Shield, AlertTriangle, Clock,
    RefreshCw, Settings, CheckCircle, XCircle, Activity,
    ArrowUpRight, ArrowDownRight, Minus, Target, Zap,
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
    dayDecay?: number; // Optional for backward compatibility if API returns old structure momentarily
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

const REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes

export default function TradingZone() {
    const [data, setData] = useState<PositionMonitorResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [countdown, setCountdown] = useState(REFRESH_INTERVAL / 1000);
    const [credentials, setCredentials] = useState({ apiKey: '', apiSecret: '', accessToken: '' });
    const [loginMethod, setLoginMethod] = useState<'TOKEN' | 'OAUTH'>('OAUTH');
    const [isConfigured, setIsConfigured] = useState(false);
    const [isProcessingLogin, setIsProcessingLogin] = useState(false);

    // Initial Load & OAuth Callback Check
    useEffect(() => {
        const saved = localStorage.getItem('zerodha_credentials');
        if (saved) {
            const parsed = JSON.parse(saved);
            setCredentials(parsed);
            if (parsed.accessToken && parsed.apiKey) {
                setIsConfigured(true);
            }
        }

        const params = new URLSearchParams(window.location.search);
        const requestToken = params.get('request_token');
        const status = params.get('status');

        if (status === 'success' && requestToken) {
            handleOAuthCallback(requestToken);
        } else if (status === 'error') {
            setError('Login failed or was cancelled by user.');
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }, []);

    const handleOAuthCallback = async (requestToken: string) => {
        setIsProcessingLogin(true);
        setError(null);

        const tempCreds = localStorage.getItem('zerodha_temp_creds');
        if (!tempCreds) {
            setError('Session expired. Please start login again.');
            setIsProcessingLogin(false);
            return;
        }

        const { apiKey, apiSecret } = JSON.parse(tempCreds);

        try {
            const res = await fetch('/api/auth/zerodha', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey, apiSecret, requestToken })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Token exchange failed');

            const newCreds = { apiKey, apiSecret, accessToken: data.accessToken };
            setCredentials(newCreds);
            localStorage.setItem('zerodha_credentials', JSON.stringify(newCreds));
            localStorage.removeItem('zerodha_temp_creds');
            setIsConfigured(true);
            window.history.replaceState({}, document.title, window.location.pathname);
            fetchPositions();
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Login failed during token exchange');
        } finally {
            setIsProcessingLogin(false);
        }
    };

    const handleLoginRedirect = () => {
        if (!credentials.apiKey || !credentials.apiSecret) {
            setError('API Key and API Secret are required for login.');
            return;
        }

        localStorage.setItem('zerodha_temp_creds', JSON.stringify({
            apiKey: credentials.apiKey,
            apiSecret: credentials.apiSecret
        }));

        const redirectUrl = window.location.origin + window.location.pathname;
        const loginUrl = `https://kite.zerodha.com/connect/login?v=3&api_key=${credentials.apiKey}&redirect_params=${encodeURIComponent(`redirect_url=${redirectUrl}`)}`;
        window.location.href = loginUrl;
    };

    const handleManualConfigure = () => {
        if (credentials.apiKey && credentials.accessToken) {
            setIsConfigured(true);
            localStorage.setItem('zerodha_credentials', JSON.stringify(credentials));
            fetchPositions();
        }
    };

    const handleLogout = () => {
        setIsConfigured(false);
        setCredentials(prev => ({ ...prev, accessToken: '' }));
        localStorage.removeItem('zerodha_credentials');
        setData(null);
        setError(null);
    };

    const fetchPositions = useCallback(async () => {
        const currentCreds = JSON.parse(localStorage.getItem('zerodha_credentials') || '{}');
        if (!currentCreds.apiKey || !currentCreds.accessToken) return;

        try {
            setLoading(true);
            setError(null);
            const res = await fetch('/api/positions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(currentCreds)
            });

            const json = await res.json();
            if (!res.ok) {
                if (res.status === 403 || res.status === 401 || json.error?.includes('Token')) {
                    throw new Error('Session expired or invalid token. Please login again.');
                }
                throw new Error(json.error || `HTTP ${res.status}`);
            }

            setData(json);
            setCountdown(REFRESH_INTERVAL / 1000);
        } catch (err: any) {
            setError(err.message || 'Failed to fetch positions');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!isConfigured) return;
        fetchPositions();
        const timer = setInterval(fetchPositions, REFRESH_INTERVAL);
        const countdownTimer = setInterval(() => {
            setCountdown(prev => (prev > 0 ? prev - 1 : REFRESH_INTERVAL / 1000));
        }, 1000);
        return () => {
            clearInterval(timer);
            clearInterval(countdownTimer);
        };
    }, [fetchPositions, isConfigured]);

    if (isProcessingLogin) {
        return (
            <div className="min-h-screen bg-zinc-950 flex flex-col">
                <Navbar />
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center space-y-4">
                        <RefreshCw className="w-12 h-12 text-violet-500 animate-spin mx-auto" />
                        <h2 className="text-xl font-bold text-zinc-100">Logging in to Zerodha...</h2>
                        <p className="text-zinc-500">Exchanging request token for access token</p>
                    </div>
                </div>
            </div>
        );
    }

    if (!isConfigured) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 flex flex-col">
                <Navbar />
                <div className="p-6 flex-1 flex items-center justify-center">
                    <div className="w-full max-w-md">
                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">
                            <div className="flex items-center gap-3 mb-8">
                                <div className="p-3 bg-violet-500/10 rounded-xl border border-violet-500/30">
                                    <Settings className="w-6 h-6 text-violet-400" />
                                </div>
                                <div>
                                    <h1 className="text-2xl font-black text-zinc-100">Connect Zerodha</h1>
                                    <p className="text-sm text-zinc-500">Monitor positions & get alerts</p>
                                </div>
                            </div>
                            <div className="flex p-1 bg-zinc-950 rounded-lg mb-6 border border-zinc-800">
                                <button
                                    onClick={() => setLoginMethod('OAUTH')}
                                    className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-md transition ${loginMethod === 'OAUTH' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                                >
                                    Kite Login (Recommended)
                                </button>
                                <button
                                    onClick={() => setLoginMethod('TOKEN')}
                                    className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-md transition ${loginMethod === 'TOKEN' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
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
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">API Key</label>
                                    <input
                                        type="text"
                                        value={credentials.apiKey}
                                        onChange={(e) => setCredentials({ ...credentials, apiKey: e.target.value })}
                                        className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 focus:outline-none focus:border-violet-500 transition font-mono text-sm"
                                        placeholder="Enter API Key"
                                    />
                                </div>
                                {loginMethod === 'OAUTH' ? (
                                    <>
                                        <div>
                                            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">API Secret</label>
                                            <input
                                                type="password"
                                                value={credentials.apiSecret}
                                                onChange={(e) => setCredentials({ ...credentials, apiSecret: e.target.value })}
                                                className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 focus:outline-none focus:border-violet-500 transition font-mono text-sm"
                                                placeholder="Enter API Secret"
                                            />
                                        </div>
                                        <button
                                            onClick={handleLoginRedirect}
                                            disabled={!credentials.apiKey || !credentials.apiSecret}
                                            className="w-full px-6 py-3 bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-bold rounded-lg transition flex items-center justify-center gap-2 mt-2"
                                        >
                                            <Zap className="w-4 h-4 fill-current" />
                                            Login with Zerodha
                                        </button>
                                        <p className="text-[10px] text-zinc-500 text-center mt-4">
                                            Redirects to official Kite login page. Use your User ID, Password & 2FA safely.
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <div>
                                            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Access Token</label>
                                            <input
                                                type="password"
                                                value={credentials.accessToken}
                                                onChange={(e) => setCredentials({ ...credentials, accessToken: e.target.value })}
                                                className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 focus:outline-none focus:border-violet-500 transition font-mono text-sm"
                                                placeholder="Paste Access Token"
                                            />
                                        </div>
                                        <button
                                            onClick={handleManualConfigure}
                                            disabled={!credentials.apiKey || !credentials.accessToken}
                                            className="w-full px-6 py-3 bg-zinc-100 hover:bg-white disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-900 font-bold rounded-lg transition mt-2"
                                        >
                                            Connect Manually
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 flex flex-col uppercase-none">
            <Navbar />
            <div className="p-6">
                <div className="max-w-7xl mx-auto space-y-6">
                    {/* Header */}
                    <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 rounded-2xl p-6 shadow-2xl">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-3 bg-violet-500/10 rounded-xl border border-violet-500/30">
                                    <Activity className="w-6 h-6 text-violet-400" />
                                </div>
                                <div>
                                    <h1 className="text-2xl font-black text-zinc-100">Trading Zone</h1>
                                    <p className="text-sm text-zinc-500">Position Monitor & Adjustment Advisor</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="text-right">
                                    <div className="text-xs text-zinc-500 font-bold">Next Refresh</div>
                                    <div className="text-sm font-mono text-zinc-400 flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')}
                                    </div>
                                </div>
                                <button onClick={fetchPositions} disabled={loading} className="p-2 rounded-lg bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 transition disabled:opacity-50">
                                    <RefreshCw className={`w-4 h-4 text-zinc-400 ${loading ? 'animate-spin' : ''}`} />
                                </button>
                                <button onClick={() => { setIsConfigured(false); localStorage.removeItem('zerodha_credentials'); }} className="p-2 rounded-lg bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 transition">
                                    <Settings className="w-4 h-4 text-zinc-400" />
                                </button>
                            </div>
                        </div>

                        {/* Summary Stats */}
                        {data && (
                            <div className="space-y-4 mt-6">
                                <div className="grid grid-cols-2 lg:grid-cols-7 gap-4">
                                    <StatCard label="Positions" value={data.positionCount.toString()} />
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
                                                data.marketCondition.trend === 'BEARISH' ? 'text-red-400' : 'text-zinc-400'
                                        }
                                    />
                                    <StatCard
                                        label="Volatility"
                                        value={data.marketCondition.volatility}
                                        valueClass={
                                            data.marketCondition.volatility === 'HIGH' ? 'text-amber-400' : 'text-zinc-400'
                                        }
                                    />
                                    <StatCard
                                        label="Net Delta"
                                        value={data.portfolio.netDelta.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                        valueClass={Math.abs(data.portfolio.netDelta) > 500 ? 'text-amber-400' : 'text-zinc-400'}
                                        subtext="₹ P&L / 1 pt move"
                                    />
                                    <StatCard
                                        label="Net Theta"
                                        value={data.portfolio.netTheta.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
                                        valueClass={data.portfolio.netTheta > 0 ? 'text-emerald-400' : 'text-zinc-400'}
                                        subtext="Daily Decay"
                                    />
                                    <StatCard
                                        label="Decay (Daily)"
                                        value={(data.portfolio.dayDecay || data.portfolio.netTheta || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
                                        valueClass={(data.portfolio.dayDecay || 0) > 0 ? 'text-emerald-400' : 'text-zinc-400'}
                                        subtext="Income Projection"
                                    />
                                </div>

                                {/* Portfolio Alerts */}
                                {data.portfolio.recommendations.length > 0 && (
                                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Scale className="w-4 h-4 text-blue-400" />
                                            <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">Portfolio Strategy</span>
                                        </div>
                                        <div className="space-y-1">
                                            {data.portfolio.recommendations.map((rec, i) => (
                                                <p key={i} className="text-sm text-zinc-300">{rec}</p>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Error State */}
                    {error && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <AlertTriangle className="w-5 h-5 text-red-400" />
                                <span className="text-red-400 font-bold">{error}</span>
                            </div>
                            <button onClick={handleLogout} className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold uppercase rounded-lg border border-red-500/20 transition">Reset Credentials</button>
                        </div>
                    )}

                    {/* Loading State */}
                    {loading && !data && (
                        <div className="flex items-center justify-center py-16">
                            <div className="flex flex-col items-center gap-4">
                                <RefreshCw className="w-8 h-8 text-violet-400 animate-spin" />
                                <span className="text-sm text-zinc-500 font-bold">Fetching positions...</span>
                            </div>
                        </div>
                    )}

                    {/* Positions Grid */}
                    {data && data.positions.length > 0 && (
                        <div className="grid grid-cols-1 gap-4">
                            {data.positions.map((position, idx) => (
                                <PositionCard key={idx} position={position} />
                            ))}
                        </div>
                    )}

                    {/* Empty State */}
                    {data && data.positions.length === 0 && (
                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
                            <Shield className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                            <p className="text-zinc-500 font-bold">No open positions</p>
                            <p className="text-xs text-zinc-700 mt-2">Your positions will appear here once you have active trades</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function StatCard({ label, value, valueClass = 'text-zinc-100', subtext }: { label: string; value: string; valueClass?: string; subtext?: string }) {
    return (
        <div className="bg-zinc-800/30 border border-zinc-800 rounded-lg p-4">
            <div className="text-xs text-zinc-500 font-bold uppercase tracking-wider mb-1">{label}</div>
            <div className={`text-lg font-black ${valueClass}`}>{value}</div>
            {subtext && <div className="text-[10px] text-zinc-500 mt-1">{subtext}</div>}
        </div>
    );
}

function PositionCard({ position }: { position: PositionAnalysis }) {
    const isProfit = position.pnl >= 0;
    const riskColors = {
        LOW: 'border-emerald-500/30 bg-emerald-500/5',
        MEDIUM: 'border-amber-500/30 bg-amber-500/5',
        HIGH: 'border-orange-500/30 bg-orange-500/5',
        CRITICAL: 'border-red-500/30 bg-red-500/5'
    };

    return (
        <div className={`bg-zinc-900 border rounded-xl p-6 ${riskColors[position.riskLevel]}`}>
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-4">
                <div>
                    <div className="flex items-center gap-2">
                        <h3 className="text-xl font-black text-zinc-100">{position.symbol}</h3>
                        {position.isITM && (
                            <span className="px-2 py-0.5 rounded bg-amber-500 text-amber-950 text-[10px] font-bold">ITM</span>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-4 mt-2">
                        <span className="text-sm text-zinc-500">
                            Qty: <span className="font-bold text-zinc-300">{position.quantity}</span>
                        </span>
                        <span className="text-sm text-zinc-500">
                            Avg: <span className="font-bold text-zinc-300">₹{position.avgPrice.toFixed(2)}</span>
                        </span>
                        <span className="text-sm text-zinc-500">
                            LTP: <span className="font-bold text-zinc-300">₹{position.ltp.toFixed(2)}</span>
                        </span>
                        {position.greeks && (
                            <div className="flex items-center gap-3 px-3 py-1 bg-zinc-800 rounded-lg border border-zinc-700">
                                <span className="text-xs text-zinc-400 flex items-center gap-1" title="Delta">
                                    <Calculator className="w-3 h-3" /> Δ {position.greeks.delta.toFixed(2)}
                                </span>
                                <span className="text-xs text-zinc-400 flex items-center gap-1" title="Theta (Daily)">
                                    <Clock className="w-3 h-3" /> Θ {position.greeks.theta.toFixed(1)}
                                </span>
                            </div>
                        )}
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

            {/* Recommendations */}
            <div className="space-y-2">
                {position.recommendations.map((rec, idx) => (
                    <RecommendationCard key={idx} recommendation={rec} />
                ))}
            </div>
        </div>
    );
}

function RecommendationCard({ recommendation }: { recommendation: AdjustmentRecommendation }) {
    const actionColors = {
        HOLD: 'border-zinc-700 bg-zinc-800/50',
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
                    <div className={`p-2 rounded-lg ${recommendation.action === 'HOLD' ? 'bg-zinc-700' :
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
                            <span className="text-sm font-black text-zinc-100 uppercase">{recommendation.action}</span>
                            {recommendation.suggestedQuantity && (
                                <span className="text-xs text-zinc-500">Qty: {recommendation.suggestedQuantity}</span>
                            )}
                        </div>
                        <p className="text-xs text-zinc-400 leading-relaxed">{recommendation.reason}</p>
                    </div>
                </div>
                <div className={`text-xs font-bold px-2 py-1 rounded ${recommendation.urgency === 'HIGH' ? 'bg-red-500/20 text-red-400' :
                    recommendation.urgency === 'MEDIUM' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-zinc-700 text-zinc-400'
                    }`}>
                    {recommendation.urgency}
                </div>
            </div>
        </div>
    );
}
