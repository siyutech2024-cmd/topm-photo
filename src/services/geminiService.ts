/**
 * Gemini AI 共享调用服务
 *
 * 提取自 JsonGenerator.tsx，供单产品和批量模式共享。
 * 包含：
 * - 图片分析 AI 调用
 * - 纯文本 AI 调用（类目/属性匹配）
 * - 完整的单产品处理流程
 */

import { getCategoryListForAI, loadBundledCategories, getLocalCategories, getLocalAttributes, getLocalMainAttrStatus, searchLocalCategories } from './sheinCacheService';
import { autoMatchAttributes, autoMatchSaleAttribute, autoMatchSkuSaleAttributes, buildSheinJson } from './sheinApiService';
import type { SheinAttribute } from './sheinApiService';
import { getTiktokLocalCategories, getTiktokLocalAttributes, searchTiktokCategories, getTiktokCategoryListForAI } from './tiktokCacheService';
import type { TiktokCachedCategory } from './tiktokCacheService';
import { autoMatchTiktokAttributes, autoMatchTiktokSaleAttribute, buildTiktokJson } from './tiktokApiService';
import type { ProductAttribute } from '../types';
import type { CachedCategory } from './sheinCacheService';

// ===== 配置 =====

const VITE_GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;

export function hasGeminiAccess(): boolean {
    return !!(VITE_GEMINI_API_KEY || window.location.hostname !== 'localhost');
}

// ===== 工具函数 =====

function extractBase64Data(dataUrl: string): string {
    const idx = dataUrl.indexOf(',');
    return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
}

function getMimeType(dataUrl: string): string {
    const m = dataUrl.match(/^data:([^;]+)/);
    return m ? m[1] : 'image/jpeg';
}

// ===== AI 调用 =====

export interface ProductData {
    title: string;
    description: string;
    price: number;
    category: string;
    attributes: ProductAttribute[];
    shein_category_id?: number;
    shein_product_type_id?: number;
    tiktok_category_id?: string;
}

/**
 * 调用 Gemini 分析产品图片，返回结构化产品数据
 */
export async function callGeminiForProductInfo(
    images: string[],
    sheinCategoryBlock: string,
    tiktokCategoryBlock: string
): Promise<ProductData> {
    const tiktokField = tiktokCategoryBlock ? '\n  "tiktok_category_id": "string (ID de la categoría TikTok de la lista proporcionada, o \\"\\" si no hay coincidencia)",' : '';
    const contents: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
        {
            text: `Eres un experto profesional en operaciones de productos de e-commerce. Observa cuidadosamente estas imágenes del producto y genera la información completa del producto en ESPAÑOL.

Devuelve ESTRICTAMENTE en el siguiente formato JSON, sin ningún otro texto ni marcas markdown:

{
  "title": "Título del producto (10-20 palabras, incluir puntos de venta clave y palabras clave)",
  "description": "Descripción detallada del producto (80-150 palabras, incluir características, materiales, escenarios de uso, ventajas, etc.)",
  "price": número (precio de mercado razonable en USD, sin símbolo de moneda),
  "category": "Categoría del producto (elegir de: Electrónica, Ropa y Calzado, Hogar y Muebles, Belleza y Cuidado Personal, Alimentos y Bebidas, Deportes y Aire Libre, Bebés y Juguetes, Libros y Papelería, Joyería y Accesorios, Automotriz, Otros)",${sheinCategoryBlock ? '\n  "shein_category_id": número (de la lista de categorías SHEIN proporcionada),\n  "shein_product_type_id": número (de la lista de categorías SHEIN proporcionada),' : ''}${tiktokField}
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
4. Los atributos deben ser lo más precisos posible, basados en el contenido de las imágenes${sheinCategoryBlock}${tiktokCategoryBlock}`,
        },
    ];

    for (let i = 0; i < Math.min(4, images.length); i++) {
        contents.push({
            inlineData: {
                mimeType: getMimeType(images[i]),
                data: extractBase64Data(images[i]),
            },
        });
    }

    let response;
    if (VITE_GEMINI_API_KEY) {
        const r = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${VITE_GEMINI_API_KEY}`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: contents }] }) }
        );
        response = await r.json();
    } else {
        const r = await fetch('/api/gemini', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'gemini-2.0-flash', contents }),
        });
        response = await r.json();
    }

    const text = response.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text)
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
        shein_category_id: parsed.shein_category_id || undefined,
        shein_product_type_id: parsed.shein_product_type_id || undefined,
    };
}

/**
 * 纯文本 Gemini 调用（不发图片），用于类目/属性精确匹配
 */
export async function callGeminiTextOnly(prompt: string): Promise<Record<string, unknown>> {
    const contents = [{ text: prompt }];

    let response;
    if (VITE_GEMINI_API_KEY) {
        const r = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${VITE_GEMINI_API_KEY}`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: contents }] }) }
        );
        response = await r.json();
    } else {
        const r = await fetch('/api/gemini', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'gemini-2.0-flash', contents }),
        });
        response = await r.json();
    }

    const text = response.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text)
        .filter(Boolean)
        .join('') || '';

    let jsonStr = text;
    const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) jsonStr = jsonMatch[1];
    const objMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objMatch) jsonStr = objMatch[0];

    return JSON.parse(jsonStr);
}

