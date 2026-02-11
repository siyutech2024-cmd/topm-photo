import { GoogleGenerativeAI } from '@google/generative-ai';
import type { GenerationResult, ProductAttribute } from '../types';

/**
 * AI 图片生成服务
 * - 产品图/效果图：Canvas API 处理（本地）
 * - 产品信息：Gemini AI 视觉分析生成（标题、描述、价格、属性）
 */

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

const PRODUCT_STYLES = [
    { name: '纯白背景', filter: 'brightness(1.1) contrast(1.1) saturate(1.05)', bg: '#ffffff' },
    { name: '渐变背景', filter: 'brightness(1.05) contrast(1.15)', bg: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)' },
    { name: '暖色调', filter: 'brightness(1.08) contrast(1.05) saturate(1.2) sepia(0.1)', bg: '#fef9ef' },
    { name: '冷色调', filter: 'brightness(1.05) contrast(1.1) saturate(0.9) hue-rotate(10deg)', bg: '#f0f4f8' },
    { name: '高对比', filter: 'brightness(1.02) contrast(1.3) saturate(1.15)', bg: '#f8f8f8' },
];

const EFFECT_STYLES = [
    { name: '生活场景', overlay: 'rgba(255,200,100,0.08)', vignette: true },
    { name: '专业棚拍', overlay: 'rgba(100,150,255,0.06)', vignette: false },
];

// ===== Canvas 图片处理 =====

async function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

async function generateProductImage(
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
    const maxW = 1000 - padding * 2;
    const maxH = 1000 - padding * 2;
    const scale = Math.min(maxW / img.width, maxH / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    const x = (1000 - w) / 2;
    const y = (1000 - h) / 2;

    ctx.filter = style.filter;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 10;
    ctx.drawImage(img, x, y, w, h);
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

async function generateEffectImage(
    sourceImages: string[],
    style: typeof EFFECT_STYLES[number],
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
    const w = mainImg.width * scale;
    const h = mainImg.height * scale;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 15;
    const offsetX = index === 0 ? 80 : -30;
    ctx.drawImage(mainImg, (1000 - w) / 2 + offsetX, (1000 - h) / 2 - 20, w, h);
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

    ctx.fillStyle = style.overlay;
    ctx.fillRect(0, 0, 1000, 1000);

    if (style.vignette) {
        const vGrad = ctx.createRadialGradient(500, 500, 300, 500, 500, 700);
        vGrad.addColorStop(0, 'rgba(0,0,0,0)');
        vGrad.addColorStop(1, 'rgba(0,0,0,0.2)');
        ctx.fillStyle = vGrad;
        ctx.fillRect(0, 0, 1000, 1000);
    }

    ctx.globalAlpha = 0.08;
    ctx.font = 'bold 48px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.fillText('TOPM PHOTO', 500, 950);
    ctx.globalAlpha = 1;

    return canvas.toDataURL('image/jpeg', 0.92);
}

// ===== Gemini AI 产品信息生成 =====

function extractBase64Data(dataUrl: string): string {
    const match = dataUrl.match(/^data:image\/(.*?);base64,(.*)$/);
    return match ? match[2] : dataUrl;
}

function getMimeType(dataUrl: string): string {
    const match = dataUrl.match(/^data:(image\/.*?);base64,/);
    return match ? match[1] : 'image/jpeg';
}

async function generateProductInfoWithGemini(sourceImages: string[]): Promise<{
    title: string;
    description: string;
    price: number;
    category: string;
    attributes: ProductAttribute[];
}> {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const imageParts = sourceImages.slice(0, 4).map(img => ({
        inlineData: {
            data: extractBase64Data(img),
            mimeType: getMimeType(img),
        },
    }));

    const prompt = `你是一位专业的电商产品运营专家。请仔细观察这些产品图片，然后生成完整的电商产品信息。

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
}

要求：
1. 标题要有吸引力，包含核心卖点
2. 描述要详细专业，突出产品优势
3. 价格要符合该类产品的市场行情
4. 属性要尽可能准确，基于图片内容推断`;

    const result = await model.generateContent([prompt, ...imageParts]);
    const text = result.response.text();

    // Extract JSON from response (handle possible markdown wrapping)
    let jsonStr = text;
    const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
        jsonStr = jsonMatch[1];
    }
    // Also try to find raw JSON object
    const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objectMatch) {
        jsonStr = objectMatch[0];
    }

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
    title: string;
    description: string;
    price: number;
    category: string;
    attributes: ProductAttribute[];
} {
    const prefixes = ['高品质', '经典款', '新款升级版', '热销爆款', '简约时尚'];
    const suffixes = ['多功能设计 品质生活之选', '精工制造 匠心独运', '简约设计 百搭实用'];
    const categories = ['数码电子', '服装鞋帽', '家居家具', '美妆个护', '运动户外'];
    const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

    const prefix = pick(prefixes);
    const suffix = pick(suffixes);
    return {
        title: `${prefix} ${suffix}`,
        description: `这款${prefix}产品采用优质材料精心制作，${suffix.replace(/ /g, '，')}。适合各种场合使用。`,
        price: Math.floor(Math.random() * 500 + 50) + 0.99,
        category: pick(categories),
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

// ===== 主入口 =====

export async function generateProductContent(
    sourceImages: string[],
    onProgress?: (progress: number, message: string) => void
): Promise<GenerationResult> {
    const totalSteps = 9;
    let currentStep = 0;
    const report = (msg: string) => {
        currentStep++;
        onProgress?.(currentStep / totalSteps, msg);
    };

    // Step 1: Generate product images (Canvas)
    report('正在分析产品特征...');
    await new Promise(r => setTimeout(r, 400));

    const productImages: string[] = [];
    for (let i = 0; i < 5; i++) {
        report(`正在生成产品图 ${i + 1}/5...`);
        productImages.push(await generateProductImage(sourceImages, PRODUCT_STYLES[i], i));
        await new Promise(r => setTimeout(r, 200));
    }

    // Step 2: Generate effect images (Canvas)
    const effectImages: string[] = [];
    for (let i = 0; i < 2; i++) {
        report(`正在生成效果图 ${i + 1}/2...`);
        effectImages.push(await generateEffectImage(sourceImages, EFFECT_STYLES[i], i));
        await new Promise(r => setTimeout(r, 200));
    }

    // Step 3: Generate product info (Gemini AI or fallback)
    report('AI 正在分析产品信息...');
    let info;
    if (GEMINI_API_KEY) {
        try {
            info = await generateProductInfoWithGemini(sourceImages);
        } catch (err) {
            console.warn('Gemini API 调用失败，使用本地生成:', err);
            info = generateProductInfoFallback();
        }
    } else {
        console.warn('未配置 VITE_GEMINI_API_KEY，使用本地模拟生成');
        info = generateProductInfoFallback();
    }

    return { productImages, effectImages, ...info };
}
