'use client';
import { useState, useEffect } from 'react';
import { Map, RefreshCw } from 'lucide-react';
import Image from 'next/image';

const MAP_URLS = {
    '6-10 Day': 'https://www.cpc.ncep.noaa.gov/products/predictions/610day/610temp.new.gif',
    '8-14 Day': 'https://www.cpc.ncep.noaa.gov/products/predictions/814day/814temp.new.gif'
};

export default function WeatherMap() {
    const [activeMap, setActiveMap] = useState<'6-10 Day' | '8-14 Day'>('6-10 Day');
    // Add timestamp to bust cache
    // Initialize with 0 to prevent hydration mismatch
    const [timestamp, setTimestamp] = useState(0);

    useEffect(() => {
        setTimestamp(Date.now());
        const timer = setInterval(() => setTimestamp(Date.now()), 1800000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 rounded-xl p-6 shadow-2xl h-full flex flex-col hover:border-zinc-700 transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-purple-500/10 rounded-lg border border-purple-500/30">
                        <Map className="w-5 h-5 text-purple-400" />
                    </div>
                    <h2 className="text-xl font-bold text-zinc-100">Temp Outlook</h2>
                </div>

                <div className="flex gap-2">
                    {Object.keys(MAP_URLS).map((key) => (
                        <button
                            key={key}
                            onClick={() => setActiveMap(key as any)}
                            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${activeMap === key
                                ? 'bg-purple-500 text-white'
                                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                                }`}
                        >
                            {key}
                        </button>
                    ))}
                </div>
            </div>

            <div className="relative flex-1 bg-zinc-900 rounded-lg overflow-hidden border border-zinc-800 min-h-[300px]">
                {/* We use unoptimized because these are external dynamic images */}
                <Image
                    src={`${MAP_URLS[activeMap]}?t=${timestamp}`}
                    alt={`${activeMap} Temperature Probability Chart`}
                    fill
                    className="object-contain"
                    unoptimized
                />

                <div className="absolute bottom-2 right-2 flex gap-1 items-center bg-black/50 backdrop-blur px-2 py-1 rounded text-[10px] text-zinc-400">
                    <RefreshCw className="w-3 h-3" />
                    <span>NOAA CPC</span>
                </div>
            </div>
        </div>
    );
}
