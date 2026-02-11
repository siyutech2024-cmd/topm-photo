import { GoogleGenAI } from '@google/genai';
import type { GenerationResult, ProductAttribute } from '../types';

/**
 * AI 产品内容生成服务
 * - 产品图/效果图：Gemini 2.5 Flash Image (Nano Banana) 原生生成
 * - 产品信息：Gemini 2.0 Flash 视觉分析（标题、描述、价格、属性）
 * - Fallback：Canvas API 本地处理 + 随机模拟数据
 */

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string;

function getAI() {
    return new GoogleGenAI({ apiKey: GEMINI_API_KEY });
}

// ===== 工具函数 =====

function extractBase64Data(dataUrl: string): string {
    const match = dataUrl.match(/^data:image\/(.*?);base64,(.*)$/);
    return match ? match[2] : dataUrl;
}

function getMimeType(dataUrl: string): string {
    const match = dataUrl.match(/^data:(image\/.*?);base64,/);
    return match ? match[1] : 'image/jpeg';
}

async function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

// ===== Nano Banana 图片生成 =====

async function generateImageWithNanoBanana(
    sourceImages: string[],
    prompt: string,
): Promise<string | null> {
    try {
        const ai = getAI();

        // Build content parts: text prompt + reference images
        const contents: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
            { text: prompt },
        ];

        // Add up to 2 source images as reference
        for (let i = 0; i < Math.min(2, sourceImages.length); i++) {
            contents.push({
                inlineData: {
                    mimeType: getMimeType(sourceImages[i]),
                    data: extractBase64Data(sourceImages[i]),
                },
            });
        }

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: contents,
        });

        // Extract generated image from response
        if (response.candidates?.[0]?.content?.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData?.data) {
                    const mimeType = part.inlineData.mimeType || 'image/png';
                    return `data:${mimeType};base64,${part.inlineData.data}`;
                }
            }
        }
        return null;
    } catch (err) {
        console.warn('Nano Banana 图片生成失败:', err);
        return null;
    }
}

// ===== Canvas Fallback 图片处理 =====

const PRODUCT_STYLES = [
    { name: '纯白背景', filter: 'brightness(1.1) contrast(1.1) saturate(1.05)', bg: '#ffffff' },
    { name: '渐变背景', filter: 'brightness(1.05) contrast(1.15)', bg: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)' },
    { name: '暖色调', filter: 'brightness(1.08) contrast(1.05) saturate(1.2) sepia(0.1)', bg: '#fef9ef' },
    { name: '冷色调', filter: 'brightness(1.05) contrast(1.1) saturate(0.9) hue-rotate(10deg)', bg: '#f0f4f8' },
    { name: '高对比', filter: 'brightness(1.02) contrast(1.3) saturate(1.15)', bg: '#f8f8f8' },
];

async function generateProductImageCanvas(
    sourceImages: string[],
    style: typeof PRODUCT_STYLES[number],
    index: number
): Promise<string> {
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 1000;
    const ctx = canvas.getContext('2d')!;

    if (style.bg.startsWith('linear')) {
        const grad = ctx.createLinearGradient(0, 0, 1000, 1000);
        grad.addColorStop(0, '#f5f7fa');
        grad.addColorStop(1, '#c3cfe2');
        ctx.fillStyle = grad;
    } else {
        ctx.fillStyle = style.bg;
    }
    ctx.fillRect(0, 0, 1000, 1000);

    const imgIndex = index % sourceImages.length;
    const img = await loadImage(sourceImages[imgIndex]);
    const padding = 60;
    const scale = Math.min((1000 - padding * 2) / img.width, (1000 - padding * 2) / img.height);
    const w = img.width * scale;
    const h = img.height * scale;

    ctx.filter = style.filter;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 10;
    ctx.drawImage(img, (1000 - w) / 2, (1000 - h) / 2, w, h);
    ctx.filter = 'none';
    ctx.shadowColor = 'transparent';

    ctx.globalAlpha = 0.06;
    ctx.font = 'bold 36px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.fillText('TOPM', 500, 960);
    ctx.globalAlpha = 1;

    return canvas.toDataURL('image/jpeg', 0.92);
}

