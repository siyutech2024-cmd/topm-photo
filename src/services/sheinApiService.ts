/**
 * SHEIN API 前端服务 — 通过 /api/shein 代理调用 SHEIN Open Platform
 * 
 * 功能:
 * - 获取类目树（级联选择）
 * - 获取属性模板（根据 product_type_id）
 * - 转换图片链接（外部 URL → SHEIN 内部链接）
 * - 构建完整上架 JSON 并下载
 */

import type { Product } from '../types';

// ===== 类型定义 =====

export interface SheinCategory {
    category_id: number;
    category_name: string;
    parent_category_id: number;
    last_category: boolean;
    product_type_id?: number;
    children?: SheinCategory[];
}

export interface SheinAttribute {
    attribute_id: number;
    attribute_name: string;
    attribute_type: number; // 1=销售, 2=尺寸, 3=成分, 4=普通
    attribute_label: number; // 1=SKC主销售属性(如颜色), 0=其他
    attribute_mode: number;  // 0=手动输入, 1=下拉单选, 3=下拉多选, 4=手动+下拉
    is_required: boolean;
    values?: { value_id: number; value_name: string }[];
}

// ===== 与成功上架 JSON 完全一致的类型定义 =====

export interface SheinPublishJson {
    brand_code: string;
    category_id: number;
    product_type_id: number;
    source_system: string;                 // "openapi" (小写)
    suit_flag: number;                     // 0 (数字,不是字符串)
    supplier_code: string;                 // 顶层 SPU 代码
    multi_language_name_list: { language: string; name: string }[];
    multi_language_desc_list: { language: string; name: string }[];
    product_attribute_list: {
        attribute_id: string;              // 字符串!
        attribute_value_id?: string;       // 字符串!
        attribute_extra_value?: string;
    }[];
    site_list: {
        main_site: string;
        sub_site_list: string[];
    }[];
    skc_list: {
        sale_attribute: {
            attribute_id: string;
            attribute_value_id: number;
            custom_attribute_value?: string;
        };
        sku_list: {
            supplier_sku: string;
            mall_state: number;
            weight: number;
            length: number;                // 数字!
            width: number;                 // 数字!
            height: number;                // 数字!
            stop_purchase: number;
            cost_info: {
                cost_price: string;
                currency: string;
            };
            stock_info_list: {
                inventory_num: string;     // 字符串!
            }[];
            sale_attribute_list: {
                attribute_id: string;
                attribute_value_id: string;
            }[];
        }[];
        shelf_require: string;
        shelf_way: string;
    }[];
}

// ===== API 调用 =====

const API_BASE = '/api/shein';

async function callSheinApi<T = unknown>(action: string, body: Record<string, unknown> = {}): Promise<T> {
    const res = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, body }),
    });

    const json = await res.json();

    if (!res.ok || !json.success) {
        throw new Error(json.error || json.details?.msg || `SHEIN API error: ${action}`);
    }

    // SHEIN API 嵌套结构: { success, data: { code, info: { data: [...] } } }
    return json.data as T;
}

// ===== 类目 =====

let _categoryCache: SheinCategory[] | null = null;

export async function fetchCategories(): Promise<SheinCategory[]> {
    if (_categoryCache) return _categoryCache;

    const data = await callSheinApi<{ info: { data: SheinCategory[]; category_list?: SheinCategory[] } }>('categories');
    // API 返回 info.data (实际) 或 info.category_list (文档)
    _categoryCache = data.info?.data || data.info?.category_list || [];
    return _categoryCache;
}

/** 将树形类目展平为路径列表（仅末级），方便 UI 选择 */
export function flattenCategories(categories: SheinCategory[], path: string[] = []): { label: string; categoryId: number; productTypeId: number }[] {
    const result: { label: string; categoryId: number; productTypeId: number }[] = [];

    for (const cat of categories) {
        const currentPath = [...path, cat.category_name];
        if (cat.last_category && cat.product_type_id) {
            result.push({
                label: currentPath.join(' → '),
                categoryId: cat.category_id,
                productTypeId: cat.product_type_id,
            });
        }
        if (cat.children && cat.children.length > 0) {
            result.push(...flattenCategories(cat.children, currentPath));
        }
    }

    return result;
}

