import type { GenerationResult, ProductAttribute } from '../types';

/**
 * AI 产品内容生成服务
 * - 产品图/效果图：Gemini 2.5 Flash Image (Nano Banana) 原生生成
 * - 产品信息：Gemini 2.0 Flash 视觉分析（标题、描述、价格、属性）
 * - Fallback：Canvas API 本地处理 + 随机模拟数据
 *
 * 本地开发：使用 VITE_GEMINI_API_KEY 直接调用 SDK
 * 线上生产：通过 /api/gemini 代理（API Key 存储在服务端）
 */

const VITE_GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;

/** 是否有可用的 Gemini API（本地 Key 或线上代理） */
function hasGeminiAccess(): boolean {
    // 本地有 Key，或者在生产环境（部署到 Vercel 后有 /api/gemini 代理）
    return !!VITE_GEMINI_API_KEY || import.meta.env.PROD;
}

/**
 * 统一的 Gemini API 调用入口
 * - 本地：直接调用 Google REST API (带 VITE_GEMINI_API_KEY)
 * - 线上：通过 /api/gemini 代理
 */
async function callGemini(
    model: string,
    contents: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>,
): Promise<{ candidates?: Array<{ content?: { parts?: Array<{ text?: string; inlineData?: { mimeType?: string; data?: string } }> } }> }> {
    if (VITE_GEMINI_API_KEY) {
        // 本地开发模式：直接调用 Google API
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${VITE_GEMINI_API_KEY}`;
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: contents }] }),
        });
        if (!resp.ok) throw new Error(`Gemini API error: ${resp.status}`);
        return await resp.json();
    } else {
        // 线上生产模式：通过 /api/gemini 代理
        const resp = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, contents }),
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.error || `Proxy error: ${resp.status}`);
        }
        return await resp.json();
    }
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

        const response = await callGemini('gemini-2.5-flash-image', contents);

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
    const contents: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
        {
            text: `Eres un experto profesional en operaciones de productos de e-commerce. Observa cuidadosamente estas imágenes del producto y genera la información completa del producto en ESPAÑOL.

Devuelve ESTRICTAMENTE en el siguiente formato JSON, sin ningún otro texto ni marcas markdown:

{
  "title": "Título del producto (10-20 palabras, incluir puntos de venta clave y palabras clave)",
  "description": "Descripción detallada del producto (80-150 palabras, incluir características, materiales, escenarios de uso, ventajas, etc.)",
  "price": número (precio de mercado razonable en USD, sin símbolo de moneda),
  "category": "Categoría del producto (elegir de: Electrónica, Ropa y Calzado, Hogar y Muebles, Belleza y Cuidado Personal, Alimentos y Bebidas, Deportes y Aire Libre, Bebés y Juguetes, Libros y Papelería, Joyería y Accesorios, Automotriz, Otros)",
  "attributes": [
    {"key": "Marca", "value": "marca identificada o estimada"},
    {"key": "Material", "value": "material del producto"},
    {"key": "Color", "value": "color del producto"},
    {"key": "Dimensiones", "value": "tamaño estimado"},
    {"key": "Peso", "value": "peso estimado"},
    {"key": "Origen", "value": "país de origen estimado"},
    {"key": "Empaque", "value": "tipo de empaque"},
    {"key": "Garantía", "value": "período de garantía"}
  ]
}

Requisitos:
1. El título debe ser atractivo, incluir los puntos de venta principales
2. La descripción debe ser detallada y profesional, destacando las ventajas del producto
3. El precio debe ser acorde al mercado para este tipo de producto (en USD)
4. Los atributos deben ser lo más precisos posible, basados en el contenido de las imágenes`,
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

    const response = await callGemini('gemini-2.0-flash', contents);

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
        category: parsed.category || 'Otros',
        attributes: Array.isArray(parsed.attributes) ? parsed.attributes : [],
    };
}

// ===== Fallback 模拟生成 (西班牙语) =====

function generateProductInfoFallback(): {
    title: string; description: string; price: number; category: string; attributes: ProductAttribute[];
} {
    const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
    const prefix = pick(['Premium', 'Clásico', 'Nueva Edición', 'Más Vendido', 'Elegante']);
    const suffix = pick(['Diseño Multifuncional', 'Calidad Superior', 'Estilo Minimalista']);
    return {
        title: `${prefix} - ${suffix}`,
        description: `Este producto ${prefix.toLowerCase()} está elaborado con materiales de alta calidad. ${suffix}, perfecto para cualquier ocasión.`,
        price: Math.floor(Math.random() * 500 + 50) + 0.99,
        category: pick(['Electrónica', 'Ropa y Calzado', 'Hogar y Muebles', 'Belleza y Cuidado Personal']),
        attributes: [
            { key: 'Marca', value: 'TOPM' },
            { key: 'Material', value: pick(['Algodón premium', 'Aleación de alta calidad', 'Plástico ABS']) },
            { key: 'Color', value: pick(['Negro clásico', 'Blanco perla', 'Gris espacial']) },
            { key: 'Dimensiones', value: pick(['S/M/L/XL', 'Talla única', '25×15×10cm']) },
            { key: 'Peso', value: pick(['150g', '280g', '450g']) },
            { key: 'Origen', value: pick(['China - Guangdong', 'China - Zhejiang']) },
            { key: 'Empaque', value: pick(['Caja de regalo', 'Caja ecológica']) },
            { key: 'Garantía', value: pick(['1 año', '2 años']) },
        ],
    };
}

// ===== 图片生成 Prompt 模板 =====

const PRODUCT_IMG_PROMPTS = [
    'Place this product on a luxurious white marble surface with subtle veining, soft golden rim lighting from the side, a gentle gradient backdrop from cream to pale gray, small decorative green leaf accent in the corner, professional e-commerce hero image, ultra high quality, 1000x1000',
    'Display this product at a 45-degree angle on a rich dark wood table, surrounded by soft bokeh warm string lights in the background, a small potted succulent nearby, moody ambient studio lighting with golden hour warmth, premium lifestyle e-commerce photography',
    'Show this product on a sleek glossy black acrylic surface with mirror reflection, dramatic backlit rim lighting in cool blue and purple tones, clean dark gradient background, futuristic high-end product photography, sharp details',
    'Place this product on a natural linen fabric textured surface, surrounded by dried flowers, eucalyptus leaves and a small candle, warm earthy color palette with terracotta and sage green accents, soft diffused natural window light, organic aesthetic product photography',
    'Present this product floating on a dreamy pastel gradient background blending from soft pink to lavender to sky blue, subtle geometric shadow patterns, light sparkle particles, airy and premium feel, modern e-commerce advertising style, high resolution',
];

const EFFECT_IMG_PROMPTS = [
    'Place this product in a stunning modern Scandinavian living room scene, light oak furniture, large window with natural sunlight streaming in, a cozy throw blanket, coffee cup and open magazine on the side table, warm inviting atmosphere, editorial lifestyle photography',
    'Place this product in a sleek professional photography studio setup, dramatic three-point lighting with colored gels (warm amber and cool blue), product elevated on a rotating display pedestal, smoke/haze effect in the background, high-end commercial advertising campaign quality',
];

// ===== 场景拼图 Prompt =====

const GRID_SCENE_PROMPTS = [
    'This product being used by a person at home in a cozy living room, lifestyle photography, warm lighting',
    'This product displayed on a modern desk workspace with a laptop and coffee, clean aesthetic',
    'Close-up detail shot of this product showing texture and craftsmanship, macro photography style',
    'This product being held in hands, showing scale and real-world use, natural daylight',
    'This product in an outdoor setting, park or street scene, casual lifestyle photography',
    'This product arranged in a flat-lay composition with complementary accessories, top-down view',
    'This product in a gift-giving scenario, beautiful wrapping, festive atmosphere',
    'This product shown in packaging or unboxing moment, clean background, excitement feeling',
    'This product being used in its primary use case scenario, action shot, dynamic angle',
    'This product on a minimalist shelf display with decorative plants, interior design aesthetic',
    'Multiple angles of this product arranged artistically, catalog style photography',
    'This product in a seasonal themed setting, cozy atmosphere with warm tones',
    'This product being compared with everyday objects for size reference, informative composition',
    'This product in a luxury retail store display environment, premium branding feel',
    'This product in a travel or commute scenario, portable and convenient use case',
    'This product in a festive celebration setting with people enjoying it, joyful mood',
];

async function generateGridImage(
    sourceImages: string[],
    gridSize: 3 | 4,
    prompts: string[],
    useNanoBanana: boolean,
    onCellReady?: (index: number, total: number) => void,
): Promise<string> {
    const totalCells = gridSize * gridSize;
    const cellImages: string[] = [];

    // Generate individual scene images
    for (let i = 0; i < totalCells; i++) {
        onCellReady?.(i + 1, totalCells);
        const prompt = prompts[i % prompts.length];

        if (useNanoBanana) {
            const aiImage = await generateImageWithNanoBanana(sourceImages, prompt);
            if (aiImage) {
                cellImages.push(aiImage);
                continue;
            }
        }
        // Fallback: use source images with varied Canvas styles
        cellImages.push(
            await generateProductImageCanvas(sourceImages, PRODUCT_STYLES[i % PRODUCT_STYLES.length], i)
        );
    }

    // Compose grid using Canvas
    const cellSize = 500;
    const gap = 4;
    const totalSize = gridSize * cellSize + (gridSize - 1) * gap;
    const canvas = document.createElement('canvas');
    canvas.width = totalSize;
    canvas.height = totalSize;
    const ctx = canvas.getContext('2d')!;

    // Dark background
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, totalSize, totalSize);

    // Draw each cell
    for (let row = 0; row < gridSize; row++) {
        for (let col = 0; col < gridSize; col++) {
            const idx = row * gridSize + col;
            if (idx >= cellImages.length) break;

            const x = col * (cellSize + gap);
            const y = row * (cellSize + gap);

            try {
                const img = await loadImage(cellImages[idx]);
                // Cover-fit the image into the cell
                const scale = Math.max(cellSize / img.width, cellSize / img.height);
                const w = img.width * scale;
                const h = img.height * scale;
                const ox = (cellSize - w) / 2;
                const oy = (cellSize - h) / 2;

                ctx.save();
                ctx.beginPath();
                ctx.roundRect(x, y, cellSize, cellSize, 6);
                ctx.clip();
                ctx.drawImage(img, x + ox, y + oy, w, h);
                ctx.restore();
            } catch {
                // If image load fails, draw a placeholder
                ctx.fillStyle = '#1a1a2e';
                ctx.fillRect(x, y, cellSize, cellSize);
            }
        }
    }

    // Add subtle watermark
    ctx.globalAlpha = 0.04;
    ctx.font = `bold ${Math.round(totalSize * 0.03)}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText('TOPM PHOTO', totalSize / 2, totalSize - 20);
    ctx.globalAlpha = 1;

    return canvas.toDataURL('image/jpeg', 0.90);
}

// ===== 主入口 =====

export async function generateProductContent(
    sourceImages: string[],
    onProgress?: (progress: number, message: string) => void
): Promise<GenerationResult> {
    const useNanoBanana = hasGeminiAccess();
    const totalSteps = 10;
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

    // Step 8: Generate grid image (3x3 九宫格)
    const gridImages: string[] = [];

    report('正在生成九宫格场景图（3×3）...');
    const grid3x3 = await generateGridImage(
        sourceImages, 3, GRID_SCENE_PROMPTS.slice(0, 9), useNanoBanana,
    );
    gridImages.push(grid3x3);

    // Step 9: Generate product info
    report('AI 正在分析产品信息...');
    let info;
    if (hasGeminiAccess()) {
        try {
            info = await generateProductInfoWithGemini(sourceImages);
        } catch (err) {
            console.warn('Gemini 产品信息生成失败，使用本地模拟:', err);
            info = generateProductInfoFallback();
        }
    } else {
        info = generateProductInfoFallback();
    }

    return { productImages, effectImages, gridImages, ...info };
}