async function generateEffectImageCanvas(
    sourceImages: string[],
    index: number
): Promise<string> {
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 1000;
    const ctx = canvas.getContext('2d')!;

    const bgGrad = ctx.createRadialGradient(500, 500, 100, 500, 500, 700);
    if (index === 0) {
        bgGrad.addColorStop(0, '#faf5ef');
        bgGrad.addColorStop(0.5, '#f0e8da');
        bgGrad.addColorStop(1, '#d4c5a9');
    } else {
        bgGrad.addColorStop(0, '#e8edf5');
        bgGrad.addColorStop(0.5, '#d0d8e8');
        bgGrad.addColorStop(1, '#a8b5cc');
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1000, 1000);

    ctx.globalAlpha = 0.05;
    for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.arc(Math.random() * 1000, Math.random() * 1000, 50 + Math.random() * 200, 0, Math.PI * 2);
        ctx.fillStyle = index === 0 ? '#c89b5c' : '#6b8cc7';
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    const mainImg = await loadImage(sourceImages[0]);
    const scale = Math.min(600 / mainImg.width, 600 / mainImg.height);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 15;
    const offsetX = index === 0 ? 80 : -30;
    ctx.drawImage(mainImg, (1000 - mainImg.width * scale) / 2 + offsetX, (1000 - mainImg.height * scale) / 2 - 20, mainImg.width * scale, mainImg.height * scale);
    ctx.shadowColor = 'transparent';

    if (sourceImages.length > 1) {
        const secImg = await loadImage(sourceImages[1]);
        const s2 = Math.min(280 / secImg.width, 280 / secImg.height);
        ctx.globalAlpha = 0.85;
        ctx.shadowColor = 'rgba(0,0,0,0.15)';
        ctx.shadowBlur = 20;
        ctx.drawImage(secImg, index === 0 ? 650 : 80, 620, secImg.width * s2, secImg.height * s2);
        ctx.globalAlpha = 1;
        ctx.shadowColor = 'transparent';
    }

    ctx.globalAlpha = 0.08;
    ctx.font = 'bold 48px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.fillText('TOPM PHOTO', 500, 950);
    ctx.globalAlpha = 1;

    return canvas.toDataURL('image/jpeg', 0.92);
}

// ===== Gemini 产品信息生成 =====

async function generateProductInfoWithGemini(sourceImages: string[]): Promise<{
    title: string;
    description: string;
    price: number;
    category: string;
    attributes: ProductAttribute[];
}> {
    const ai = getAI();

    const contents: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
        {
            text: `你是一位专业的电商产品运营专家。请仔细观察这些产品图片，然后生成完整的电商产品信息。

请严格按照以下 JSON 格式返回，不要包含任何其他文字或 markdown 标记：

{
  "title": "产品标题（15-30字，包含核心卖点和关键词）",
  "description": "产品详细描述（100-200字，包含产品特点、材质、适用场景、优势等）",
  "price": 数字（合理的市场价格，不带货币符号），
  "category": "产品类目（从以下选择：数码电子、服装鞋帽、家居家具、美妆个护、食品饮料、运动户外、母婴玩具、图书文具、珠宝配饰、汽车用品、其他）",
  "attributes": [
    {"key": "品牌", "value": "识别或推测的品牌"},
    {"key": "材质", "value": "产品材质"},
    {"key": "颜色", "value": "产品颜色"},
    {"key": "尺寸", "value": "预估尺寸"},
    {"key": "重量", "value": "预估重量"},
    {"key": "产地", "value": "推测产地"},
    {"key": "包装", "value": "包装方式"},
    {"key": "保修", "value": "保修期限"}
  ]
}`,
        },
    ];

    for (let i = 0; i < Math.min(4, sourceImages.length); i++) {
        contents.push({
            inlineData: {
                mimeType: getMimeType(sourceImages[i]),
                data: extractBase64Data(sourceImages[i]),
            },
        });
    }

    const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: contents,
    });

    const text = response.candidates?.[0]?.content?.parts
        ?.map(p => p.text)
        .filter(Boolean)
        .join('') || '';

    let jsonStr = text;
    const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) jsonStr = jsonMatch[1];
    const objMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objMatch) jsonStr = objMatch[0];

    const parsed = JSON.parse(jsonStr);
    return {
        title: parsed.title || '未命名产品',
        description: parsed.description || '',
        price: typeof parsed.price === 'number' ? parsed.price : parseFloat(parsed.price) || 99.9,
        category: parsed.category || '其他',
        attributes: Array.isArray(parsed.attributes) ? parsed.attributes : [],
    };
}

// ===== Fallback 模拟生成 =====

