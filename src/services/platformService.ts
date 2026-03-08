/**
 * 多平台产品参数生成服务 v2
 * - 固定西班牙语输出
 * - 预置常用类目列表 (含平台类目 ID 占位)
 * - 标注 PID/VID 属性匹配要求
 * - 图片链接展示
 * - Shein Feed API JSON 格式支持
 */
import type { Product, PlatformType, PlatformParamsResult, PlatformFieldStatus } from '../types';

// ===== 常用类目预置 =====

export interface PlatformCategory {
    label: string;            // 西班牙语显示名
    label_en: string;         // 英语（供 API 匹配）
    note: string;             // 如何获取真实 ID 的说明
}

export const SHEIN_CATEGORIES: PlatformCategory[] = [
    { label: 'Vestidos', label_en: 'Dresses', note: 'query-category-tree → Mujer → Vestidos' },
    { label: 'Camisetas', label_en: 'T-Shirts', note: 'query-category-tree → Mujer/Hombre → Tops → Camisetas' },
    { label: 'Pantalones', label_en: 'Pants', note: 'query-category-tree → Mujer/Hombre → Pantalones' },
    { label: 'Faldas', label_en: 'Skirts', note: 'query-category-tree → Mujer → Faldas' },
    { label: 'Chaquetas y Abrigos', label_en: 'Jackets & Coats', note: 'query-category-tree → Mujer/Hombre → Chaquetas' },
    { label: 'Zapatos', label_en: 'Shoes', note: 'query-category-tree → Zapatos' },
    { label: 'Bolsos', label_en: 'Bags', note: 'query-category-tree → Bolsos y Carteras' },
    { label: 'Joyería', label_en: 'Jewelry', note: 'query-category-tree → Joyería y Accesorios' },
    { label: 'Electrónica', label_en: 'Electronics', note: 'query-category-tree → Electrónica' },
    { label: 'Hogar y Decoración', label_en: 'Home & Decor', note: 'query-category-tree → Hogar' },
    { label: 'Belleza', label_en: 'Beauty', note: 'query-category-tree → Belleza y Cuidado Personal' },
    { label: 'Deportes', label_en: 'Sports', note: 'query-category-tree → Deportes y Aire Libre' },
];

export const TIKTOK_CATEGORIES: PlatformCategory[] = [
    { label: 'Vestidos', label_en: 'Dresses', note: 'GET /categories → Womenswear → Dresses' },
    { label: 'Camisetas y Tops', label_en: 'T-Shirts & Tops', note: 'GET /categories → Womenswear/Menswear → Tops' },
    { label: 'Pantalones', label_en: 'Pants & Trousers', note: 'GET /categories → Pants' },
    { label: 'Zapatos', label_en: 'Shoes', note: 'GET /categories → Shoes' },
    { label: 'Bolsos y Carteras', label_en: 'Bags & Wallets', note: 'GET /categories → Bags' },
    { label: 'Joyería', label_en: 'Jewelry', note: 'GET /categories → Jewelry' },
    { label: 'Relojes', label_en: 'Watches', note: 'GET /categories → Watches' },
    { label: 'Electrónica', label_en: 'Electronics', note: 'GET /categories → Electronics' },
    { label: 'Hogar', label_en: 'Home', note: 'GET /categories → Home & Garden' },
    { label: 'Belleza', label_en: 'Beauty', note: 'GET /categories → Beauty & Personal Care' },
    { label: 'Deportes', label_en: 'Sports & Outdoors', note: 'GET /categories → Sports & Outdoors' },
    { label: 'Accesorios Telefono', label_en: 'Phone Accessories', note: 'GET /categories → Phone & Electronics → Phone Accessories' },
];

export const TEMU_CATEGORIES: PlatformCategory[] = [
    { label: 'Vestidos', label_en: 'Dresses', note: 'bg.local.goods.cats.get → Ropa → Vestidos (catType=0)' },
    { label: 'Camisetas', label_en: 'T-Shirts', note: 'bg.local.goods.cats.get → Ropa → Tops (catType=0)' },
    { label: 'Pantalones', label_en: 'Pants', note: 'bg.local.goods.cats.get → Ropa → Pantalones (catType=0)' },
    { label: 'Zapatos', label_en: 'Shoes', note: 'bg.local.goods.cats.get → Zapatos (catType=1)' },
    { label: 'Bolsos', label_en: 'Bags', note: 'bg.local.goods.cats.get → Bolsos' },
    { label: 'Joyería', label_en: 'Jewelry', note: 'bg.local.goods.cats.get → Joyería' },
    { label: 'Electrónica', label_en: 'Electronics', note: 'bg.local.goods.cats.get → Electrónica (catType=1)' },
    { label: 'Hogar', label_en: 'Home', note: 'bg.local.goods.cats.get → Hogar y Cocina' },
    { label: 'Belleza', label_en: 'Beauty', note: 'bg.local.goods.cats.get → Belleza' },
    { label: 'Deportes', label_en: 'Sports', note: 'bg.local.goods.cats.get → Deportes' },
    { label: 'Juguetes', label_en: 'Toys', note: 'bg.local.goods.cats.get → Juguetes' },
    { label: 'Mascotas', label_en: 'Pets', note: 'bg.local.goods.cats.get → Mascotas' },
];

