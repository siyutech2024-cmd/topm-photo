/**
 * TikTok Shop 产品 JSON 构建服务
 * 
 * 功能:
 * - 构建 TikTok Shop 上架 JSON（对齐 TikTok Shop API 实际格式）
 * - 自动匹配产品属性到 TikTok 属性模板
 */

import type { TiktokAttribute } from './tiktokCacheService';

// ===== 类型定义（对齐 TikTok Shop 实际 API 格式） =====

export interface TiktokPublishJson {
    title: string;
    description: string;
    category_id: string;
    brand_id?: string;
    is_cod_allowed: boolean;
    is_not_for_sale: boolean;
    is_pre_owned: boolean;
    listing_platforms: string[];
    save_mode: string;
    shipping_insurance_requirement: string;
    product_attributes?: {
        id: string;
        values: {
            id?: string;
            name: string;
        }[];
    }[];
    skus: {
        price: {
            amount: string;
            currency: string;
        };
        inventory: {
            warehouse_id?: string;
            quantity: number;
        }[];
        seller_sku: string;
        identifier_code?: {
            type: string;
            code: string;
        };
        sales_attributes?: {
            id: string;
            value_id?: string;
            custom_value?: string;
        }[];
    }[];
    package_weight?: {
        value: string;
        unit: string;
    };
    package_dimensions?: {
        height: string;
        length: string;
        width: string;
        unit: string;
    };
}

// ===== 属性自动匹配 =====

/** 颜色常见别名映射 */
const COLOR_ALIASES: Record<string, string[]> = {
    'black': ['negro', 'noir', '黑', '黑色'],
    'white': ['blanco', 'blanc', '白', '白色'],
    'red': ['rojo', 'rouge', '红', '红色'],
    'blue': ['azul', 'bleu', '蓝', '蓝色'],
    'green': ['verde', 'vert', '绿', '绿色'],
    'yellow': ['amarillo', 'jaune', '黄', '黄色'],
    'pink': ['rosa', 'rose', '粉', '粉色'],
    'purple': ['morado', 'violet', '紫', '紫色'],
    'orange': ['naranja', '橙', '橙色'],
    'brown': ['marrón', 'marron', 'café', '棕', '棕色'],
    'gray': ['gris', 'grey', '灰', '灰色'],
    'beige': ['beige', '米', '米色'],
    'multicolor': ['multicolor', '多色', '彩色'],
};

/**
 * 自动匹配产品属性到 TikTok 属性模板
 * 返回匹配到的属性列表（包含 _display 字段用于 UI 显示）
 */
export function autoMatchTiktokAttributes(
    productAttrs: { key: string; value: string }[],
    templateAttrs: TiktokAttribute[]
): {
    attribute_id: string;
    value_id: string;
    value_name: string;
    _display_name: string;
    _display_value: string;
}[] {
    const matched: {
        attribute_id: string;
        value_id: string;
        value_name: string;
        _display_name: string;
        _display_value: string;
    }[] = [];
    const matchedIds = new Set<string>();

    // 关键词映射
    const keywordMap: Record<string, string[]> = {
        'material': ['material', 'composición', 'composition'],
        'color': ['color', 'colour'],
        'estilo': ['estilo', 'style'],
        'forma': ['forma', 'shape'],
        'peso': ['peso', 'weight'],
        'uso': ['uso', 'use', 'usage'],
        'característica': ['característica', 'feature'],
        'lugar': ['lugar', 'place', 'ubicación'],
        'cantidad': ['cantidad', 'quantity', 'cantidad por paquete'],
    };

    for (const tAttr of templateAttrs) {
        // 跳过销售属性（type === 0 通常是颜色/尺码）
        if (tAttr.type === 0 || tAttr.type === '0') continue;
        if (!tAttr.vals || tAttr.vals.length === 0) continue;

        // 查找产品中名称相似的属性
        const pAttr = productAttrs.find(p => {
            const pk = p.key.toLowerCase();
            const tk = tAttr.name.toLowerCase();
            // 直接名称匹配
            if (pk === tk || pk.includes(tk) || tk.includes(pk)) return true;
            // 关键词映射
            for (const [, aliases] of Object.entries(keywordMap)) {
                const pkMatch = aliases.some(a => pk.includes(a));
                const tkMatch = aliases.some(a => tk.includes(a));
                if (pkMatch && tkMatch) return true;
            }
            return false;
        });

        if (pAttr) {
            // 尝试匹配属性值
            const normalizedValue = pAttr.value.toLowerCase().trim();
            let matchedValue = tAttr.vals.find(v =>
                v.name.toLowerCase() === normalizedValue
            );

            if (!matchedValue) {
                matchedValue = tAttr.vals.find(v =>
                    v.name.toLowerCase().includes(normalizedValue) ||
                    normalizedValue.includes(v.name.toLowerCase())
                );
            }

            // 别名匹配（用于颜色等）
            if (!matchedValue) {
                for (const [stdName, aliases] of Object.entries(COLOR_ALIASES)) {
                    const isMatch = normalizedValue === stdName ||
                        aliases.some(a => normalizedValue.includes(a));
                    if (isMatch) {
                        matchedValue = tAttr.vals.find(v => {
                            const vLower = v.name.toLowerCase();
                            return vLower === stdName ||
                                vLower.includes(stdName) ||
                                aliases.some(a => vLower.includes(a));
                        });
                        if (matchedValue) break;
                    }
                }
            }

            if (matchedValue) {
                matched.push({
                    attribute_id: tAttr.id,
                    value_id: matchedValue.id,
                    value_name: matchedValue.name,
                    _display_name: tAttr.name,
                    _display_value: matchedValue.name,
                });
                matchedIds.add(tAttr.id);
            }
        }
    }

    // 补齐必填属性
    for (const tAttr of templateAttrs) {
        if (tAttr.type === 0 || tAttr.type === '0') continue;
        if (matchedIds.has(tAttr.id)) continue;
        if (!tAttr.req) continue;

        // 有候选值 → 选第一个
        if (tAttr.vals && tAttr.vals.length > 0) {
            const fallback = tAttr.vals[0];
            matched.push({
                attribute_id: tAttr.id,
                value_id: fallback.id,
                value_name: fallback.name,
                _display_name: tAttr.name,
                _display_value: `${fallback.name} (自动)`,
            });
            matchedIds.add(tAttr.id);
        } else {
            // 无候选值 → 需要自定义文本输入
            // 智能默认值（MX 墨西哥 TikTok 站常用必填字段）
            const customDefaults: Record<string, string> = {
                '102268': 'Proveedor General',           // Nombre de Fabricante Nacional/Importador
                '102269': 'Ciudad de México, México',    // Dirección de Fabricante Nacional/Importador
                '102270': '5V/1A/50-60Hz',               // Consumo de energía (voltios/vatios/hercios)
            };
            const customValue = customDefaults[tAttr.id] || 'N/A';
            matched.push({
                attribute_id: tAttr.id,
                value_id: '',
                value_name: customValue,
                _display_name: tAttr.name,
                _display_value: `${customValue} (自定义)`,
            });
            matchedIds.add(tAttr.id);
        }
    }

    return matched;
}

