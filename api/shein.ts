import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

/**
 * SHEIN Open Platform API 代理 — Vercel Serverless Function
 * 
 * 前端调用 /api/shein?action=xxx，后端用 HMAC-SHA256 签名后转发到 SHEIN API。
 * OpenKey/SecretKey 存储在 Vercel 环境变量中。
 * 
 * 支持的 action:
 * - categories       → /open-api/goods/query-category-tree
 * - attributes       → /open-api/goods/query-attribute-template
 * - transform-pic    → /open-api/goods/transform-pic
 * - publish          → /open-api/goods/product/publishOrEdit
 * - brand-list       → /open-api/goods/query-brand-list
 * - fill-standard    → /open-api/goods/query-publish-fill-in-standard
 */

const SHEIN_BASE_URL = 'https://openapi-test01.sheincorp.cn';

// action → SHEIN API path 映射
const ACTION_PATHS: Record<string, string> = {
    'categories': '/open-api/goods/query-category-tree',
    'attributes': '/open-api/goods/query-attribute-template',
    'transform-pic': '/open-api/goods/transform-pic',
    'publish': '/open-api/goods/product/publishOrEdit',
    'brand-list': '/open-api/goods/query-brand-list',
    'fill-standard': '/open-api/goods/query-publish-fill-in-standard',
};

/**
 * 生成 SHEIN 签名
 * 
 * 算法:
 * 1. RandomKey = 5位随机字符串
 * 2. VALUE = OpenKeyId + "&" + Timestamp + "&" + Path
 * 3. KEY = SecretKey + RandomKey
 * 4. HMAC = HMAC-SHA256(VALUE, KEY) → 小写hex → Base64
 * 5. Signature = RandomKey + Base64字符串
 */
function generateSignature(openKey: string, secretKey: string, timestamp: string, path: string): string {
    // 1. 生成 5 位随机字符串
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let randomKey = '';
    for (let i = 0; i < 5; i++) {
        randomKey += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    // 2. 拼接待签名字符串
    const value = `${openKey}&${timestamp}&${path}`;

    // 3. 拼接密钥
    const key = secretKey + randomKey;

    // 4. HMAC-SHA256 → hex → Base64
    const hmac = crypto.createHmac('sha256', key).update(value).digest('hex').toLowerCase();
    const base64 = Buffer.from(hmac).toString('base64');

    // 5. 最终签名 = RandomKey + Base64
    return randomKey + base64;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { action, body: requestBody, openKey: customOpenKey, secretKey: customSecretKey } = req.body;

        // 优先使用请求中的自定义 Key，其次用环境变量
        const openKey = customOpenKey || process.env.SHEIN_OPEN_KEY;
        const secretKey = customSecretKey || process.env.SHEIN_SECRET_KEY;

        if (!openKey || !secretKey) {
            return res.status(500).json({
                error: 'SHEIN API keys not configured',
                hint: 'Set SHEIN_OPEN_KEY and SHEIN_SECRET_KEY in Vercel environment variables, or pass openKey/secretKey in request body',
            });
        }

        if (!action || !ACTION_PATHS[action]) {
            return res.status(400).json({
                error: `Invalid action: ${action}`,
                validActions: Object.keys(ACTION_PATHS),
            });
        }

        const path = ACTION_PATHS[action];
        const timestamp = String(Date.now());
        const signature = generateSignature(openKey, secretKey, timestamp, path);

        // 调用 SHEIN API
        const url = `${SHEIN_BASE_URL}${path}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json;charset=UTF-8',
                'x-lt-openKeyId': openKey,
                'x-lt-timestamp': timestamp,
                'x-lt-signature': signature,
                'language': 'en',
            },
            body: JSON.stringify(requestBody || {}),
        });

        const responseText = await response.text();
        let data;
        try {
            data = JSON.parse(responseText);
        } catch {
            data = { raw: responseText };
        }

        if (!response.ok) {
            console.error(`SHEIN API error [${action}]:`, response.status, responseText);
            return res.status(response.status).json({
                error: `SHEIN API error: ${response.status}`,
                action,
                path,
                details: data,
            });
        }

        return res.status(200).json({
            success: true,
            action,
            data,
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('SHEIN proxy error:', message);
        return res.status(500).json({ error: message });
    }
}
