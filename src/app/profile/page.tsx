'use client';

import { useEffect, useMemo, useState } from 'react';
import Navbar from '@/components/layout/Navbar';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { User, Mail, BadgeCheck } from 'lucide-react';

type ProfileResponse = {
    profile?: {
        fullName: string | null;
        subscriptionStatus: string;
    };
    warning?: string;
    error?: string;
};

export default function ProfilePage() {
    const [email, setEmail] = useState<string>('-');
    const [fullName, setFullName] = useState<string>('');
    const [subscription, setSubscription] = useState<string>('PROMO');
    const [loading, setLoading] = useState<boolean>(true);
    const [saving, setSaving] = useState<boolean>(false);
    const [message, setMessage] = useState<string | null>(null);

    const supabase = useMemo(() => {
        try {
            return createSupabaseBrowserClient();
        } catch {
            return null;
        }
    }, []);

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                if (supabase) {
                    const { data } = await supabase.auth.getUser();
                    if (!mounted) return;
                    setEmail(data.user?.email || '-');
                    const metaName = (data.user?.user_metadata as any)?.full_name || (data.user?.user_metadata as any)?.name || '';
                    if (metaName) setFullName(String(metaName));
                }

                const res = await fetch('/api/profile', { cache: 'no-store' });
                const json = (await res.json().catch(() => null)) as ProfileResponse | null;
                if (!mounted) return;
                if (res.ok && json?.profile) {
                    setFullName((json.profile.fullName || fullName || '').trim());
                    setSubscription(json.profile.subscriptionStatus || 'PROMO');
                } else if (json?.warning) {
                    setMessage(String(json.warning));
                }
            } finally {
                if (mounted) setLoading(false);
            }
        })();
        return () => {
            mounted = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const save = async () => {
        setSaving(true);
        setMessage(null);
        try {
            const res = await fetch('/api/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fullName })
            });
            if (!res.ok) throw new Error('Save failed');
            setMessage('Saved.');
            setTimeout(() => setMessage(null), 1200);
        } catch {
            setMessage('Save failed.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-white to-zinc-100 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 flex flex-col">
            <Navbar />
            <div className="flex-1 p-6">
                <div className="max-w-3xl mx-auto">
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-7 shadow-2xl">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-3 bg-cyan-500/10 rounded-xl border border-cyan-500/30">
                                <User className="w-6 h-6 text-cyan-400" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100">Profile</h1>
                                <p className="text-sm text-zinc-500">Account and subscription</p>
                            </div>
                        </div>

                        {loading ? (
                            <div className="text-sm text-zinc-500">Loading...</div>
                        ) : (
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
                                        <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Email</div>
                                        <div className="flex items-center gap-2 text-sm font-mono text-zinc-800 dark:text-zinc-200">
                                            <Mail className="w-4 h-4 text-zinc-400" />
                                            {email}
                                        </div>
                                    </div>
                                    <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
                                        <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Subscription</div>
                                        <div className="flex items-center gap-2 text-sm font-black text-emerald-600 dark:text-emerald-400">
                                            <BadgeCheck className="w-4 h-4" />
                                            {subscription}
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Name</div>
                                    <input
                                        value={fullName}
                                        onChange={(e) => setFullName(e.target.value)}
                                        className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 outline-none"
                                        placeholder="Your name"
                                    />
                                </div>

                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={save}
                                        disabled={saving}
                                        className="px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-black transition disabled:opacity-50"
                                    >
                                        Save
                                    </button>
                                    {message && <div className="text-sm text-zinc-500">{message}</div>}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