// ===== 属性模板 =====

const _attrCache: Record<number, SheinAttribute[]> = {};

export async function fetchAttributes(productTypeId: number): Promise<SheinAttribute[]> {
    if (_attrCache[productTypeId]) return _attrCache[productTypeId];

    // API 需要 product_type_id_list 数组格式
    const data = await callSheinApi<{
        info: {
            data: Array<{
                product_type_id: number; attribute_infos: Array<{
                    attribute_id: number;
                    attribute_name: string;
                    attribute_name_en?: string;
                    attribute_type: number;
                    attribute_is_show: number;
                    attribute_label?: number;
                    attribute_mode?: number;
                    attribute_value_info_list?: Array<{ attribute_value_id: number; attribute_value: string; attribute_value_en?: string }>;
                }>
            }>
        }
    }>('attributes', {
        product_type_id_list: [productTypeId],
    });

    // 从 info.data[0].attribute_infos 提取并转换为统一格式
    const rawInfos = data.info?.data?.[0]?.attribute_infos || [];
    const attrs: SheinAttribute[] = rawInfos.map(a => ({
        attribute_id: a.attribute_id,
        attribute_name: a.attribute_name_en || a.attribute_name,
        attribute_type: a.attribute_type,
        attribute_label: a.attribute_label ?? 0,   // 1=SKC主属性(颜色)
        attribute_mode: a.attribute_mode ?? 1,
        is_required: a.attribute_is_show === 1,
        values: (a.attribute_value_info_list || []).map(v => ({
            value_id: v.attribute_value_id,
            value_name: v.attribute_value_en || v.attribute_value,
        })),
    }));

    _attrCache[productTypeId] = attrs;
    return attrs;
}

// ===== 图片转换 =====

export async function transformImageUrl(imageUrl: string): Promise<string> {
    const data = await callSheinApi<{ info: { image_url: string } }>('transform-pic', {
        image_url: imageUrl,
    });
    return data.info?.image_url || imageUrl;
}

export async function transformImageUrls(urls: string[]): Promise<string[]> {
    // 逐个转换（SHEIN API 可能不支持批量）
    const results: string[] = [];
    for (const url of urls) {
        try {
            const converted = await transformImageUrl(url);
            results.push(converted);
        } catch {
            // 转换失败保留原始 URL
            results.push(url);
        }
    }
    return results;
}

// ===== 构建完整 JSON =====

function getAttr(product: Product, key: string): string {
    return product.attributes.find(a => a.key === key)?.value || '';
}

function estimateWeight(product: Product): number {
    if (product.weight_g) return product.weight_g;
    const w = getAttr(product, 'Peso') || getAttr(product, '重量');
    const m = w.match(/(\d+)/);
    return m ? parseInt(m[1]) : 300;
}

function estimateDims(product: Product) {
    if (product.package_length_cm && product.package_width_cm && product.package_height_cm) {
        return { l: product.package_length_cm, w: product.package_width_cm, h: product.package_height_cm };
    }
    return { l: 25, w: 15, h: 10 };
}

export interface BuildJsonOptions {
    categoryId: number;
    productTypeId: number;
    imageUrls: string[];           // 运营确认后的图片 URL 列表（需转换为 SHEIN 内部链接）
    matchedAttributes: {
        attribute_id: number;
        attribute_value_id: number;
        attribute_extra_value?: string;
    }[];
    saleAttribute?: {              // SKC 级主销售属性（如颜色）— 可自动匹配
        attribute_id: number;
        attribute_value_id: number;
        custom_attribute_value?: string;
    };
    skuSaleAttributes?: {          // SKU 级销售属性（如尺码）— 可自动匹配
        attribute_id: number;
        attribute_value_id: number;
    }[];
    allAttributes?: SheinAttribute[]; // 全量属性模板（用于自动匹配销售属性）
    subSite?: string;              // 售卖站点，默认墨西哥 rwmmx
    mainSite?: string;             // 主站点，默认 shein
    warehouseId?: string;          // 供应商仓库 ID
    costPrice?: string;            // 进货成本价
    costCurrency?: string;         // 成本货币
}