/**
 * 自动匹配销售属性（颜色）
 */
export function autoMatchTiktokSaleAttribute(
    productAttrs: { key: string; value: string }[],
    templateAttrs: TiktokAttribute[]
): { attribute_id: string; value_id: string; custom_value?: string; _display_name: string; _display_value: string } | null {
    // 找销售属性（type === 0）
    const saleAttr = templateAttrs.find(a => a.type === 0 || a.type === '0');
    if (!saleAttr) return null;

    // 颜色属性不需要预定义值，TikTok允许自定义
    const colorAttr = productAttrs.find(p =>
        /^(color|颜色|colour)$/i.test(p.key)
    );
    const colorValue = colorAttr?.value || 'Por defecto';

    return {
        attribute_id: saleAttr.id,
        value_id: '',
        custom_value: colorValue,
        _display_name: saleAttr.name,
        _display_value: colorValue,
    };
}

// ===== 构建 TikTok JSON =====

export interface BuildTiktokJsonOptions {
    catId: string;
    matchedAttributes: {
        attribute_id: string;
        value_id: string;
        value_name: string;
    }[];
    saleAttribute?: {
        attribute_id: string;
        value_id: string;
        custom_value?: string;
    };
}

export function buildTiktokJson(
    product: {
        title: string;
        description: string;
        price: number;
        attributes: { key: string; value: string }[];
    },
    skuCode: string,
    stock: number,
    options: BuildTiktokJsonOptions
): TiktokPublishJson {
    // 产品属性 → 对齐 TikTok 格式
    // 有 value_id → {id, values: [{id, name}]}
    // 无 value_id (自定义文本) → {id, values: [{name}]}  (不传 id 字段)
    const productAttributes: TiktokPublishJson['product_attributes'] = options.matchedAttributes.map(a => ({
        id: a.attribute_id,
        values: [a.value_id
            ? { id: a.value_id, name: a.value_name }
            : { name: a.value_name }  // 自定义文本：只传 name
        ],
    }));

    // SKU 销售属性
    const salesAttributes = options.saleAttribute ? [{
        id: options.saleAttribute.attribute_id,
        ...(options.saleAttribute.value_id
            ? { value_id: options.saleAttribute.value_id }
            : { custom_value: options.saleAttribute.custom_value || 'Por defecto' }),
    }] : undefined;

    // 估算重量（转为 KG）
    const weightAttr = product.attributes.find(a =>
        /peso|weight|重量/i.test(a.key)
    );
    const weightGrams = parseInt(weightAttr?.value?.match(/(\d+)/)?.[1] || '300');
    const weightKg = (weightGrams / 1000).toFixed(1);

    return {
        title: product.title,
        description: product.description,
        category_id: options.catId,
        is_cod_allowed: false,
        is_not_for_sale: false,
        is_pre_owned: false,
        listing_platforms: ['TIKTOK_SHOP'],
        save_mode: 'LISTING',
        shipping_insurance_requirement: 'REQUIRED',
        product_attributes: productAttributes.length > 0 ? productAttributes : undefined,
        skus: [{
            price: {
                amount: product.price.toFixed(2),
                currency: 'MXN',
            },
            inventory: [{
                quantity: stock,
            }],
            seller_sku: skuCode,
            identifier_code: {
                type: 'GTIN',
                code: '',
            },
            sales_attributes: salesAttributes,
        }],
        package_weight: {
            value: weightKg,
            unit: 'KILOGRAM',
        },
        package_dimensions: {
            height: '25',
            length: '25',
            width: '15',
            unit: 'CENTIMETER',
        },
    };
}
