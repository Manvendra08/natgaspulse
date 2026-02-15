import { NextResponse } from 'next/server';
import crypto from 'crypto';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { apiKey, apiSecret, requestToken } = body;

        if (!apiKey || !apiSecret || !requestToken) {
            return NextResponse.json(
                { error: 'Missing required credentials (apiKey, apiSecret, or requestToken)' },
                { status: 400 }
            );
        }

        // Generate checksum: SHA256(api_key + request_token + api_secret)
        const checksumData = apiKey + requestToken + apiSecret;
        const checksum = crypto.createHash('sha256').update(checksumData).digest('hex');

        // Exchange for Access Token
        const params = new URLSearchParams();
        params.append('api_key', apiKey);
        params.append('request_token', requestToken);
        params.append('checksum', checksum);

        const response = await fetch('https://api.kite.trade/session/token', {
            method: 'POST',
            headers: {
                'X-Kite-Version': '3',
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Zerodha Token Exchange Failed: ${response.status} - ${errorText}`);
        }

        const data = await response.json();

        if (data.status === 'error') {
            throw new Error(data.message || 'Token exchange returned error status');
        }

        return NextResponse.json({
            accessToken: data.data.access_token,
            publicToken: data.data.public_token,
            userName: data.data.user_name,
            userId: data.data.user_id,
            loginTime: data.data.login_time
        });

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Token exchange failed';
        console.error('Zerodha Auth Error:', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