export function buildSheinJson(product: Product, options: BuildJsonOptions): SheinPublishJson {
    const weight = estimateWeight(product);
    const dims = estimateDims(product);
    const subSite = options.subSite || 'shein-mx';     // 墨西哥站点（不是 rwmmx）
    const mainSite = options.mainSite || 'shein';
    const costPrice = options.costPrice || String(product.price.toFixed(2));  // 成本 = 售价
    const costCurrency = options.costCurrency || 'MXN';

    const variants = product.variants && product.variants.length > 0
        ? product.variants
        : [{
            color: getAttr(product, 'Color') || 'Por defecto',
            size: 'Talla única',
            sku_code: `TOPM-${product.id?.slice(0, 8) || 'DRAFT'}`,
            price: product.price,
            stock: 100,
            weight_g: weight,
        }];

    // ---------- 自动匹配销售属性 ----------
    let resolvedSaleAttribute = options.saleAttribute;
    if (!resolvedSaleAttribute && options.allAttributes) {
        const matched = autoMatchSaleAttribute(
            product.attributes, options.allAttributes
        );
        if (matched) resolvedSaleAttribute = matched;
    }
    const defaultSaleAttribute = resolvedSaleAttribute || {
        attribute_id: 0,
        attribute_value_id: 0,
        custom_attribute_value: getAttr(product, 'Color') || 'Por defecto',
    };

    // SKU 级属性（尺码）
    let resolvedSkuSaleAttrs = options.skuSaleAttributes;
    if (!resolvedSkuSaleAttrs && options.allAttributes) {
        resolvedSkuSaleAttrs = autoMatchSkuSaleAttributes(
            product.attributes, product.variants || [], options.allAttributes
        );
    }

    // SPU 代码（取第一个 variant 的 sku_code）
    const supplierCode = variants[0]?.sku_code || `TOPM-${product.id?.slice(0, 8) || 'DRAFT'}`;

    const skcList = variants.map(v => ({
        sale_attribute: {
            attribute_id: String(defaultSaleAttribute.attribute_id),
            attribute_value_id: defaultSaleAttribute.attribute_value_id,
            ...(defaultSaleAttribute.custom_attribute_value
                ? { custom_attribute_value: defaultSaleAttribute.custom_attribute_value }
                : {}),
        },
        sku_list: [{
            supplier_sku: v.sku_code || supplierCode,
            mall_state: 1,
            weight: v.weight_g || weight,
            length: dims.l,                            // 数字（不是字符串）
            width: dims.w,
            height: dims.h,
            stop_purchase: 1,
            cost_info: {
                cost_price: costPrice,
                currency: costCurrency,
            },
            // 注意：成功上架的 JSON 没有 price_info_list！
            stock_info_list: [{
                inventory_num: String(v.stock || 100),  // 字符串！
            }],
            sale_attribute_list: (resolvedSkuSaleAttrs || []).map(a => ({
                attribute_id: String(a.attribute_id),
                attribute_value_id: String(a.attribute_value_id),
            })),
        }],
        shelf_require: '0',
        shelf_way: '1',
    }));

    // 清理属性：转为字符串 ID，移除内部显示字段
    const cleanAttributes = options.matchedAttributes.map(a => ({
        attribute_id: String(a.attribute_id),
        ...(a.attribute_extra_value
            ? { attribute_extra_value: a.attribute_extra_value }
            : { attribute_value_id: String(a.attribute_value_id) }),
    }));

    return {
        brand_code: '',
        category_id: options.categoryId,
        product_type_id: options.productTypeId,
        source_system: 'openapi',                      // 小写！
        suit_flag: 0,                                  // 数字！
        supplier_code: supplierCode,                   // 顶层 SPU 代码
        multi_language_name_list: [
            { language: 'es', name: product.title },
            { language: 'zh-cn', name: product.title },  // 复制一份 zh-cn
        ],
        multi_language_desc_list: [
            { language: 'es', name: product.description },
            { language: 'zh-cn', name: product.description },
        ],
        product_attribute_list: cleanAttributes,
        site_list: [{
            main_site: mainSite,
            sub_site_list: [subSite],
        }],
        skc_list: skcList,
    };
}