export function getCategoriesForPlatform(platform: PlatformType): PlatformCategory[] {
    switch (platform) {
        case 'shein': return SHEIN_CATEGORIES;
        case 'tiktok': return TIKTOK_CATEGORIES;
        case 'temu': return TEMU_CATEGORIES;
    }
}

// ===== 工具函数 =====

function getAttr(product: Product, key: string): string {
    return product.attributes.find(a => a.key === key)?.value || '';
}

function estimateWeight(product: Product): number {
    if (product.weight_g) return product.weight_g;
    const w = getAttr(product, 'Peso') || getAttr(product, '重量');
    const match = w.match(/(\d+)/);
    return match ? parseInt(match[1]) : 300;
}

function estimateDimensions(product: Product): { l: number; w: number; h: number } {
    if (product.package_length_cm && product.package_width_cm && product.package_height_cm) {
        return { l: product.package_length_cm, w: product.package_width_cm, h: product.package_height_cm };
    }
    const dim = getAttr(product, 'Dimensiones') || getAttr(product, '尺寸');
    const match = dim.match(/(\d+)\s*[×xX*]\s*(\d+)\s*[×xX*]\s*(\d+)/);
    if (match) return { l: parseInt(match[1]), w: parseInt(match[2]), h: parseInt(match[3]) };
    return { l: 25, w: 15, h: 10 };
}

function buildVariants(product: Product) {
    if (product.variants && product.variants.length > 0) return product.variants;
    return [{
        color: getAttr(product, 'Color') || 'Por defecto',
        size: 'Talla única',
        sku_code: `TOPM-${product.id?.slice(0, 8) || 'DRAFT'}`,
        price: product.price,
        stock: 100,
        weight_g: estimateWeight(product),
    }];
}

function addField(fields: PlatformFieldStatus[], field: string, label: string, value: unknown, required: boolean, forceStatus?: 'filled' | 'missing' | 'estimated') {
    const hasValue = value !== null && value !== undefined && value !== '' &&
        !(Array.isArray(value) && value.length === 0);
    fields.push({
        field, label, value, required,
        status: forceStatus || (hasValue ? 'filled' : 'missing'),
    });
}

// ===== Shein 参数生成 (西班牙语) =====

