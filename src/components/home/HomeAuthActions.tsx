'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

export default function HomeAuthActions() {
    const [isAuthed, setIsAuthed] = useState(false);

    useEffect(() => {
        let mounted = true;
        try {
            const supabase = createSupabaseBrowserClient();
            supabase.auth.getUser().then(({ data }) => {
                if (!mounted) return;
                setIsAuthed(Boolean(data.user));
            });

            const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
                if (!mounted) return;
                setIsAuthed(Boolean(session?.user));
            });

            return () => {
                mounted = false;
                sub.subscription.unsubscribe();
            };
        } catch {
            setIsAuthed(false);
            return () => {
                mounted = false;
            };
        }
    }, []);

    if (isAuthed) {
        return null;
    }

    return (
        <div className="flex items-center gap-2 md:gap-2 md:justify-end">
            <Link href="/login" className="px-3 py-1.5 rounded-lg bg-zinc-900 text-white text-xs font-black border border-zinc-800 hover:bg-zinc-800 transition">
                Log In
            </Link>
            <Link href="/signup" className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-black border border-emerald-500/30 hover:bg-emerald-500 transition">
                Sign Up
            </Link>
        </div>
    );
}