// ===== 文件下载 =====

export async function downloadJsonFile(data: unknown, filename: string) {
    const json = JSON.stringify(data, null, 2);

    // 优先使用 File System Access API —— 弹出系统原生"另存为"对话框
    if ('showSaveFilePicker' in window) {
        try {
            const handle = await (window as unknown as { showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle> })
                .showSaveFilePicker({
                    suggestedName: filename,
                    types: [{
                        description: 'JSON 文件',
                        accept: { 'application/json': ['.json'] },
                    }],
                });
            const writable = await handle.createWritable();
            await writable.write(json);
            await writable.close();
            return;
        } catch (e) {
            // 用户取消了保存对话框
            if ((e as Error).name === 'AbortError') return;
            // API 失败则 fallback
        }
    }

    // Fallback: Blob URL（旧浏览器）
    const file = new File([json], filename, { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 60000);
}

// ===== AI 销售属性自动匹配 =====

/** 颜色常见别名映射（西班牙语 → 英语标准名） */
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
    'brown': ['marrón', 'marron', 'café', '棕', '棕色', '咖啡色'],
    'gray': ['gris', 'grey', '灰', '灰色'],
    'beige': ['beige', '米', '米色'],
    'navy': ['azul marino', '深蓝', '藏青'],
    'khaki': ['caqui', '卡其'],
    'multicolor': ['multicolor', '多色', '彩色'],
};

/**
 * 自动匹配 SKC 级主销售属性（颜色）
 * 从属性模板中找 attribute_type=1 且 attribute_label=1 的属性，
 * 然后用产品的颜色值在其候选值中模糊匹配。
 */
export function autoMatchSaleAttribute(
    productAttrs: { key: string; value: string }[],
    templateAttrs: SheinAttribute[]
): { attribute_id: number; attribute_value_id: number; custom_attribute_value?: string; _display_name?: string; _display_value?: string } | null {
    // 找到 SKC 主销售属性（type=1, label=1，通常是"颜色"）
    const skcMainAttr = templateAttrs.find(
        a => a.attribute_type === 1 && a.attribute_label === 1
    );
    if (!skcMainAttr || !skcMainAttr.values?.length) return null;

    // 从产品属性中获取颜色值
    const colorAttr = productAttrs.find(p =>
        /^(color|颜色|colour)$/i.test(p.key)
    );
    const colorValue = colorAttr?.value || '';

    if (!colorValue) {
        // 没有颜色信息，返回第一个候选值作为默认
        const firstValue = skcMainAttr.values[0];
        return {
            attribute_id: skcMainAttr.attribute_id,
            attribute_value_id: firstValue.value_id,
            _display_name: skcMainAttr.attribute_name,
            _display_value: firstValue.value_name,
        };
    }

    // 标准化颜色名进行匹配
    const normalizedColor = colorValue.toLowerCase().trim();

    // 1. 精确匹配
    let matchedValue = skcMainAttr.values.find(v =>
        v.value_name.toLowerCase() === normalizedColor
    );

    // 2. 包含匹配
    if (!matchedValue) {
        matchedValue = skcMainAttr.values.find(v =>
            v.value_name.toLowerCase().includes(normalizedColor) ||
            normalizedColor.includes(v.value_name.toLowerCase())
        );
    }

    // 3. 别名匹配
    if (!matchedValue) {
        for (const [stdName, aliases] of Object.entries(COLOR_ALIASES)) {
            const isMatch = normalizedColor === stdName ||
                aliases.some(a => normalizedColor.includes(a) || a.includes(normalizedColor));
            if (isMatch) {
                // 在候选值中找与标准英文名或别名匹配的
                matchedValue = skcMainAttr.values.find(v => {
                    const vLower = v.value_name.toLowerCase();
                    return vLower === stdName ||
                        vLower.includes(stdName) ||
                        aliases.some(a => vLower.includes(a));
                });
                if (matchedValue) break;
            }
        }
    }

    // 4. 如果仍未匹配，使用 custom_attribute_value（自定义值）
    if (!matchedValue) {
        return {
            attribute_id: skcMainAttr.attribute_id,
            attribute_value_id: 0,
            custom_attribute_value: colorValue,
            _display_name: skcMainAttr.attribute_name,
            _display_value: `${colorValue} (自定义)`,
        };
    }

    return {
        attribute_id: skcMainAttr.attribute_id,
        attribute_value_id: matchedValue.value_id,
        _display_name: skcMainAttr.attribute_name,
        _display_value: matchedValue.value_name,
    };
}