function generateSheinParams(product: Product, selectedCategory?: string): PlatformParamsResult {
    const variants = buildVariants(product);
    const weight = estimateWeight(product);
    const dims = estimateDimensions(product);
    const fields: PlatformFieldStatus[] = [];

    const skcList = variants.map((v) => ({
        supplier_code: v.sku_code,
        sale_attribute: { color: v.color },
        image_info: product.product_images.slice(0, 5).map((url, idx) => ({
            image_type: idx === 0 ? 1 : 2,
            image_url: url,
            _nota: idx === 0 ? '⚠️ Imagen principal - usar transform-pic para convertir URL' : '⚠️ Imagen detalle - usar transform-pic',
        })),
        sku_list: [{
            supplier_sku: `${v.sku_code}-${v.size}`,
            weight: v.weight_g || weight,
            length: dims.l,
            width: dims.w,
            height: dims.h,
            mall_state: 1,
            price_info_list: [{
                base_price: v.price || product.price,
                currency: 'USD',
                sub_site: 'US',
            }],
            stock_info_list: [{
                inventory_num: v.stock || 100,
            }],
        }],
    }));

    const params: Record<string, unknown> = {
        category_id: selectedCategory
            ? `⚠️ Usar query-category-tree para obtener ID exacto de: "${selectedCategory}"`
            : '⚠️ REQUERIDO: Usar /open-api/goods/query-category-tree',
        multi_language_name_list: [
            { language: 'es', name: product.title },
        ],
        multi_language_desc_list: [
            { language: 'es', desc: product.description },
        ],
        product_attribute_list: product.attributes.map(a => ({
            _nota: '⚠️ Requiere attribute_id y value_id de query-attribute-template',
            attribute_name: a.key,
            attribute_value: a.value,
        })),
        skc_list: skcList,
    };

    // Shein Feed API 信封格式
    const feedApiEnvelope = {
        _nota_feed_api: 'Para importación masiva via Feed API:',
        _step1: 'POST /open-api/sem/feed/createFeedDocument',
        _step2: 'POST /open-api/sem/feed/uploadDocumentContent (subir este JSON)',
        _step3: 'POST /open-api/sem/feed/createFeed (ejecutar importación)',
        product_data: params,
    };
    params._feed_api = feedApiEnvelope;

    addField(fields, 'category_id', 'Categoría final (末级分类 ID)', selectedCategory || null, true);
    addField(fields, 'multi_language_name_list', 'Nombre del producto (es)', product.title, true);
    addField(fields, 'multi_language_desc_list', 'Descripción del producto (es)', product.description, true);
    addField(fields, 'product_attribute_list', 'Atributos (requiere PID/VID)', product.attributes, true, 'estimated');
    addField(fields, 'skc_list', 'Lista SKC (color/variante)', skcList, true);
    addField(fields, 'image_info', 'Imágenes (usar transform-pic)', product.product_images, true, product.product_images.length > 0 ? 'estimated' : 'missing');
    addField(fields, 'weight', 'Peso (g)', weight, true, product.weight_g ? 'filled' : 'estimated');
    addField(fields, 'dimensions', 'Dimensiones paquete (cm)', `${dims.l}×${dims.w}×${dims.h}`, true, product.package_length_cm ? 'filled' : 'estimated');
    addField(fields, 'price_info_list', 'Precio', product.price, true);
    addField(fields, 'stock_info_list', 'Inventario', variants[0]?.stock || 100, true);

    return {
        platform: 'shein',
        params,
        fields,
        generated_at: new Date().toISOString(),
    };
}

// ===== TikTok Shop 参数生成 (西班牙语) =====

function generateTikTokParams(product: Product, selectedCategory?: string): PlatformParamsResult {
    const variants = buildVariants(product);
    const weight = estimateWeight(product);
    const dims = estimateDimensions(product);
    const fields: PlatformFieldStatus[] = [];

    const skus = variants.map(v => ({
        sales_attributes: [
            { attribute_name: 'Color', value_name: v.color },
            { attribute_name: 'Talla', value_name: v.size },
        ],
        seller_sku: v.sku_code,
        price: {
            amount: String(Math.round((v.price || product.price) * 100)),
            currency: 'USD',
        },
        inventory: [{ quantity: v.stock || 100 }],
    }));

    const params: Record<string, unknown> = {
        title: product.title,
        description: `<p>${product.description}</p>`,
        category_id: selectedCategory
            ? `⚠️ Usar GET /categories para obtener ID de: "${selectedCategory}"`
            : '⚠️ REQUERIDO: Usar GET /product/202309/categories',
        main_images: product.product_images.slice(0, 9).map(url => ({
            uri: url,
            _nota: '⚠️ Requiere Upload Product Image primero para obtener URI interno',
        })),
        skus,
        package_weight: {
            value: String(weight),
            unit: 'GRAM',
        },
        package_dimensions: {
            length: String(dims.l),
            width: String(dims.w),
            height: String(dims.h),
            unit: 'CENTIMETER',
        },
        product_attributes: product.attributes.map(a => ({
            _nota: '⚠️ Requiere Attribute ID de GET /categories/{id}/attributes',
            attribute_name: a.key,
            attribute_values: [{ value_name: a.value }],
        })),
        _locale: 'es-ES',
    };

    addField(fields, 'title', 'Título del producto', product.title, true);
    addField(fields, 'description', 'Descripción (HTML)', product.description, true);
    addField(fields, 'category_id', 'Categoría hoja (Leaf Category)', selectedCategory || null, true);
    addField(fields, 'main_images', 'Imágenes (requiere upload previo)', product.product_images, true, product.product_images.length > 0 ? 'estimated' : 'missing');
    addField(fields, 'skus', 'Lista de SKU', skus, true);
    addField(fields, 'package_weight', 'Peso del paquete', weight + 'g', true, product.weight_g ? 'filled' : 'estimated');
    addField(fields, 'package_dimensions', 'Dimensiones del paquete', `${dims.l}×${dims.w}×${dims.h}cm`, false, product.package_length_cm ? 'filled' : 'estimated');
    addField(fields, 'product_attributes', 'Atributos (requiere Attribute ID)', product.attributes, false, 'estimated');

    return {
        platform: 'tiktok',
        params,
        fields,
        generated_at: new Date().toISOString(),
    };
}