/**
 * 用产品名称 + 描述（无图片）调用 Gemini 生成产品属性
 */
export async function callGeminiForProductByText(
    productName: string,
    productDescription?: string
): Promise<ProductData> {
    const prompt = `Eres un experto profesional en operaciones de productos de e-commerce. Basándote SOLAMENTE en la siguiente información textual del producto, genera la información completa en ESPAÑOL.

Nombre del producto: "${productName}"
${productDescription ? `Descripción adicional: "${productDescription}"` : ''}

Devuelve ESTRICTAMENTE en el siguiente formato JSON, sin ningún otro texto ni marcas markdown:

{
  "title": "Título del producto optimizado (10-20 palabras, incluir puntos de venta clave y palabras clave)",
  "description": "Descripción detallada del producto (80-150 palabras, incluir características, materiales, escenarios de uso, ventajas, etc.)",
  "price": número (precio de mercado razonable en USD, sin símbolo de moneda),
  "category": "Categoría del producto (elegir de: Electrónica, Ropa y Calzado, Hogar y Muebles, Belleza y Cuidado Personal, Alimentos y Bebidas, Deportes y Aire Libre, Bebés y Juguetes, Libros y Papelería, Joyería y Accesorios, Automotriz, Otros)",
  "attributes": [
    {"key": "Marca", "value": "marca estimada"},
    {"key": "Material", "value": "material del producto"},
    {"key": "Color", "value": "color del producto"},
    {"key": "Dimensiones", "value": "tamaño estimado"},
    {"key": "Peso", "value": "peso estimado"},
    {"key": "Origen", "value": "país de origen estimado"},
    {"key": "Empaque", "value": "tipo de empaque"},
    {"key": "Garantía", "value": "período de garantía"}
  ]
}`;

    const result = await callGeminiTextOnly(prompt);
    return {
        title: (result.title as string) || productName,
        description: (result.description as string) || '',
        price: typeof result.price === 'number' ? result.price : parseFloat(String(result.price)) || 99.9,
        category: (result.category as string) || 'Otros',
        attributes: Array.isArray(result.attributes) ? (result.attributes as ProductAttribute[]) : [],
    };
}

// ===== 完整单产品处理流程 =====

export interface ProcessProductResult {
    productData: ProductData;
    // SHEIN
    sheinCategory: CachedCategory | null;
    sheinMatchedAttrs: { attribute_id: number; attribute_value_id: number; attribute_extra_value?: string; _display_name?: string; _display_value?: string }[];
    sheinAllAttrs: SheinAttribute[];
    sheinSaleAttr: { attribute_id: number; attribute_value_id: number; custom_attribute_value?: string; _display_name?: string; _display_value?: string } | null;
    sheinSkuSaleAttrs: { attribute_id: number; attribute_value_id: number; _display_name?: string; _display_value?: string }[];
    sheinMainAttrStatus?: number;  // 主规格状态: 3=禁用
    // TikTok
    tiktokCategory: TiktokCachedCategory | null;
    tiktokMatchedAttrs: { attribute_id: string; value_id: string; value_name: string; _display_name: string; _display_value: string }[];
    tiktokSaleAttr: { attribute_id: string; value_id: string; custom_value?: string; _display_name: string; _display_value: string } | null;
}