/**
 * 自动匹配 SKU 级销售属性（尺码等）
 * 从属性模板中找 attribute_type=1 (label=0) 或 type=2 的属性，
 * 这些通常是尺码属性，需要映射到具体的 attribute_value_id。
 */
export function autoMatchSkuSaleAttributes(
    productAttrs: { key: string; value: string }[],
    variants: { size?: string; color?: string }[],
    templateAttrs: SheinAttribute[]
): { attribute_id: number; attribute_value_id: number; _display_name?: string; _display_value?: string }[] {
    const matched: { attribute_id: number; attribute_value_id: number; _display_name?: string; _display_value?: string }[] = [];

    // 找到 SKU 级销售属性（type=1 且 label≠1，或 type=2）
    const skuSaleAttrs = templateAttrs.filter(
        a => (a.attribute_type === 1 && a.attribute_label !== 1) ||
            a.attribute_type === 2
    );

    for (const saleAttr of skuSaleAttrs) {
        if (!saleAttr.values?.length) continue;

        // 尝试从产品属性匹配
        const pAttr = productAttrs.find(p =>
            p.key.toLowerCase().includes(saleAttr.attribute_name.toLowerCase()) ||
            saleAttr.attribute_name.toLowerCase().includes(p.key.toLowerCase()) ||
            /^(talla|size|尺码|尺寸|码)$/i.test(p.key) && /size|talla|尺/i.test(saleAttr.attribute_name)
        );

        // 或者从 variants[0].size 匹配
        const sizeValue = pAttr?.value || (variants.length > 0 ? variants[0].size : '') || '';
        if (!sizeValue) {
            // 默认选第一个候选值
            const first = saleAttr.values[0];
            matched.push({
                attribute_id: saleAttr.attribute_id,
                attribute_value_id: first.value_id,
                _display_name: saleAttr.attribute_name,
                _display_value: first.value_name,
            });
            continue;
        }

        const normalizedSize = sizeValue.toLowerCase().trim();

        // 匹配尺码值
        let matchedValue = saleAttr.values.find(v =>
            v.value_name.toLowerCase() === normalizedSize
        ) || saleAttr.values.find(v =>
            v.value_name.toLowerCase().includes(normalizedSize) ||
            normalizedSize.includes(v.value_name.toLowerCase())
        );

        if (matchedValue) {
            matched.push({
                attribute_id: saleAttr.attribute_id,
                attribute_value_id: matchedValue.value_id,
                _display_name: saleAttr.attribute_name,
                _display_value: matchedValue.value_name,
            });
        } else {
            // 默认第一个
            const first = saleAttr.values[0];
            matched.push({
                attribute_id: saleAttr.attribute_id,
                attribute_value_id: first.value_id,
                _display_name: saleAttr.attribute_name,
                _display_value: `${first.value_name} (默认)`,
            });
        }
    }

    return matched;
}

// ===== AI 商品属性匹配 =====

/** 使用简单名称匹配将产品属性映射到模板属性（输出格式符合 SHEIN API）
 *  增强：对未匹配的必填属性(req=true)，自动选择 fallback 值
 */
