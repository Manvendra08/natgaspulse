// EIA API Client for Natural Gas Data

const EIA_BASE_URL = 'https://api.eia.gov/v2';
const API_KEY = process.env.EIA_API_KEY || '2gWOaADeVAIU5QNWXMScQ1CbjdULr4Eq1KdFung0';

export interface StorageDataPoint {
    period: string;
    value: number;
    duoarea: string;
    process: string;
}

export interface StorageResponse {
    response: {
        data: StorageDataPoint[];
    };
}

export interface HenryHubDataPoint {
    period: string;
    value: number;
}

export interface PriceResponse {
    response: {
        data: HenryHubDataPoint[];
    };
}

/**
 * Fetch weekly natural gas storage data from EIA
 * @param limit Number of records to fetch (default: 52 for one year)
 */
export async function fetchWeeklyStorage(limit: number = 52): Promise<StorageDataPoint[]> {
    try {
        const url = `${EIA_BASE_URL}/natural-gas/stor/wkly/data/?api_key=${API_KEY}&frequency=weekly&data[0]=value&facets[duoarea][]=R48&facets[process][]=SWO&sort[0][column]=period&sort[0][direction]=desc&offset=0&length=${limit}`;

        const response = await fetch(url, {
            next: { revalidate: 3600 } // Revalidate every hour
        });

        if (!response.ok) {
            throw new Error(`EIA API error: ${response.status}`);
        }

        const data: StorageResponse = await response.json();
        return data.response.data.map(d => ({
            ...d,
            value: typeof d.value === 'string' ? parseFloat(d.value) : d.value
        }));
    } catch (error) {
        console.error('Error fetching storage data:', error);
        throw error;
    }
}

/**
 * Fetch Henry Hub natural gas spot prices
 * @param limit Number of records to fetch
 */
export async function fetchHenryHubPrices(limit: number = 30): Promise<HenryHubDataPoint[]> {
    try {
        const url = `${EIA_BASE_URL}/natural-gas/pri/fut/data/?api_key=${API_KEY}&frequency=daily&data[0]=value&facets[series][]=RNGWHHD&sort[0][column]=period&sort[0][direction]=desc&offset=0&length=${limit}`;

        const response = await fetch(url, {
            next: { revalidate: 3600 } // Revalidate every hour
        });

        if (!response.ok) {
            throw new Error(`EIA API error: ${response.status}`);
        }

        const data: PriceResponse = await response.json();
        return data.response.data.map(d => ({
            ...d,
            value: typeof d.value === 'string' ? parseFloat(d.value) : d.value
        }));
    } catch (error) {
        console.error('Error fetching Henry Hub prices:', error);
        throw error;
    }
}

/**
 * Calculate storage statistics including 5-year average with linear interpolation
 * to match EIA's calendar-aligned reports.
 */
export async function getStorageStatistics() {
    try {
        // Fetch 6+ years of data for interpolation (320 weeks)
        const storageData = await fetchWeeklyStorage(320);

        if (!storageData || storageData.length === 0) {
            throw new Error('No storage data available');
        }

        const current = storageData[0];
        const currentDate = new Date(current.period);

        // Helper: Interpolate value for a specific target date from weekly reports
        const getInterpolatedValue = (targetDate: Date): number => {
            let afterIdx = -1;
            let beforeIdx = -1;

            for (let i = 0; i < storageData.length - 1; i++) {
                const dateA = new Date(storageData[i].period);
                const dateB = new Date(storageData[i + 1].period);

                if (dateA >= targetDate && dateB <= targetDate) {
                    afterIdx = i;
                    beforeIdx = i + 1;
                    break;
                }
            }

            if (afterIdx === -1) {
                // If targetDate is not between any two report dates in our data, 
                // return the nearest approximation (index 52 for y/y)
                return storageData[52]?.value || 0;
            }

            const dA = new Date(storageData[afterIdx].period).getTime();
            const dB = new Date(storageData[beforeIdx].period).getTime();
            const vA = storageData[afterIdx].value;
            const vB = storageData[beforeIdx].value;

            if (dA === dB) return vA;

            // Linear interpolation
            const t = (targetDate.getTime() - dB) / (dA - dB);
            return vB + t * (vA - vB);
        };

        // 1. Year Ago (Same calendar date exactly 1 year prior)
        const dateYearAgo = new Date(currentDate);
        dateYearAgo.setFullYear(dateYearAgo.getFullYear() - 1);
        const yearAgoValue = Math.round(getInterpolatedValue(dateYearAgo));

        // 2. 5-Year Average (Average of interpolated values for same calendar date in last 5 years)
        let sum5Yr = 0;
        for (let i = 1; i <= 5; i++) {
            const target = new Date(currentDate);
            target.setFullYear(target.getFullYear() - i);
            sum5Yr += getInterpolatedValue(target);
        }
        const fiveYearAvg = Math.round(sum5Yr / 5);

        // Calculate deviation benchmarks
        const deviation = current.value - fiveYearAvg;
        const deviationPercent = (deviation / fiveYearAvg) * 100;

        // Calculate Weekly Change
        const previous = storageData[1];
        const change = current.value - (previous?.value || current.value);

        // Calculate Next Release Date
        const today = new Date();
        let nextRelease = new Date(today);
        nextRelease.setDate(today.getDate() + ((4 + 7 - today.getDay()) % 7));
        if (today.getDay() === 4 && today.getUTCHours() >= 15) {
            nextRelease.setDate(nextRelease.getDate() + 7);
        }

        // Forecast Estimation (5-year historical average change for next week)
        let forecastSum = 0;
        let count = 0;
        for (let i = 1; i <= 5; i++) {
            const idx = i * 52 - 1;
            if (idx < storageData.length - 1) {
                forecastSum += (storageData[idx].value - storageData[idx + 1].value);
                count++;
            }
        }
        const forecastChange = count > 0 ? Math.round(forecastSum / count) : 0;

        // Calculate Precise Release Time for the current report
        // EIA reports for 'week ending Friday' are released the following Thursday at 10:30 AM ET
        const weekEnding = new Date(current.period);
        const releasedDate = new Date(weekEnding);
        releasedDate.setDate(weekEnding.getDate() + 6); // Friday to Thursday
        releasedDate.setUTCHours(15, 30, 0, 0); // 10:30 AM ET is 15:30 UTC

        return {
            current: current.value,
            weekEndingDate: current.period,
            releaseDate: releasedDate.toISOString(),
            change: change,
            nextReleaseDate: nextRelease.toISOString(),
            forecastChange: forecastChange,
            yearAgo: yearAgoValue,
            fiveYearAvg: fiveYearAvg,
            deviation: Math.round(deviation),
            deviationPercent: deviationPercent.toFixed(2),
            historicalData: storageData.slice(0, 300).reverse()
        };
    } catch (error) {
        console.error('Error calculating storage statistics:', error);
        throw error;
    }
}