// ===== Temu 参数生成 (西班牙语) =====

function generateTemuParams(product: Product, selectedCategory?: string): PlatformParamsResult {
    const variants = buildVariants(product);
    const fields: PlatformFieldStatus[] = [];

    const skuList = variants.map(v => ({
        ext_sku_id: v.sku_code,
        sales_attributes: [
            { attribute_name: 'Color', attribute_value: v.color },
            { attribute_name: 'Talla', attribute_value: v.size },
        ],
        _nota_sales_attr: '⚠️ Requiere spec_id de bg.local.goods.spec.id.get',
        price: v.price || product.price,
        stock: v.stock || 100,
    }));

    const isCatClothing = selectedCategory
        ? ['Vestidos', 'Camisetas', 'Pantalones', 'Faldas'].some(c => selectedCategory.includes(c))
        : false;

    const params: Record<string, unknown> = {
        goods_name: product.title,
        goods_desc: product.description,
        cat_id: selectedCategory
            ? `⚠️ Usar bg.local.goods.cats.get para ID exacto de: "${selectedCategory}"`
            : '⚠️ REQUERIDO: bg.local.goods.cats.get (parentCatId=0 → recursar)',
        site_id: 109,
        _nota_site: 'SiteID 109 = España (es), 110 = México (es-MX)',
        brand_id: '⚠️ Opcional: consultar API de marcas',
        goods_img_list: product.product_images.slice(0, 10).map(url => ({
            image_url: url,
            _nota: '⚠️ Subir via /api/galerie/v3/store_image (requiere firma de bg.local.goods.gallery.signature.get)',
        })),
        goodsSpecProperties: product.attributes.map(a => ({
            _nota: '⚠️ Requiere PID/VID de bg.local.goods.cats.template.get',
            pid: '(consultar template)',
            vid: '(consultar template)',
            attribute_name: a.key,
            attribute_value: a.value,
        })),
        skuList,
    };

    if (isCatClothing) {
        params._size_chart = {
            _nota: '⚠️ OBLIGATORIO para ropa: bg.local.goods.size.chart.template.get',
            _note_elements: 'Elementos típicos: Hombros, Pecho, Cintura, Cadera, Largo',
        };
    }

    addField(fields, 'goods_name', 'Nombre del producto', product.title, true);
    addField(fields, 'goods_desc', 'Descripción', product.description, true);
    addField(fields, 'cat_id', 'Categoría hoja (Leaf Cat ID)', selectedCategory || null, true);
    addField(fields, 'site_id', 'Sitio (109=España, 110=México)', 109, true);
    addField(fields, 'goods_img_list', 'Imágenes (requiere upload + firma)', product.product_images, true, product.product_images.length > 0 ? 'estimated' : 'missing');
    addField(fields, 'goodsSpecProperties', 'Atributos (requiere PID/VID)', product.attributes, true, 'estimated');
    addField(fields, 'skuList', 'Lista de SKU', skuList, true);
    if (isCatClothing) {
        addField(fields, 'size_chart', 'Tabla de tallas (obligatorio ropa)', null, true);
    }
    addField(fields, 'shipping_template_id', 'Plantilla de envío', null, true);

    return {
        platform: 'temu',
        params,
        fields,
        generated_at: new Date().toISOString(),
    };
}

// ===== 导出入口 =====

export function generatePlatformParams(product: Product, platform: PlatformType, selectedCategory?: string): PlatformParamsResult {
    switch (platform) {
        case 'shein': return generateSheinParams(product, selectedCategory);
        case 'tiktok': return generateTikTokParams(product, selectedCategory);
        case 'temu': return generateTemuParams(product, selectedCategory);
    }
}

export function copyToClipboard(text: string): Promise<void> {
    return navigator.clipboard.writeText(text);
}

export function exportParamsAsJson(result: PlatformParamsResult): string {
    return JSON.stringify(result.params, null, 2);
}

export function getFieldSummary(fields: PlatformFieldStatus[]) {
    const total = fields.length;
    const filled = fields.filter(f => f.status === 'filled').length;
    const estimated = fields.filter(f => f.status === 'estimated').length;
    const missing = fields.filter(f => f.status === 'missing').length;
    const requiredMissing = fields.filter(f => f.status === 'missing' && f.required).length;
    return { total, filled, estimated, missing, requiredMissing };
}