export function autoMatchAttributes(
    productAttrs: { key: string; value: string }[],
    templateAttrs: SheinAttribute[]
): { attribute_id: number; attribute_value_id: number; attribute_extra_value?: string; _display_name?: string; _display_value?: string }[] {
    const matched: { attribute_id: number; attribute_value_id: number; attribute_extra_value?: string; _display_name?: string; _display_value?: string }[] = [];
    const matchedIds = new Set<number>();

    // 关键词映射：产品属性英文/西班牙文 → 可能的模板属性名
    const keywordMap: Record<string, string[]> = {
        'material': ['composition', 'other materials', 'materials'],
        'Material': ['Composition', 'Other Materials'],
        'Marca': ['Brand'],
        'Color': ['Color'],
        'Peso': ['Weight'],
        'Dimensiones': ['Dimensions'],
    };

    for (const tAttr of templateAttrs) {
        // 只处理类型 3 (成分) 和 4 (普通) 的属性
        if (tAttr.attribute_type !== 3 && tAttr.attribute_type !== 4) continue;

        // 查找产品中名称相似的属性（包括跨语言映射）
        const pAttr = productAttrs.find(p => {
            const pk = p.key.toLowerCase();
            const tk = tAttr.attribute_name.toLowerCase();
            // 直接名称匹配
            if (pk === tk || pk.includes(tk) || tk.includes(pk)) return true;
            // 关键词映射匹配
            const mappedKeys = keywordMap[p.key] || keywordMap[pk];
            if (mappedKeys) {
                return mappedKeys.some(mk => tk.includes(mk.toLowerCase()));
            }
            return false;
        });

        if (pAttr && tAttr.values && tAttr.values.length > 0) {
            // 尝试匹配属性值
            const matchedValue = tAttr.values.find(v =>
                v.value_name.toLowerCase() === pAttr.value.toLowerCase() ||
                v.value_name.toLowerCase().includes(pAttr.value.toLowerCase()) ||
                pAttr.value.toLowerCase().includes(v.value_name.toLowerCase())
            );

            if (matchedValue) {
                matched.push({
                    attribute_id: tAttr.attribute_id,
                    attribute_value_id: matchedValue.value_id,
                    _display_name: tAttr.attribute_name,
                    _display_value: matchedValue.value_name,
                });
                matchedIds.add(tAttr.attribute_id);
            }
        }
    }

    // 补齐必填属性：对未匹配的 req=true 属性，尝试 fallback
    const fallbackNames = ['other', 'unspecified', 'n/a', 'none', 'not applicable', 'desconocido'];
    // 特定属性的智能默认值
    const smartDefaults: Record<number, string[]> = {
        1000565: ['non-foaming', 'non'],          // It's foam → Non-Foaming
        1000411: [],                                // Quantity → 取第一个
        1000062: [],                                // Weaving method → 取第一个
    };

    for (const tAttr of templateAttrs) {
        if (tAttr.attribute_type !== 3 && tAttr.attribute_type !== 4) continue;
        if (matchedIds.has(tAttr.attribute_id)) continue;
        if (!tAttr.is_required) continue;
        if (!tAttr.values || tAttr.values.length === 0) continue;

        // 1. 查找 "Other"/"Unspecified" 等通用 fallback
        let fallback = tAttr.values.find(v =>
            fallbackNames.some(fn => v.value_name.toLowerCase().includes(fn))
        );

        // 2. 查找特定属性的智能默认值
        if (!fallback && smartDefaults[tAttr.attribute_id]) {
            const hints = smartDefaults[tAttr.attribute_id];
            if (hints.length > 0) {
                fallback = tAttr.values.find(v =>
                    hints.some(h => v.value_name.toLowerCase().includes(h))
                );
            }
        }

        // 3. 最终 fallback：取第一个值
        if (!fallback) {
            fallback = tAttr.values[0];
        }

        if (fallback) {
            matched.push({
                attribute_id: tAttr.attribute_id,
                attribute_value_id: fallback.value_id,
                _display_name: tAttr.attribute_name,
                _display_value: `${fallback.value_name} (自动)`,
            });
            matchedIds.add(tAttr.attribute_id);
        }
    }

    return matched;
}