/**
 * 完整处理单个产品：AI 分析 → SHEIN 类目/属性匹配 → TikTok 类目/属性匹配
 *
 * images: 产品图片 base64 数组（如有）
 * productName: 产品名称（用于无图片时的 AI 文本分析）
 * onProgress: 进度回调
 */
export async function processProduct(
    images: string[],
    productName?: string,
    onProgress?: (msg: string) => void
): Promise<ProcessProductResult> {
    const result: ProcessProductResult = {
        productData: { title: '', description: '', price: 0, category: '', attributes: [] },
        sheinCategory: null,
        sheinMatchedAttrs: [],
        sheinAllAttrs: [],
        sheinSaleAttr: null,
        sheinSkuSaleAttrs: [],
        tiktokCategory: null,
        tiktokMatchedAttrs: [],
        tiktokSaleAttr: null,
        sheinMainAttrStatus: undefined,
    };

    // === 步骤 1：AI 分析产品 ===
    let data: ProductData;
    if (images.length > 0) {
        onProgress?.('正在加载类目数据...');
        let sheinBlock = '';
        try {
            const catList = await getCategoryListForAI();
            if (catList) {
                sheinBlock = `\n\nAdemás, tienes acceso a las siguientes categorías reales de SHEIN. IMPORTANTE: Estas categorías SOLO cubren 3 verticales: "Home & Living", "Pet Supplies" y "Toys & Games". NO incluyen moda, ropa, bolsos ni accesorios de moda.

Formato: categoryId|productTypeId|ruta
---SHEIN_CATEGORIES_START---
${catList}
---SHEIN_CATEGORIES_END---

REGLAS ESTRICTAS para elegir la categoría:
1. Debes elegir la categoría cuya ruta sea DIRECTAMENTE relevante al producto
2. Si el producto NO pertenece a ninguna de estas 3 verticales (Home & Living, Pet Supplies, Toys & Games), DEBES poner 0 en ambos campos
3. PROHIBIDO forzar una categoría no relacionada (ej: NO clasificar un bolso de moda como "Pet Supplies")
4. Solo clasifica si estás 90%+ seguro de que la categoría es correcta

Devuelve:
  "shein_category_id": número (categoryId de la lista, o 0 si no hay coincidencia),
  "shein_product_type_id": número (productTypeId de la lista, o 0 si no hay coincidencia),`;
            }
        } catch { /* no cache */ }

        onProgress?.('🤖 AI 正在分析产品图片...');
        data = await callGeminiForProductInfo(images, sheinBlock, '');
    } else if (productName) {
        onProgress?.('🤖 AI 正在根据产品名称生成数据...');
        data = await callGeminiForProductByText(productName);
    } else {
        throw new Error('需要提供产品图片或产品名称');
    }

    result.productData = data;

    // === 步骤 2：SHEIN 类目匹配 ===
    onProgress?.('匹配 SHEIN 类目和属性...');
    let cats = await getLocalCategories();
    let foundCategory: CachedCategory | null = null;

    if (cats.length === 0) {
        onProgress?.('📦 首次使用，正在加载 SHEIN 类目数据...');
        await loadBundledCategories((msg) => onProgress?.(msg));
        cats = await getLocalCategories();
    }

    if (cats.length > 0 && data.shein_category_id) {
        const matched = cats.find(c => c.categoryId === data.shein_category_id);
        if (matched) {
            foundCategory = matched;
            result.sheinCategory = matched;
            const attrs = await getLocalAttributes(matched.productTypeId);
            const mainAttrStatus = await getLocalMainAttrStatus(matched.productTypeId);
            if (mainAttrStatus !== undefined) result.sheinMainAttrStatus = mainAttrStatus;
            if (attrs.length > 0) {
                result.sheinAllAttrs = attrs;
                result.sheinMatchedAttrs = autoMatchAttributes(data.attributes, attrs);
                const saleMatch = autoMatchSaleAttribute(data.attributes, attrs);
                if (saleMatch) result.sheinSaleAttr = saleMatch;
                result.sheinSkuSaleAttrs = autoMatchSkuSaleAttributes(data.attributes, [], attrs);
            }
        }
    }

    // Fallback
    if (!foundCategory && cats.length > 0) {
        const searched = searchLocalCategories(cats, `${data.title} ${data.category}`);
        if (searched.length > 0) {
            foundCategory = searched[0];
            result.sheinCategory = searched[0];
            const attrs = await getLocalAttributes(searched[0].productTypeId);
            const mainAttrStatus = await getLocalMainAttrStatus(searched[0].productTypeId);
            if (mainAttrStatus !== undefined) result.sheinMainAttrStatus = mainAttrStatus;
            if (attrs.length > 0) {
                result.sheinAllAttrs = attrs;
                result.sheinMatchedAttrs = autoMatchAttributes(data.attributes, attrs);
                const saleMatch = autoMatchSaleAttribute(data.attributes, attrs);
                if (saleMatch) result.sheinSaleAttr = saleMatch;
                result.sheinSkuSaleAttrs = autoMatchSkuSaleAttributes(data.attributes, [], attrs);
            }
        }
    }

    // === 步骤 3：TikTok 类目精确匹配 ===
    onProgress?.('🎵 TikTok 类目精确匹配中...');
    try {
        const tikCatList = await getTiktokCategoryListForAI();
        const tikCats = await getTiktokLocalCategories();

        if (tikCatList && tikCats.length > 0) {
            const catMatchResult = await callGeminiTextOnly(
                `Eres un clasificador experto de productos de e-commerce para TikTok Shop.

Información del producto:
- Título: "${data.title}"
- Descripción: "${data.description}"
- Categoría general: ${data.category}
- Atributos: ${data.attributes.map(a => `${a.key}=${a.value}`).join(', ')}

A continuación tienes la lista COMPLETA de categorías de TikTok Shop.
Formato: categoryId|ruta completa de la categoría

---TIKTOK_CATEGORIES---
${tikCatList}
---END---

Tu tarea: Elige la categoría MÁS ESPECÍFICA y PRECISA que corresponda al producto.

REGLAS:
1. Lee TODA la lista de categorías antes de elegir
2. La categoría debe describir EXACTAMENTE el tipo de producto (no una categoría cercana o similar)
3. Elige siempre la categoría de nivel más profundo (hoja) que sea apropiada
4. La ruta completa debe tener sentido semántico para el producto
5. NO confundas categorías similares (ej: "Perfume" vs "Cuidado de la piel", "Herramientas" vs "Electrodomésticos")

Devuelve ESTRICTAMENTE en formato JSON:
{"tiktok_category_id": "el ID de la categoría elegida", "reason": "breve razón de la elección"}`
            );

            let tikCat: TiktokCachedCategory | undefined;
            const selectedId = String(catMatchResult.tiktok_category_id || '');
            console.log(`TikTok AI 类目选择: ${selectedId}`, catMatchResult.reason);

            if (selectedId) {
                tikCat = tikCats.find(c => c.catId === selectedId);
            }

            if (!tikCat) {
                const tikSearched = searchTiktokCategories(tikCats, `${data.title} ${data.category}`);
                if (tikSearched.length > 0) tikCat = tikSearched[0];
            }

            if (tikCat) {
                result.tiktokCategory = tikCat;

                // AI 精确匹配属性
                const tikAttrs = await getTiktokLocalAttributes(tikCat.catId);
                if (tikAttrs.length > 0) {
                    onProgress?.('🎵 AI 精确匹配 TikTok 属性...');

                    const attrTemplateText = tikAttrs
                        .filter(a => a.type !== 0 && a.type !== '0' && a.vals && a.vals.length > 0)
                        .map(a => `attrId=${a.id}|name=${a.name}|required=${a.req}|values=[${a.vals.map(v => `${v.id}:${v.name}`).join(',')}]`)
                        .join('\n');

                    if (attrTemplateText) {
                        try {
                            const attrMatchResult = await callGeminiTextOnly(
                                `Eres un experto en matching de atributos de productos para TikTok Shop.

Producto:
- Título: "${data.title}"
- Descripción: "${data.description}"
- Atributos del producto: ${data.attributes.map(a => `${a.key}="${a.value}"`).join(', ')}

Plantilla de atributos de la categoría TikTok (CADA línea es un atributo con sus valores predefinidos):
${attrTemplateText}

Tu tarea: Para CADA atributo de la plantilla, busca el valor predefinido que MEJOR corresponda a los atributos del producto.

REGLAS:
1. El value_id y value_name DEBEN existir en la lista de valores predefinidos del atributo
2. Para atributos obligatorios (required=true), SIEMPRE elige un valor aunque no sea perfecto
3. Para atributos opcionales, solo incluye si hay una coincidencia clara
4. NO inventes valores que no estén en la lista predefinida
5. Haz matching SEMÁNTICO: "Claro (beige/transparente)" puede coincidir con "Beige" o "Transparente"

Devuelve en formato JSON:
{"matched_attributes": [{"attribute_id": "...", "value_id": "...", "value_name": "...", "attr_name": "..."}]}`
                            );

                            const aiMatchedAttrs = Array.isArray(attrMatchResult.matched_attributes)
                                ? (attrMatchResult.matched_attributes as Array<{ attribute_id: string; value_id: string; value_name: string; attr_name: string }>)
                                : [];

                            const validAttrs = aiMatchedAttrs.filter(ma => {
                                const templateAttr = tikAttrs.find(ta => ta.id === ma.attribute_id);
                                if (!templateAttr) return false;
                                return templateAttr.vals.some(v => v.id === ma.value_id);
                            }).map(ma => {
                                const templateAttr = tikAttrs.find(ta => ta.id === ma.attribute_id)!;
                                return {
                                    attribute_id: ma.attribute_id,
                                    value_id: ma.value_id,
                                    value_name: ma.value_name,
                                    _display_name: templateAttr.name,
                                    _display_value: ma.value_name,
                                };
                            });

                            if (validAttrs.length > 0) {
                                result.tiktokMatchedAttrs = validAttrs;
                            } else {
                                result.tiktokMatchedAttrs = autoMatchTiktokAttributes(data.attributes, tikAttrs);
                            }
                        } catch {
                            result.tiktokMatchedAttrs = autoMatchTiktokAttributes(data.attributes, tikAttrs);
                        }
                    } else {
                        result.tiktokMatchedAttrs = autoMatchTiktokAttributes(data.attributes, tikAttrs);
                    }

                    const tikSale = autoMatchTiktokSaleAttribute(data.attributes, tikAttrs);
                    if (tikSale) result.tiktokSaleAttr = tikSale;
                }
            }
        }
    } catch (e) {
        console.warn('TikTok 类目匹配失败:', e);
    }

    onProgress?.('✅ 分析完成');
    return result;
}

