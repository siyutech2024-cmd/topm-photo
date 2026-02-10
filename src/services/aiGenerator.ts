import type { GenerationResult, ProductAttribute } from '../types';

/**
 * AI 图片生成服务
 * 当前版本使用 Canvas API 进行图像处理模拟 AI 生成
 * 后续可替换为真实 AI API（Gemini Imagen、Stability AI 等）
 */

const PRODUCT_STYLES = [
    { name: '纯白背景', filter: 'brightness(1.1) contrast(1.1) saturate(1.05)', bg: '#ffffff' },
    { name: '渐变背景', filter: 'brightness(1.05) contrast(1.15)', bg: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)' },
    { name: '暖色调', filter: 'brightness(1.08) contrast(1.05) saturate(1.2) sepia(0.1)', bg: '#fef9ef' },
    { name: '冷色调', filter: 'brightness(1.05) contrast(1.1) saturate(0.9) hue-rotate(10deg)', bg: '#f0f4f8' },
    { name: '高对比', filter: 'brightness(1.02) contrast(1.3) saturate(1.15)', bg: '#f8f8f8' },
];

const EFFECT_STYLES = [
    { name: '生活场景', overlay: 'rgba(255,200,100,0.08)', blur: 1, vignette: true },
    { name: '专业棚拍', overlay: 'rgba(100,150,255,0.06)', blur: 0, vignette: false },
];

const CATEGORIES = [
    '数码电子', '服装鞋帽', '家居家具', '美妆个护', '食品饮料',
    '运动户外', '母婴玩具', '图书文具', '珠宝配饰', '汽车用品'
];

const TITLE_PREFIXES = [
    '高品质', '经典款', '新款升级版', '热销爆款', '简约时尚',
    '轻奢', '精选', '定制款', '限定版', '旗舰款'
];

const TITLE_SUFFIXES = [
    '多功能设计 品质生活之选',
    '精工制造 匠心独运',
    '简约设计 百搭实用',
    '舒适体验 品质保障',
    '高端定制 质感非凡'
];

function pickRandom<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
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

