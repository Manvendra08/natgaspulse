'use client';

/**
 * /profile — Account settings + API key management
 *
 * Sections:
 *  1. Account info (email, name, subscription)
 *  2. Zerodha API Keys — save/clear encrypted credentials stored in user_profiles
 *  3. Zerodha Connect — OAuth flow (only shown when API keys are saved)
 *
 * Rules:
 *  - API keys are NEVER stored in .env or exposed in frontend state/logs.
 *  - Keys are sent once to POST /api/profile/zerodha, encrypted server-side, then forgotten.
 *  - The UI only receives masked key previews and presence flags.
 *  - Zerodha connect button is only rendered when the user is logged in AND has saved keys.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Navbar from '@/components/layout/Navbar';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import {
    User,
    Mail,
    BadgeCheck,
    Key,
    Link2,
    Link2Off,
    AlertCircle,
    CheckCircle2,
    Loader2,
    Eye,
    EyeOff,
    Trash2
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

type ProfileData = {
    fullName: string | null;
    email: string | null;
    subscriptionStatus: string;
};

type ZerodhaStatus = {
    apiKeyMasked: string | null;
    hasApiSecret: boolean;
    hasAccessToken: boolean;
};

type MsgState = { text: string; ok: boolean } | null;

// ── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ ok, text }: { ok: boolean; text: string }) {
    return (
        <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${ok
                ? 'text-emerald-600 dark:text-emerald-400 border-emerald-500/40 bg-emerald-500/10'
                : 'text-red-600 dark:text-red-400 border-red-500/40 bg-red-500/10'
                }`}
        >
            {ok ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
            {text}
        </span>
    );
}

function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center gap-2 mb-5">
                <div className="p-2 bg-cyan-500/10 rounded-lg border border-cyan-500/20">{icon}</div>
                <h2 className="text-base font-black text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">{title}</h2>
            </div>
            {children}
        </div>
    );
}

function MsgLine({ msg }: { msg: MsgState }) {
    if (!msg) return null;
    return (
        <div
            className={`flex items-center gap-2 text-sm ${msg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}
        >
            {msg.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            {msg.text}
        </div>
    );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function ProfilePage() {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const supabase = useMemo(() => {
        try { return createSupabaseBrowserClient(); } catch { return null; }
    }, []);

    // ── Account state ─────────────────────────────────────────────────────────
    const [profile, setProfile] = useState<ProfileData>({ fullName: '', email: null, subscriptionStatus: 'PROMO' });
    const [nameInput, setNameInput] = useState('');
    const [profileLoading, setProfileLoading] = useState(true);
    const [profileMsg, setProfileMsg] = useState<MsgState>(null);
    const [profileSaving, setProfileSaving] = useState(false);

    // ── Zerodha key state ─────────────────────────────────────────────────────
    const [zerodhaStatus, setZerodhaStatus] = useState<ZerodhaStatus | null>(null);
    const [zerodhaLoading, setZerodhaLoading] = useState(true);
    const [apiKeyInput, setApiKeyInput] = useState('');
    const [apiSecretInput, setApiSecretInput] = useState('');
    const [showSecret, setShowSecret] = useState(false);
    const [keysSaving, setKeysSaving] = useState(false);
    const [keysMsg, setKeysMsg] = useState<MsgState>(null);

    // ── Zerodha connect state ─────────────────────────────────────────────────
    const [zerodhaConnecting, setZerodhaConnecting] = useState(false);
    const [zerodhaConnectMsg, setZerodhaConnectMsg] = useState<MsgState>(null);
    const [zerodhaDisconnecting, setZerodhaDisconnecting] = useState(false);

    // ── Refs for cleanup ──────────────────────────────────────────────────────
    const mountedRef = useRef(true);
    const profileMsgTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Cleanup on unmount ────────────────────────────────────────────────────
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            if (profileMsgTimeoutRef.current) {
                clearTimeout(profileMsgTimeoutRef.current);
            }
        };
    }, []);

    // ── Load profile ──────────────────────────────────────────────────────────
    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const res = await fetch('/api/profile', { cache: 'no-store' });
                const json = await res.json().catch(() => null);
                if (!mounted) return;
                if (res.ok && json?.profile) {
                    const p: ProfileData = {
                        fullName: json.profile.fullName ?? null,
                        email: json.profile.email ?? null,
                        subscriptionStatus: json.profile.subscriptionStatus ?? 'PROMO'
                    };
                    setProfile(p);
                    setNameInput(p.fullName ?? '');
                }
            } finally {
                if (mounted) setProfileLoading(false);
            }
        })();
        return () => { mounted = false; };
    }, []);

    // ── Load Zerodha key status ───────────────────────────────────────────────
    const loadZerodhaStatus = useCallback(async () => {
        setZerodhaLoading(true);
        try {
            const res = await fetch('/api/profile/zerodha', { cache: 'no-store' });
            const json = await res.json().catch(() => null);
            if (res.ok) {
                if (json?.credentials) {
                    setZerodhaStatus({
                        apiKeyMasked: json.credentials.apiKeyMasked ?? null,
                        hasApiSecret: Boolean(json.credentials.hasApiSecret),
                        hasAccessToken: Boolean(json.credentials.hasAccessToken)
                    });
                } else {
                    setZerodhaStatus({ apiKeyMasked: null, hasApiSecret: false, hasAccessToken: Boolean(json?.hasAccessToken) });
                }
                if (json?.warning) {
                    setKeysMsg({ ok: false, text: json.warning });
                }
            }
        } finally {
            setZerodhaLoading(false);
        }
    }, []);

    useEffect(() => { loadZerodhaStatus(); }, [loadZerodhaStatus]);

    // ── Save profile name ─────────────────────────────────────────────────────
    const saveProfile = async () => {
        setProfileSaving(true);
        setProfileMsg(null);
        try {
            const res = await fetch('/api/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fullName: nameInput })
            });
            const json = await res.json().catch(() => null);
            if (!res.ok) throw new Error(json?.error ?? 'Save failed');
            if (mountedRef.current) {
                setProfileMsg({ ok: true, text: 'Profile saved.' });
                profileMsgTimeoutRef.current = setTimeout(() => {
                    if (mountedRef.current) setProfileMsg(null);
                }, 2000);
            }
        } catch (err: unknown) {
            if (mountedRef.current) {
                setProfileMsg({ ok: false, text: err instanceof Error ? err.message : 'Save failed' });
            }
        } finally {
            if (mountedRef.current) {
                setProfileSaving(false);
            }
        }
    };

    // ── Save Zerodha API keys ─────────────────────────────────────────────────
    const saveKeys = async () => {
        if (!apiKeyInput.trim() || !apiSecretInput.trim()) {
            setKeysMsg({ ok: false, text: 'Both API Key and API Secret are required.' });
            return;
        }
        setKeysSaving(true);
        setKeysMsg(null);
        try {
            const res = await fetch('/api/profile/zerodha', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // Keys sent once over HTTPS to server; server encrypts and stores; never logged
                body: JSON.stringify({ apiKey: apiKeyInput.trim(), apiSecret: apiSecretInput.trim() })
            });
            const json = await res.json().catch(() => null);
            if (!res.ok) throw new Error(json?.error ?? 'Failed to save keys');
            setKeysMsg({ ok: true, text: 'API keys saved and encrypted.' });
            setApiKeyInput('');
            setApiSecretInput('');
            await loadZerodhaStatus();
        } catch (err: unknown) {
            setKeysMsg({ ok: false, text: err instanceof Error ? err.message : 'Failed to save keys' });
        } finally {
            setKeysSaving(false);
        }
    };

    // ── Clear Zerodha keys ────────────────────────────────────────────────────
    const clearKeys = async () => {
        if (!confirm('Clear saved Zerodha API keys and disconnect session?')) return;
        setKeysSaving(true);
        setKeysMsg(null);
        try {
            const res = await fetch('/api/profile/zerodha', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clear: true })
            });
            const json = await res.json().catch(() => null);
            if (!res.ok) throw new Error(json?.error ?? 'Failed to clear keys');
            setKeysMsg({ ok: true, text: 'Keys cleared.' });
            await loadZerodhaStatus();
        } catch (err: unknown) {
            setKeysMsg({ ok: false, text: err instanceof Error ? err.message : 'Failed to clear keys' });
        } finally {
            setKeysSaving(false);
        }
    };

    // ── Zerodha OAuth connect ─────────────────────────────────────────────────
    const connectZerodha = async () => {
        setZerodhaConnecting(true);
        setZerodhaConnectMsg(null);
        try {
            // Fetch the user's stored API key (masked) to build the login URL
            const res = await fetch('/api/profile/zerodha', { cache: 'no-store' });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.credentials?.apiKeyMasked) {
                throw new Error('Save your Zerodha API Key first before connecting.');
            }
            // We need the raw API key to build the Kite login URL.
            // Since we only store masked on client, we ask the server for the login URL.
            const urlRes = await fetch('/api/auth/zerodha/login-url', { cache: 'no-store' });
            const urlJson = await urlRes.json().catch(() => null);
            if (!urlRes.ok || !urlJson?.loginUrl) {
                throw new Error(urlJson?.error ?? 'Could not generate Zerodha login URL.');
            }
            // Redirect to Kite OAuth — request_token will come back to /auth/callback
            window.location.href = urlJson.loginUrl;
        } catch (err: unknown) {
            setZerodhaConnectMsg({ ok: false, text: err instanceof Error ? err.message : 'Connect failed' });
            setZerodhaConnecting(false);
        }
    };

    // ── Zerodha disconnect ────────────────────────────────────────────────────
    const disconnectZerodha = async () => {
        setZerodhaDisconnecting(true);
        setZerodhaConnectMsg(null);
        try {
            const res = await fetch('/api/auth/zerodha', { method: 'DELETE' });
            const json = await res.json().catch(() => null);
            if (!res.ok) throw new Error(json?.error ?? 'Disconnect failed');
            setZerodhaConnectMsg({ ok: true, text: 'Zerodha session cleared.' });
            await loadZerodhaStatus();
        } catch (err: unknown) {
            setZerodhaConnectMsg({ ok: false, text: err instanceof Error ? err.message : 'Disconnect failed' });
        } finally {
            setZerodhaDisconnecting(false);
        }
    };

    const hasKeys = Boolean(zerodhaStatus?.apiKeyMasked && zerodhaStatus?.hasApiSecret);

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-white to-zinc-100 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 flex flex-col">
            <Navbar />
            <div className="flex-1 p-4 md:p-8">
                <div className="max-w-2xl mx-auto space-y-6">

                    {/* ── 1. Account ─────────────────────────────────────────── */}
                    <SectionCard title="Account" icon={<User className="w-5 h-5 text-cyan-400" />}>
                        {profileLoading ? (
                            <div className="flex items-center gap-2 text-sm text-zinc-500">
                                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
                                        <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Email</div>
                                        <div className="flex items-center gap-2 text-sm font-mono text-zinc-800 dark:text-zinc-200 truncate">
                                            <Mail className="w-4 h-4 text-zinc-400 shrink-0" />
                                            {profile.email ?? '—'}
                                        </div>
                                    </div>
                                    <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
                                        <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Subscription</div>
                                        <div className="flex items-center gap-2 text-sm font-black text-emerald-600 dark:text-emerald-400">
                                            <BadgeCheck className="w-4 h-4" />
                                            {profile.subscriptionStatus}
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold block mb-1">
                                        Display Name
                                    </label>
                                    <input
                                        value={nameInput}
                                        onChange={(e) => setNameInput(e.target.value)}
                                        className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 outline-none focus:border-cyan-500 transition"
                                        placeholder="Your name"
                                        maxLength={200}
                                    />
                                </div>

                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={saveProfile}
                                        disabled={profileSaving}
                                        className="px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-black transition disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {profileSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                                        Save
                                    </button>
                                    <MsgLine msg={profileMsg} />
                                </div>
                            </div>
                        )}
                    </SectionCard>

                    {/* ── 2. Zerodha API Keys ────────────────────────────────── */}
                    <SectionCard title="Zerodha API Keys" icon={<Key className="w-5 h-5 text-amber-400" />}>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
                            Keys are encrypted with AES-256-GCM before storage. They are never logged or exposed in
                            frontend state. Only the server decrypts them when needed for OAuth.
                        </p>

                        {zerodhaLoading ? (
                            <div className="flex items-center gap-2 text-sm text-zinc-500">
                                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* Current status */}
                                {zerodhaStatus?.apiKeyMasked && (
                                    <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-2">
                                        <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Saved Keys</div>
                                        <div className="flex items-center justify-between gap-2 flex-wrap">
                                            <div className="font-mono text-sm text-zinc-700 dark:text-zinc-300">
                                                API Key: <span className="text-zinc-900 dark:text-zinc-100">{zerodhaStatus.apiKeyMasked}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <StatusBadge ok={zerodhaStatus.hasApiSecret} text={zerodhaStatus.hasApiSecret ? 'Secret ✓' : 'Secret ✗'} />
                                                <StatusBadge ok={zerodhaStatus.hasAccessToken} text={zerodhaStatus.hasAccessToken ? 'Connected' : 'Not connected'} />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Input new keys */}
                                <div className="space-y-3">
                                    <div>
                                        <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold block mb-1">
                                            API Key
                                        </label>
                                        <input
                                            value={apiKeyInput}
                                            onChange={(e) => setApiKeyInput(e.target.value)}
                                            className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 font-mono text-sm outline-none focus:border-amber-500 transition"
                                            placeholder={zerodhaStatus?.apiKeyMasked ? 'Enter new key to replace…' : 'Paste Zerodha API Key'}
                                            autoComplete="off"
                                            spellCheck={false}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold block mb-1">
                                            API Secret
                                        </label>
                                        <div className="relative">
                                            <input
                                                type={showSecret ? 'text' : 'password'}
                                                value={apiSecretInput}
                                                onChange={(e) => setApiSecretInput(e.target.value)}
                                                className="w-full px-4 py-3 pr-12 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 font-mono text-sm outline-none focus:border-amber-500 transition"
                                                placeholder={zerodhaStatus?.hasApiSecret ? 'Enter new secret to replace…' : 'Paste Zerodha API Secret'}
                                                autoComplete="new-password"
                                                spellCheck={false}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowSecret((v) => !v)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                                                tabIndex={-1}
                                            >
                                                {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 flex-wrap">
                                    <button
                                        onClick={saveKeys}
                                        disabled={keysSaving || (!apiKeyInput.trim() && !apiSecretInput.trim())}
                                        className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-black transition disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {keysSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                                        Save Keys
                                    </button>
                                    {hasKeys && (
                                        <button
                                            onClick={clearKeys}
                                            disabled={keysSaving}
                                            className="px-4 py-2.5 rounded-xl bg-red-600/10 hover:bg-red-600/20 text-red-600 dark:text-red-400 border border-red-500/30 font-black transition disabled:opacity-50 flex items-center gap-2"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                            Clear Keys
                                        </button>
                                    )}
                                    <MsgLine msg={keysMsg} />
                                </div>
                            </div>
                        )}
                    </SectionCard>

                    {/* ── 3. Zerodha Connect ─────────────────────────────────── */}
                    <SectionCard title="Zerodha Connect" icon={<Link2 className="w-5 h-5 text-violet-400" />}>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
                            Connect your Zerodha account via Kite OAuth. Requires API Key + Secret saved above.
                            The access token is stored encrypted and refreshed on each login.
                        </p>

                        {!hasKeys && !zerodhaLoading && (
                            <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                Save your Zerodha API Key and Secret above before connecting.
                            </div>
                        )}

                        {hasKeys && (
                            <div className="space-y-3">
                                <div className="flex items-center gap-3 flex-wrap">
                                    {!zerodhaStatus?.hasAccessToken ? (
                                        <button
                                            onClick={connectZerodha}
                                            disabled={zerodhaConnecting}
                                            className="px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-black transition disabled:opacity-50 flex items-center gap-2"
                                        >
                                            {zerodhaConnecting
                                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                                : <Link2 className="w-4 h-4" />}
                                            Connect Zerodha
                                        </button>
                                    ) : (
                                        <button
                                            onClick={disconnectZerodha}
                                            disabled={zerodhaDisconnecting}
                                            className="px-4 py-2.5 rounded-xl bg-red-600/10 hover:bg-red-600/20 text-red-600 dark:text-red-400 border border-red-500/30 font-black transition disabled:opacity-50 flex items-center gap-2"
                                        >
                                            {zerodhaDisconnecting
                                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                                : <Link2Off className="w-4 h-4" />}
                                            Disconnect
                                        </button>
                                    )}
                                    <MsgLine msg={zerodhaConnectMsg} />
                                </div>

                                {zerodhaStatus?.hasAccessToken && (
                                    <div className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        Zerodha session active. Token refreshes on next OAuth login.
                                    </div>
                                )}
                            </div>
                        )}
                    </SectionCard>

                </div>
            </div>
        </div>
    );
}