// ===== JSON 构建快捷方法 =====

export function buildSheinJsonFromResult(
    result: ProcessProductResult,
    skuCode: string,
    editPrice: number,
    editStock: number,
    images: string[]
): Record<string, unknown> | null {
    if (!result.sheinCategory) return null;

    const product = {
        title: result.productData.title,
        description: result.productData.description,
        price: editPrice || result.productData.price,
        currency: 'USD',
        category: result.productData.category,
        attributes: result.productData.attributes,
        original_images: images,
        product_images: images,
        effect_images: [] as string[],
        grid_images: [] as string[],
        status: 'generated' as const,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        variants: [{
            color: result.productData.attributes.find(a => a.key.toLowerCase().includes('color'))?.value || 'Por defecto',
            size: 'Talla única',
            sku_code: skuCode,
            price: editPrice || result.productData.price,
            stock: editStock,
            weight_g: 200,
        }],
    };

    const json = buildSheinJson(product, {
        categoryId: result.sheinCategory.categoryId,
        productTypeId: result.sheinCategory.productTypeId,
        imageUrls: images,
        matchedAttributes: result.sheinMatchedAttrs,
        allAttributes: result.sheinAllAttrs,
        saleAttribute: result.sheinSaleAttr || undefined,
        skuSaleAttributes: result.sheinSkuSaleAttrs.length > 0 ? result.sheinSkuSaleAttrs : undefined,
        mainAttrStatus: result.sheinMainAttrStatus,
    });

    return json as unknown as Record<string, unknown>;
}

export function buildTiktokJsonFromResult(
    result: ProcessProductResult,
    skuCode: string,
    editPrice: number,
    editStock: number
): Record<string, unknown> | null {
    if (!result.tiktokCategory) return null;

    const json = buildTiktokJson(
        {
            title: result.productData.title,
            description: result.productData.description,
            price: editPrice || result.productData.price,
            attributes: result.productData.attributes,
        },
        skuCode,
        editStock,
        {
            catId: result.tiktokCategory.catId,
            matchedAttributes: result.tiktokMatchedAttrs,
            saleAttribute: result.tiktokSaleAttr || undefined,
        }
    );

    return json as unknown as Record<string, unknown>;
}
