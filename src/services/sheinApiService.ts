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
    attribute_status?: number; // 2=活跃, 3=禁用
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
        sale_attribute?: {
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
            sale_attribute_list?: {
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
const _mainAttrStatusCache: Record<number, number> = {};

export async function fetchAttributes(productTypeId: number): Promise<SheinAttribute[]> {
    if (_attrCache[productTypeId]) return _attrCache[productTypeId];

    // API 需要 product_type_id_list 数组格式
    const data = await callSheinApi<{
        info: {
            data: Array<{
                product_type_id: number;
                main_attribute_status?: number;  // 3=主规格禁用
                attribute_infos: Array<{
                    attribute_id: number;
                    attribute_name: string;
                    attribute_name_en?: string;
                    attribute_type: number;
                    attribute_is_show: number;
                    attribute_status?: number;     // 2=活跃, 3=禁用
                    attribute_label?: number;
                    attribute_mode?: number;
                    attribute_value_info_list?: Array<{ attribute_value_id: number; attribute_value: string; attribute_value_en?: string }>;
                }>
            }>
        }
    }>('attributes', {
        product_type_id_list: [productTypeId],
    });

    const rawEntry = data.info?.data?.[0];

    // 缓存 main_attribute_status
    if (rawEntry?.main_attribute_status !== undefined) {
        _mainAttrStatusCache[productTypeId] = rawEntry.main_attribute_status;
    }

    // 从 info.data[0].attribute_infos 提取并转换为统一格式
    const rawInfos = rawEntry?.attribute_infos || [];
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

/**
 * 获取最近一次 fetchAttributes 调用时缓存的 main_attribute_status
 * 需要先调用 fetchAttributes 才有数据
 */
export function getMainAttrStatusFromCache(productTypeId: number): number | undefined {
    return _mainAttrStatusCache[productTypeId];
}

/**
 * 批量获取 main_attribute_status（仅获取状态，不解析完整属性列表）
 * SHEIN API 支持 product_type_id_list 批量查询，每批最多 10 个
 * 返回 Map<productTypeId, mainAttrStatus>
 */
export async function fetchMainAttrStatusBatch(
    ptIds: number[],
    onProgress?: (msg: string) => void
): Promise<Map<number, number>> {
    const result = new Map<number, number>();
    const batchSize = 10;
    const batches = [];
    for (let i = 0; i < ptIds.length; i += batchSize) {
        batches.push(ptIds.slice(i, i + batchSize));
    }

    let done = 0;
    for (const batch of batches) {
        onProgress?.(`📊 批量获取主规格状态 ${done}/${ptIds.length}...`);
        try {
            const data = await callSheinApi<{
                info: {
                    data: Array<{
                        product_type_id: number;
                        main_attribute_status?: number;
                    }>
                }
            }>('attributes', {
                product_type_id_list: batch,
            });

            for (const entry of (data.info?.data || [])) {
                if (entry.main_attribute_status !== undefined) {
                    result.set(entry.product_type_id, entry.main_attribute_status);
                    _mainAttrStatusCache[entry.product_type_id] = entry.main_attribute_status;
                }
            }
        } catch (e) {
            console.warn(`批量获取 mainAttrStatus 失败 (batch ${done}):`, e);
        }
        done += batch.length;
        // 限流保护
        await new Promise(r => setTimeout(r, 300));
    }

    onProgress?.(`✅ 已获取 ${result.size}/${ptIds.length} 个主规格状态`);
    return result;
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
    mainAttrStatus?: number;        // 主规格状态: 3=禁用 (不需要 SKC 主销售属性)
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
    // mainAttrStatus=3 表示此类目已禁用主规格
    // SHEIN API 仍要求 sale_attribute 非空，但不能用自定义值（不支持新增属性值）
    // 策略：使用 type=1 属性的第一个标准值
    const mainSpecDisabled = options.mainAttrStatus === 3;

    let resolvedSaleAttribute = options.saleAttribute;
    if (!mainSpecDisabled && !resolvedSaleAttribute && options.allAttributes) {
        const matched = autoMatchSaleAttribute(
            product.attributes, options.allAttributes
        );
        if (matched) resolvedSaleAttribute = matched;
    }

    // 主规格禁用时：优先选 type=1 且 status!=3（启用）的属性
    let defaultSaleAttribute: { attribute_id: number; attribute_value_id: number; custom_attribute_value?: string };
    if (mainSpecDisabled && options.allAttributes) {
        // 优先找 status!=3 的 type=1 属性（可用作主规格）
        const enabledSaleAttr = options.allAttributes.find(
            a => a.attribute_type === 1 && a.attribute_status !== 3 && a.values && a.values.length > 0
        );
        if (enabledSaleAttr) {
            defaultSaleAttribute = {
                attribute_id: enabledSaleAttr.attribute_id,
                attribute_value_id: enabledSaleAttr.values![0].value_id,
            };
        } else {
            // 全部 type=1 都禁用，用第一个 type=1 的第一个标准值（最后手段）
            const anySaleAttr = options.allAttributes.find(
                a => a.attribute_type === 1 && a.values && a.values.length > 0
            );
            defaultSaleAttribute = anySaleAttr
                ? { attribute_id: anySaleAttr.attribute_id, attribute_value_id: anySaleAttr.values![0].value_id }
                : { attribute_id: 0, attribute_value_id: 0 };
        }
    } else {
        defaultSaleAttribute = resolvedSaleAttribute || {
            attribute_id: 0,
            attribute_value_id: 0,
            custom_attribute_value: getAttr(product, 'Color') || 'Por defecto',
        };
    }

    // SKU 级属性（尺码）— 主规格禁用时不发
    let resolvedSkuSaleAttrs = options.skuSaleAttributes;
    if (!mainSpecDisabled && !resolvedSkuSaleAttrs && options.allAttributes) {
        resolvedSkuSaleAttrs = autoMatchSkuSaleAttributes(
            product.attributes, product.variants || [], options.allAttributes
        );
    }

    // SPU 代码（取第一个 variant 的 sku_code）
    const supplierCode = variants[0]?.sku_code || `TOPM-${product.id?.slice(0, 8) || 'DRAFT'}`;

    const skcList = variants.map(v => {
        const skuEntry = {
            supplier_sku: v.sku_code || supplierCode,
            mall_state: 1,
            weight: v.weight_g || weight,
            length: dims.l,
            width: dims.w,
            height: dims.h,
            stop_purchase: 1,
            cost_info: {
                cost_price: costPrice,
                currency: costCurrency,
            },
            stock_info_list: [{
                inventory_num: String(v.stock || 100),
            }],
            // 主规格禁用时不发 sale_attribute_list
            ...(!mainSpecDisabled ? {
                sale_attribute_list: (resolvedSkuSaleAttrs || [])
                    .filter(a => String(a.attribute_id) !== String(defaultSaleAttribute.attribute_id))
                    .map(a => ({
                        attribute_id: String(a.attribute_id),
                        attribute_value_id: String(a.attribute_value_id),
                    })),
            } : {}),
        };

        return {
            // sale_attribute 始终发送（API 要求非空）
            sale_attribute: {
                attribute_id: String(defaultSaleAttribute.attribute_id),
                attribute_value_id: defaultSaleAttribute.attribute_value_id,
                ...(defaultSaleAttribute.custom_attribute_value
                    ? { custom_attribute_value: defaultSaleAttribute.custom_attribute_value }
                    : {}),
            },
            sku_list: [skuEntry],
            shelf_require: '0' as const,
            shelf_way: '1' as const,
        };
    });

    // 清理属性：转为字符串 ID，移除内部显示字段
    // type=3 成分: 需要同时发 attribute_value_id + attribute_extra_value
    // type=2/手动输入: 只发 attribute_extra_value (不发 value_id=0)
    // type=4 普通: 发 attribute_value_id
    const cleanAttributes = options.matchedAttributes
        .filter(a => a.attribute_value_id !== 0 || a.attribute_extra_value) // 过滤无效条目
        .map(a => {
            const result: { attribute_id: string; attribute_value_id?: string; attribute_extra_value?: string } = {
                attribute_id: String(a.attribute_id),
            };
            // 有 value_id 且不为 0 → 发送 value_id
            if (a.attribute_value_id && a.attribute_value_id !== 0) {
                result.attribute_value_id = String(a.attribute_value_id);
            }
            // 有 extra_value → 发送 extra_value
            if (a.attribute_extra_value) {
                result.attribute_extra_value = a.attribute_extra_value;
            }
            return result;
        });

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
 * 自动匹配 SKC 级主销售属性
 * 
 * 重要：SHEIN 在非服装类目（家电、日用品等）下**不允许颜色作为主规格**。
 * 策略：
 * 1. 优先选 type=1 且 label=1 的**非颜色**属性（如 Model）
 * 2. 如果 label=1 只有颜色，则改用其他 type=1 属性（如 Model、Size）
 * 3. 最终 fallback 才使用颜色
 */
export function autoMatchSaleAttribute(
    productAttrs: { key: string; value: string }[],
    templateAttrs: SheinAttribute[]
): { attribute_id: number; attribute_value_id: number; custom_attribute_value?: string; _display_name?: string; _display_value?: string } | null {
    // 找所有 type=1 的销售属性
    const saleAttrs = templateAttrs.filter(a => a.attribute_type === 1);
    if (saleAttrs.length === 0) return null;

    // SHEIN 非服装类目只允许 Model 类属性作为主规格
    // 排序优先级：Model > 其他非颜色非尺码 > Size > Color
    const isColorAttr = (a: SheinAttribute) =>
        a.attribute_id === 27 || /^color$/i.test(a.attribute_name);
    const isSizeAttr = (a: SheinAttribute) =>
        a.attribute_id === 87 || /^size$/i.test(a.attribute_name);

    const getPriority = (a: SheinAttribute): number => {
        if (isColorAttr(a)) return 3;   // 最低优先
        if (isSizeAttr(a)) return 2;    // 次低
        return 0;                        // Model 等 → 最高优先
    };

    const sorted = [...saleAttrs].sort((a, b) => {
        const pa = getPriority(a);
        const pb = getPriority(b);
        if (pa !== pb) return pa - pb;
        // 同级别内 label=1 优先
        return (b.attribute_label || 0) - (a.attribute_label || 0);
    });

    // 选第一个有候选值的属性
    const mainAttr = sorted.find(a => a.values && a.values.length > 0);
    if (!mainAttr) return null;

    // 尝试从产品属性中找匹配值
    const matchKey = isColorAttr(mainAttr) ? 'color' : mainAttr.attribute_name.toLowerCase();
    const pAttr = productAttrs.find(p => {
        const pk = p.key.toLowerCase();
        return pk === matchKey || pk.includes(matchKey) || matchKey.includes(pk);
    });

    const searchValue = pAttr?.value || '';

    if (searchValue && mainAttr.values) {
        const normalizedValue = searchValue.toLowerCase().trim();

        // 精确匹配
        let matchedValue = mainAttr.values.find(v =>
            v.value_name.toLowerCase() === normalizedValue
        );

        // 包含匹配
        if (!matchedValue) {
            matchedValue = mainAttr.values.find(v =>
                v.value_name.toLowerCase().includes(normalizedValue) ||
                normalizedValue.includes(v.value_name.toLowerCase())
            );
        }

        // 颜色专用：别名匹配
        if (!matchedValue && isColorAttr(mainAttr)) {
            for (const [stdName, aliases] of Object.entries(COLOR_ALIASES)) {
                const isMatch = normalizedValue === stdName ||
                    aliases.some(a => normalizedValue.includes(a) || a.includes(normalizedValue));
                if (isMatch) {
                    matchedValue = mainAttr.values.find(v => {
                        const vLower = v.value_name.toLowerCase();
                        return vLower === stdName ||
                            vLower.includes(stdName) ||
                            aliases.some(a => vLower.includes(a));
                    });
                    if (matchedValue) break;
                }
            }
        }

        if (matchedValue) {
            return {
                attribute_id: mainAttr.attribute_id,
                attribute_value_id: matchedValue.value_id,
                _display_name: mainAttr.attribute_name,
                _display_value: matchedValue.value_name,
            };
        }

        // 自定义值（仅限颜色）
        if (isColorAttr(mainAttr)) {
            return {
                attribute_id: mainAttr.attribute_id,
                attribute_value_id: 0,
                custom_attribute_value: searchValue,
                _display_name: mainAttr.attribute_name,
                _display_value: `${searchValue} (自定义)`,
            };
        }
    }

    // 没匹配到任何值，返回第一个候选值作为默认
    if (mainAttr.values && mainAttr.values.length > 0) {
        const firstValid = mainAttr.values.find(v => v.value_name && v.value_name.trim() !== '') || mainAttr.values[0];
        return {
            attribute_id: mainAttr.attribute_id,
            attribute_value_id: firstValid.value_id,
            _display_name: mainAttr.attribute_name,
            _display_value: firstValid.value_name,
        };
    }

    return null;
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

/** 使用名称匹配将产品属性映射到模板属性（输出格式符合 SHEIN API）
 *
 * 完整处理所有属性类型：
 * - type=2：尺寸/手动输入 → attribute_extra_value (数值/文本)
 * - type=3：成分属性 → attribute_value_id + attribute_extra_value (百分比, 总和=100%)
 * - type=4：普通属性 → attribute_value_id 或 attribute_extra_value (mode=0 手动)
 */
export function autoMatchAttributes(
    productAttrs: { key: string; value: string }[],
    templateAttrs: SheinAttribute[]
): { attribute_id: number; attribute_value_id: number; attribute_extra_value?: string; _display_name?: string; _display_value?: string }[] {
    const matched: { attribute_id: number; attribute_value_id: number; attribute_extra_value?: string; _display_name?: string; _display_value?: string }[] = [];
    const matchedIds = new Set<number>();

    // 关键词映射
    const keywordMap: Record<string, string[]> = {
        'material': ['composition', 'other materials', 'materials', 'fit type'],
        'Material': ['Composition', 'Other Materials', 'Fit Type'],
        'Marca': ['Brand'],
        'Color': ['Color'],
        'Peso': ['Weight'],
        'Dimensiones': ['Dimensions', 'Diameter', 'Height', 'Width', 'Length'],
    };

    // type=2 尺寸属性的智能默认值
    const dimensionDefaults: Record<number, string> = {
        32: '10', 48: '10', 118: '15', 55: '25',
        1000439: 'N/A', 1000186: 'N/A',
    };

    // 查找产品属性的辅助函数
    const findProductAttr = (tAttr: SheinAttribute) => productAttrs.find(p => {
        const pk = p.key.toLowerCase();
        const tk = tAttr.attribute_name.toLowerCase();
        if (pk === tk || pk.includes(tk) || tk.includes(pk)) return true;
        const keys = keywordMap[p.key] || keywordMap[pk];
        return keys ? keys.some(mk => tk.includes(mk.toLowerCase())) : false;
    });

    // ===== PASS 1: type=3 和 type=4 有候选值 =====
    for (const tAttr of templateAttrs) {
        if (tAttr.attribute_type !== 3 && tAttr.attribute_type !== 4) continue;
        const pAttr = findProductAttr(tAttr);

        // 有候选值 → 尝试匹配值
        if (pAttr && tAttr.values && tAttr.values.length > 0) {
            const matchedValue = tAttr.values.find(v =>
                v.value_name.toLowerCase() === pAttr.value.toLowerCase() ||
                v.value_name.toLowerCase().includes(pAttr.value.toLowerCase()) ||
                pAttr.value.toLowerCase().includes(v.value_name.toLowerCase())
            );
            if (matchedValue) {
                matched.push({
                    attribute_id: tAttr.attribute_id,
                    attribute_value_id: matchedValue.value_id,
                    ...(tAttr.attribute_type === 3 ? { attribute_extra_value: '100' } : {}),
                    _display_name: tAttr.attribute_name,
                    _display_value: matchedValue.value_name + (tAttr.attribute_type === 3 ? ' (100%)' : ''),
                });
                matchedIds.add(tAttr.attribute_id);
                continue;
            }
        }

        // mode=0 无候选值 → 手动输入
        if (tAttr.attribute_mode === 0 && (!tAttr.values || tAttr.values.length === 0) && tAttr.is_required) {
            matched.push({
                attribute_id: tAttr.attribute_id,
                attribute_value_id: 0,
                attribute_extra_value: pAttr?.value || 'N/A',
                _display_name: tAttr.attribute_name,
                _display_value: `${pAttr?.value || 'N/A'} (手动)`,
            });
            matchedIds.add(tAttr.attribute_id);
        }
    }

    // ===== PASS 2: type=2 尺寸/手动输入属性 =====
    for (const tAttr of templateAttrs) {
        if (tAttr.attribute_type !== 2 || !tAttr.is_required) continue;
        if (matchedIds.has(tAttr.attribute_id)) continue;

        const pAttr = findProductAttr(tAttr);
        let extraValue = pAttr?.value || dimensionDefaults[tAttr.attribute_id] || '10';

        // 提取数值
        const numMatch = extraValue.match(/[\d.]+/);
        if (numMatch && /cm|diameter|height|width|length/i.test(tAttr.attribute_name)) {
            extraValue = numMatch[0];
        }

        matched.push({
            attribute_id: tAttr.attribute_id,
            attribute_value_id: 0,
            attribute_extra_value: extraValue,
            _display_name: tAttr.attribute_name,
            _display_value: `${extraValue} (自动)`,
        });
        matchedIds.add(tAttr.attribute_id);
    }

    // ===== PASS 3: 补齐必填属性 fallback =====
    const fallbackNames = ['other', 'unspecified', 'n/a', 'none', 'not applicable'];

    for (const tAttr of templateAttrs) {
        if (matchedIds.has(tAttr.attribute_id)) continue;
        if (!tAttr.is_required) continue;
        if (tAttr.attribute_type === 1) continue; // 销售属性另外处理

        // 无候选值的必填属性 → 手动输入
        if (!tAttr.values || tAttr.values.length === 0) {
            const defaultVal = dimensionDefaults[tAttr.attribute_id] || 'N/A';
            matched.push({
                attribute_id: tAttr.attribute_id,
                attribute_value_id: 0,
                attribute_extra_value: defaultVal,
                _display_name: tAttr.attribute_name,
                _display_value: `${defaultVal} (默认)`,
            });
            matchedIds.add(tAttr.attribute_id);
            continue;
        }

        // 有候选值 → fallback 选择
        let fallback = tAttr.values.find(v =>
            fallbackNames.some(fn => v.value_name.toLowerCase().includes(fn))
        );
        if (!fallback) fallback = tAttr.values[0];

        if (fallback) {
            matched.push({
                attribute_id: tAttr.attribute_id,
                attribute_value_id: fallback.value_id,
                ...(tAttr.attribute_type === 3 ? { attribute_extra_value: '100' } : {}),
                _display_name: tAttr.attribute_name,
                _display_value: `${fallback.value_name} (自动)` + (tAttr.attribute_type === 3 ? ' (100%)' : ''),
            });
            matchedIds.add(tAttr.attribute_id);
        }
    }

    return matched;
}