async function generateProductImage(
    sourceImages: string[],
    style: typeof PRODUCT_STYLES[number],
    index: number
): Promise<string> {
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 1000;
    const ctx = canvas.getContext('2d')!;

    // Draw background
    if (style.bg.startsWith('linear')) {
        const grad = ctx.createLinearGradient(0, 0, 1000, 1000);
        grad.addColorStop(0, '#f5f7fa');
        grad.addColorStop(1, '#c3cfe2');
        ctx.fillStyle = grad;
    } else {
        ctx.fillStyle = style.bg;
    }
    ctx.fillRect(0, 0, 1000, 1000);

    // Use different source images or compositions based on index
    const imgIndex = index % sourceImages.length;
    const img = await loadImage(sourceImages[imgIndex]);

    // Calculate fit dimensions (centered, with padding)
    const padding = 60;
    const maxW = 1000 - padding * 2;
    const maxH = 1000 - padding * 2;
    const scale = Math.min(maxW / img.width, maxH / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    const x = (1000 - w) / 2;
    const y = (1000 - h) / 2;

    // Apply filter
    ctx.filter = style.filter;

    // Add subtle shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 10;

    ctx.drawImage(img, x, y, w, h);
    ctx.filter = 'none';
    ctx.shadowColor = 'transparent';

    // Add watermark
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

    // Create a scene-like background
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

    // Add geometric decoration elements
    ctx.globalAlpha = 0.05;
    for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        const cx = Math.random() * 1000;
        const cy = Math.random() * 1000;
        const r = 50 + Math.random() * 200;
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = index === 0 ? '#c89b5c' : '#6b8cc7';
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Draw main product image
    const mainImg = await loadImage(sourceImages[0]);
    const scale = Math.min(600 / mainImg.width, 600 / mainImg.height);
    const w = mainImg.width * scale;
    const h = mainImg.height * scale;

    // Shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 15;

    // position off-center for effect
    const offsetX = index === 0 ? 80 : -30;
    ctx.drawImage(mainImg, (1000 - w) / 2 + offsetX, (1000 - h) / 2 - 20, w, h);
    ctx.shadowColor = 'transparent';

    // Draw secondary image if available
    if (sourceImages.length > 1) {
        const secImg = await loadImage(sourceImages[1]);
        const s2 = Math.min(280 / secImg.width, 280 / secImg.height);
        const w2 = secImg.width * s2;
        const h2 = secImg.height * s2;
        ctx.globalAlpha = 0.85;
        ctx.shadowColor = 'rgba(0,0,0,0.15)';
        ctx.shadowBlur = 20;
        ctx.drawImage(secImg, index === 0 ? 650 : 80, 620, w2, h2);
        ctx.globalAlpha = 1;
        ctx.shadowColor = 'transparent';
    }

    // Color overlay
    ctx.fillStyle = style.overlay;
    ctx.fillRect(0, 0, 1000, 1000);

    // Vignette effect
    if (style.vignette) {
        const vGrad = ctx.createRadialGradient(500, 500, 300, 500, 500, 700);
        vGrad.addColorStop(0, 'rgba(0,0,0,0)');
        vGrad.addColorStop(1, 'rgba(0,0,0,0.2)');
        ctx.fillStyle = vGrad;
        ctx.fillRect(0, 0, 1000, 1000);
    }

    // Add stylish text overlay
    ctx.globalAlpha = 0.08;
    ctx.font = 'bold 48px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.fillText('TOPM PHOTO', 500, 950);
    ctx.globalAlpha = 1;

    return canvas.toDataURL('image/jpeg', 0.92);
}

function generateProductInfo(): { title: string; description: string; price: number; category: string; attributes: ProductAttribute[] } {
    const prefix = pickRandom(TITLE_PREFIXES);
    const suffix = pickRandom(TITLE_SUFFIXES);
    const category = pickRandom(CATEGORIES);
    const title = `${prefix} ${suffix}`;

    const description = `这款${prefix}产品采用优质材料精心制作，${suffix.replace(/ /g, '，')}。适合各种场合使用，是您日常生活的理想之选。产品经过严格品质检测，确保每一件都达到高标准品质要求。`;

    const price = Math.floor(Math.random() * 500 + 50) + 0.99;

    const attributes: ProductAttribute[] = [
        { key: '品牌', value: 'TOPM' },
        { key: '材质', value: pickRandom(['优质棉', '高级合金', 'ABS工程塑料', '天然皮革', '食品级硅胶', '304不锈钢']) },
        { key: '颜色', value: pickRandom(['经典黑', '珍珠白', '深空灰', '玫瑰金', '星光蓝', '抹茶绿']) },
        { key: '尺寸', value: pickRandom(['S/M/L/XL', '均码', '25×15×10cm', '30×20×15cm', '350ml', '500ml']) },
        { key: '重量', value: pickRandom(['150g', '280g', '450g', '680g', '1.2kg']) },
        { key: '产地', value: pickRandom(['中国广东', '中国浙江', '中国江苏', '中国福建']) },
        { key: '包装', value: pickRandom(['精美礼盒', '环保纸盒', '品牌包装袋', '防震收纳盒']) },
        { key: '保修', value: pickRandom(['一年质保', '两年质保', '终身保修', '30天无理由退换']) },
    ];

    return { title, description, price, category, attributes };
}

export async function generateProductContent(
    sourceImages: string[],
    onProgress?: (progress: number, message: string) => void
): Promise<GenerationResult> {
    const totalSteps = 8;
    let currentStep = 0;

    const report = (msg: string) => {
        currentStep++;
        onProgress?.(Math.round((currentStep / totalSteps) * 100), msg);
    };

    // Generate product images
    report('正在分析产品特征...');
    await new Promise(r => setTimeout(r, 600));

    const productImages: string[] = [];
    for (let i = 0; i < 5; i++) {
        report(`正在生成产品图 ${i + 1}/5...`);
        const img = await generateProductImage(sourceImages, PRODUCT_STYLES[i], i);
        productImages.push(img);
        await new Promise(r => setTimeout(r, 400));
    }

    // Generate effect images
    const effectImages: string[] = [];
    for (let i = 0; i < 2; i++) {
        report(`正在生成效果图 ${i + 1}/2...`);
        const img = await generateEffectImage(sourceImages, EFFECT_STYLES[i], i);
        effectImages.push(img);
        await new Promise(r => setTimeout(r, 300));
    }

    // Generate product info
    report('正在生成产品信息...');
    await new Promise(r => setTimeout(r, 500));
    const info = generateProductInfo();

    return {
        productImages,
        effectImages,
        ...info,
    };
}
