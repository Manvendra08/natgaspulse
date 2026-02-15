'use client';
import { useState, useEffect } from 'react';
import { IndianRupee, ArrowRightLeft, Calendar } from 'lucide-react';

interface MCXWidgetProps {
    henryHubPrice: number;
}

export default function MCXWidget({ henryHubPrice }: MCXWidgetProps) {
    const [usdinr, setUsdinr] = useState<number>(83.50); // Default fallback

    useEffect(() => {
        // Fetch live USDINR
        fetch('https://api.exchangerate-api.com/v4/latest/USD')
            .then(res => res.json())
            .then(data => {
                if (data.rates && data.rates.INR) {
                    setUsdinr(data.rates.INR);
                }
            })
            .catch(err => console.error('Currency fetch failed:', err));
    }, []);

    const mcxParity = henryHubPrice * usdinr;

    return (
        <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 rounded-xl p-6 shadow-2xl h-full flex flex-col justify-between hover:border-zinc-700 transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-pink-500/10 rounded-lg border border-pink-500/30">
                        <IndianRupee className="w-5 h-5 text-pink-400" />
                    </div>
                    <h2 className="text-xl font-bold text-zinc-100">MCX Data</h2>
                </div>
                <div className="text-xs text-zinc-500 font-mono flex items-center gap-1">
                    1 USD = INR {usdinr.toFixed(2)}
                </div>
            </div>

            <div className="space-y-4">
                {/* Conversion Calculator */}
                <div className="bg-zinc-900/50 p-4 rounded-lg border border-zinc-800/50">
                    <div className="flex justify-between items-center text-sm text-zinc-400 mb-1">
                        <span>Henry Hub ($)</span>
                        <ArrowRightLeft className="w-3 h-3 text-zinc-600" />
                        <span>MCX Parity (INR)</span>
                    </div>
                    <div className="flex justify-between items-end">
                        <span className="text-xl font-semibold text-amber-400">${henryHubPrice.toFixed(2)}</span>
                        <span className="text-2xl font-bold text-pink-400">INR {mcxParity.toFixed(1)}</span>
                    </div>
                    <div className="text-[10px] text-zinc-500 mt-2 text-right">
                        Theoretical Parity (No Premium)
                    </div>
                </div>

                {/* Contract Info */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-zinc-800/20 p-3 rounded border border-zinc-800">
                        <div className="text-xs text-zinc-500 mb-1 flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> Expiry
                        </div>
                        <div className="text-sm font-medium text-zinc-300">25th Monthly</div>
                    </div>
                    <div className="bg-zinc-800/20 p-3 rounded border border-zinc-800">
                        <div className="text-xs text-zinc-500 mb-1">Lot Size</div>
                        <div className="text-sm font-medium text-zinc-300">125 MMBtu</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