function generateProductInfoFallback(): {
    title: string; description: string; price: number; category: string; attributes: ProductAttribute[];
} {
    const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
    const prefix = pick(['高品质', '经典款', '新款升级版', '热销爆款', '简约时尚']);
    const suffix = pick(['多功能设计 品质生活之选', '精工制造 匠心独运', '简约设计 百搭实用']);
    return {
        title: `${prefix} ${suffix}`,
        description: `这款${prefix}产品采用优质材料精心制作，${suffix.replace(/ /g, '，')}。适合各种场合使用。`,
        price: Math.floor(Math.random() * 500 + 50) + 0.99,
        category: pick(['数码电子', '服装鞋帽', '家居家具', '美妆个护']),
        attributes: [
            { key: '品牌', value: 'TOPM' },
            { key: '材质', value: pick(['优质棉', '高级合金', 'ABS工程塑料']) },
            { key: '颜色', value: pick(['经典黑', '珍珠白', '深空灰']) },
            { key: '尺寸', value: pick(['S/M/L/XL', '均码', '25×15×10cm']) },
            { key: '重量', value: pick(['150g', '280g', '450g']) },
            { key: '产地', value: pick(['中国广东', '中国浙江']) },
            { key: '包装', value: pick(['精美礼盒', '环保纸盒']) },
            { key: '保修', value: pick(['一年质保', '两年质保']) },
        ],
    };
}

// ===== 图片生成 Prompt 模板 =====

const PRODUCT_IMG_PROMPTS = [
    '将这个产品放在纯白色背景上拍摄，光线明亮均匀，电商产品主图风格，正面展示，高清 1000x1000 像素，专业产品摄影',
    '将这个产品以45度角展示在简约渐变灰白背景上，柔和的影棚打光，突出产品质感和细节，电商风格，高清',
    '从侧面展示这个产品，纯白背景，明亮柔和的灯光，突出产品轮廓和设计特色，专业电商摄影风格',
    '将这个产品放在浅米色暖色调背景上，营造温馨氛围，光线柔和，展示产品的材质和纹理，高品质产品图',
    '从俯视角度展示这个产品，干净的白色背景，影棚灯光，展示产品的顶部细节和整体设计，电商风格',
];

const EFFECT_IMG_PROMPTS = [
    '将这个产品放在优雅的生活场景中展示，比如书桌上或客厅环境，自然光线，生活化场景使用效果图，温暖色调，高品质摄影',
    '将这个产品放在专业的影棚环境中拍摄，使用创意灯光效果，暗调背景突出产品，产品放在展台或展架上，高端广告级摄影效果',
];

// ===== 主入口 =====

export async function generateProductContent(
    sourceImages: string[],
    onProgress?: (progress: number, message: string) => void
): Promise<GenerationResult> {
    const useNanoBanana = !!GEMINI_API_KEY;
    const totalSteps = 9;
    let currentStep = 0;
    const report = (msg: string) => {
        currentStep++;
        onProgress?.(currentStep / totalSteps, msg);
    };

    // Step 1-5: Generate 5 product images
    report('正在分析产品特征...');
    const productImages: string[] = [];

    for (let i = 0; i < 5; i++) {
        report(`正在生成产品图 ${i + 1}/5${useNanoBanana ? '（Nano Banana）' : ''}...`);

        if (useNanoBanana) {
            const aiImage = await generateImageWithNanoBanana(sourceImages, PRODUCT_IMG_PROMPTS[i]);
            if (aiImage) {
                productImages.push(aiImage);
                continue;
            }
        }
        // Fallback to Canvas
        productImages.push(await generateProductImageCanvas(sourceImages, PRODUCT_STYLES[i], i));
    }

    // Step 6-7: Generate 2 effect images
    const effectImages: string[] = [];
    for (let i = 0; i < 2; i++) {
        report(`正在生成效果图 ${i + 1}/2${useNanoBanana ? '（Nano Banana）' : ''}...`);

        if (useNanoBanana) {
            const aiImage = await generateImageWithNanoBanana(sourceImages, EFFECT_IMG_PROMPTS[i]);
            if (aiImage) {
                effectImages.push(aiImage);
                continue;
            }
        }
        // Fallback to Canvas
        effectImages.push(await generateEffectImageCanvas(sourceImages, i));
    }

    // Step 8: Generate product info
    report('AI 正在分析产品信息...');
    let info;
    if (GEMINI_API_KEY) {
        try {
            info = await generateProductInfoWithGemini(sourceImages);
        } catch (err) {
            console.warn('Gemini 产品信息生成失败，使用本地模拟:', err);
            info = generateProductInfoFallback();
        }
    } else {
        info = generateProductInfoFallback();
    }

    return { productImages, effectImages, ...info };
}
