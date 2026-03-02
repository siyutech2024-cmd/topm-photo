import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Gemini API 代理 — Vercel Serverless Function
 * 
 * 将前端发来的 Gemini API 请求转发到 Google API，
 * API Key 存储在服务端环境变量中，避免暴露给客户端。
 * 
 * POST /api/gemini
 * Body: { model: string, contents: any[] }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server' });
    }

    try {
        const { model, contents } = req.body;

        if (!model || !contents) {
            return res.status(400).json({ error: 'Missing model or contents' });
        }

        // Google Generative AI REST endpoint
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: contents }] }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Gemini API error:', response.status, errorText);
            return res.status(response.status).json({
                error: `Gemini API error: ${response.status}`,
                details: errorText,
            });
        }

        const data = await response.json();
        return res.status(200).json(data);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('Proxy error:', message);
        return res.status(500).json({ error: message });
    }
}
