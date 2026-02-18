import crypto from 'crypto';

type EncryptedPayload = {
    v: 1;
    iv: string;
    tag: string;
    data: string;
};

function getKey(): Buffer {
    const raw = process.env.APP_ENCRYPTION_KEY;
    if (!raw) {
        throw new Error('Missing APP_ENCRYPTION_KEY');
    }

    // Prefer base64-encoded 32-byte key. Fall back to hashing if user provides a passphrase.
    const asBuf = Buffer.from(raw, 'base64');
    if (asBuf.length === 32) {
        return asBuf;
    }

    return crypto.createHash('sha256').update(raw).digest();
}

export function encryptJson(value: unknown): string {
    const key = getKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();

    const payload: EncryptedPayload = {
        v: 1,
        iv: iv.toString('base64'),
        tag: tag.toString('base64'),
        data: ciphertext.toString('base64')
    };

    return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

export function decryptJson<T = any>(blob: string): T {
    const key = getKey();
    const decoded = Buffer.from(blob, 'base64').toString('utf8');
    const payload = JSON.parse(decoded) as EncryptedPayload;

    if (!payload || payload.v !== 1) {
        throw new Error('Unsupported encrypted payload version');
    }

    const iv = Buffer.from(payload.iv, 'base64');
    const tag = Buffer.from(payload.tag, 'base64');
    const data = Buffer.from(payload.data, 'base64');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    return JSON.parse(plaintext) as T;
}

