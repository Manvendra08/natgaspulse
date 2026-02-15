/**
 * Zerodha Kite Connect API Client
 * Handles authentication and position fetching
 */

export interface ZerodhaPosition {
    tradingsymbol: string;
    exchange: string;
    instrument_token: number;
    product: string;
    quantity: number;
    overnight_quantity: number;
    multiplier: number;
    average_price: number;
    close_price: number;
    last_price: number;
    value: number;
    pnl: number;
    m2m: number;
    unrealised: number;
    realised: number;
    buy_quantity: number;
    buy_price: number;
    buy_value: number;
    buy_m2m: number;
    sell_quantity: number;
    sell_price: number;
    sell_value: number;
    sell_m2m: number;
    day_buy_quantity: number;
    day_buy_price: number;
    day_buy_value: number;
    day_sell_quantity: number;
    day_sell_price: number;
    day_sell_value: number;
}

export interface ZerodhaCredentials {
    apiKey: string;
    accessToken: string;
}

/**
 * Fetch positions from Zerodha
 * Note: Requires valid access token (obtained via OAuth flow)
 */
export async function fetchZerodhaPositions(credentials: ZerodhaCredentials): Promise<ZerodhaPosition[]> {
    const { apiKey, accessToken } = credentials;

    try {
        const response = await fetch('https://api.kite.trade/portfolio/positions', {
            headers: {
                'X-Kite-Version': '3',
                'Authorization': `token ${apiKey}:${accessToken}`
            }
        });

        if (!response.ok) {
            let errorMessage = `Zerodha API error: ${response.status}`;
            try {
                const errorData = await response.json();
                if (errorData.message) {
                    errorMessage = `Zerodha: ${errorData.message} (${errorData.status})`;
                }
            } catch (e) {
                // Could not parse JSON, stick to status code
            }
            throw new Error(errorMessage);
        }

        const data = await response.json();
        return data.data?.net || [];
    } catch (error) {
        console.error('Failed to fetch Zerodha positions:', error);
        throw error;
    }
}

/**
 * Generate login URL for Zerodha OAuth
 */
export function getZerodhaLoginUrl(apiKey: string, redirectUrl: string): string {
    return `https://kite.zerodha.com/connect/login?api_key=${apiKey}&redirect_params=${encodeURIComponent(redirectUrl)}`;
}

/**
 * Exchange access token from request token
 */
export async function exchangeToken(apiKey: string, requestToken: string, apiSecret: string): Promise<string> {
    const response = await fetch('https://api.kite.trade/session/token', {
        method: 'POST',
        headers: {
            'X-Kite-Version': '3',
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            api_key: apiKey,
            request_token: requestToken,
            checksum: generateChecksum(apiKey, requestToken, apiSecret)
        })
    });

    if (!response.ok) {
        throw new Error('Token exchange failed');
    }

    const data = await response.json();
    return data.data.access_token;
}

function generateChecksum(apiKey: string, requestToken: string, apiSecret: string): string {
    // SHA-256 hash of api_key + request_token + api_secret
    // Note: In production, use crypto library
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(apiKey + requestToken + apiSecret).digest('hex');
}
