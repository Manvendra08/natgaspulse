// NOAA Weather API Client

const USER_AGENT = '(natural-gas-dashboard, contact@example.com)';

export interface WeatherRegion {
    name: string;
    lat: number;
    lon: number;
    gridId?: string;
    gridX?: number;
    gridY?: number;
}

// Representative cities for key gas-consuming regions
export const KEY_REGIONS: WeatherRegion[] = [
    { name: 'East (NYC)', lat: 40.7128, lon: -74.0060 },
    { name: 'Midwest (Chicago)', lat: 41.8781, lon: -87.6298 },
    // { name: 'South (Houston)', lat: 29.7604, lon: -95.3698 }, // Houston often has data gaps, maybe verify first
    { name: 'South (Atlanta)', lat: 33.7490, lon: -84.3880 }, // Atlanta is good for SE demand
    { name: 'West (LA)', lat: 34.0522, lon: -118.2437 },
    { name: 'Mountain (Denver)', lat: 39.7392, lon: -104.9903 }
];

interface ForecastPeriod {
    name: string;
    startTime: string;
    isDaytime: boolean;
    temperature: number;
    temperatureUnit: string;
    shortForecast: string;
}

export interface DegreeDayData {
    region: string;
    todayHDD: number;
    todayCDD: number;
    total7DayHDD: number;
    total7DayCDD: number;
    error?: boolean;
    forecast: {
        day: string;
        date: string;
        hdd: number;
        cdd: number;
        temp: number;
    }[];
}

// Cache for gridpoints to avoid extra API calls
const gridCache: Record<string, string> = {};

async function getGridpointUrl(lat: number, lon: number): Promise<string> {
    const key = `${lat},${lon}`;
    if (gridCache[key]) return gridCache[key];

    try {
        const res = await fetch(`https://api.weather.gov/points/${lat},${lon}`, {
            headers: { 'User-Agent': USER_AGENT },
            next: { revalidate: 86400 } // Cache gridpoints for 24h
        });

        if (!res.ok) throw new Error(`Failed to fetch gridpoint: ${res.status}`);

        const data = await res.json();
        const forecastUrl = data.properties.forecast;
        gridCache[key] = forecastUrl;
        return forecastUrl;
    } catch (error) {
        console.error(`Error getting gridpoint for ${lat},${lon}:`, error);
        throw error;
    }
}

export async function getRegionalDegreeDays(): Promise<DegreeDayData[]> {
    const results: DegreeDayData[] = [];

    for (const region of KEY_REGIONS) {
        try {
            let data;
            try {
                const forecastUrl = await getGridpointUrl(region.lat, region.lon);
                const res = await fetch(forecastUrl, {
                    headers: { 'User-Agent': USER_AGENT },
                    next: { revalidate: 3600 }
                });

                if (!res.ok) throw new Error(`Status ${res.status}`);
                data = await res.json();
            } catch (err) {
                console.warn(`Forecast fetch failed for ${region.name}, retrying points...`);
                // Retry logic: maybe gridpoint expired? Force refetch points
                // For MVP, just fail gracefully
                throw err;
            }

            const periods: ForecastPeriod[] = data.properties.periods;

            const dailyMap = new Map<string, number[]>();
            for (const p of periods) {
                const date = p.startTime.split('T')[0];
                if (!dailyMap.has(date)) dailyMap.set(date, []);
                dailyMap.get(date)?.push(p.temperature);
            }

            let todayHDD = 0;
            let todayCDD = 0;
            let total7DayHDD = 0;
            let total7DayCDD = 0;
            const forecast = [];
            const todayDate = new Date().toISOString().split('T')[0];

            // We want to skip today if it has incomplete data? 
            // Actually, for "Today", we want whatever forecast remains or use current conditions.
            // For simplicity, we use the forecast for the current date key.

            let dayCount = 0;
            for (const [date, temps] of dailyMap.entries()) {
                if (temps.length === 0) continue;

                const avgTemp = temps.reduce((a, b) => a + b, 0) / temps.length;
                const hdd = Math.max(0, 65 - avgTemp);
                const cdd = Math.max(0, avgTemp - 65);

                if (date === todayDate) {
                    todayHDD = Math.round(hdd);
                    todayCDD = Math.round(cdd);
                }

                if (dayCount < 7) {
                    total7DayHDD += hdd;
                    total7DayCDD += cdd;

                    forecast.push({
                        day: new Date(date).toLocaleDateString('en-US', { weekday: 'short' }),
                        date: date,
                        hdd: Math.round(hdd),
                        cdd: Math.round(cdd),
                        temp: Math.round(avgTemp)
                    });
                    dayCount++;
                }
            }

            results.push({
                region: region.name,
                todayHDD,
                todayCDD,
                total7DayHDD: Math.round(total7DayHDD),
                total7DayCDD: Math.round(total7DayCDD),
                forecast
            });

        } catch (error) {
            console.error(`Error processing region ${region.name}:`, error);
            results.push({
                region: region.name,
                error: true,
                todayHDD: 0,
                todayCDD: 0,
                total7DayHDD: 0,
                total7DayCDD: 0,
                forecast: []
            });
        }
    }

    return results;
}
