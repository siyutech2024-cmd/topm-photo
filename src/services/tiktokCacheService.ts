/**
 * TikTok Shop 类目/属性 本地缓存服务
 * 
 * 从项目打包的 JSON 文件加载 TikTok 类目和属性数据。
 * 数据来源: TikTok Shop API → 保存为 src/data/tiktok_*.json
 */

// ===== 类型定义 =====

export interface TiktokCachedCategory {
    catId: string;
    name: string;
    path: string;
    level: number;
    supported: boolean;
    productAttrCount: number;
    salesAttrCount: number;
    keywords: string[];
}

export interface TiktokAttribute {
    id: string;
    name: string;
    type: string | number;  // "PRODUCT_PROPERTY" 或 0 (销售属性如颜色)
    req: boolean;
    vals: { id: string; name: string }[];
}

// ===== 内存缓存 =====

let _categoriesCache: TiktokCachedCategory[] | null = null;
let _attributesCache: Map<string, TiktokAttribute[]> | null = null;

// ===== 类目 =====

function buildKeywords(path: string): string[] {
    return path
        .split(' → ')
        .flatMap(part => part.toLowerCase().split(/[\s,/&]+/))
        .filter(w => w.length > 1);
}

/**
 * 从项目打包的 tiktok_leaf_categories.json 加载类目
 */
export async function loadTiktokCategories(
    onProgress?: (msg: string) => void
): Promise<number> {
    onProgress?.('📦 从本地数据加载 TikTok 类目...');

    const resp = await import('../data/tiktok_leaf_categories.json');
    const leaves: Array<{
        id: string;
        name: string;
        path: string;
        level: number;
        supported: boolean;
        product_attr_count: number;
        sales_attr_count: number;
    }> = resp.default || resp;

    _categoriesCache = leaves
        .filter(c => c.supported)
        .map(c => ({
            catId: c.id,
            name: c.name,
            path: c.path,
            level: c.level,
            supported: c.supported,
            productAttrCount: c.product_attr_count,
            salesAttrCount: c.sales_attr_count,
            keywords: buildKeywords(c.path),
        }));

    onProgress?.(`✅ ${_categoriesCache.length} 个 TikTok 类目已加载`);
    return _categoriesCache.length;
}

/**
 * 获取全部 TikTok 类目（自动加载）
 */
export async function getTiktokLocalCategories(): Promise<TiktokCachedCategory[]> {
    if (!_categoriesCache) {
        await loadTiktokCategories();
    }
    return _categoriesCache || [];
}

/**
 * 根据关键词搜索 TikTok 类目
 */
export function searchTiktokCategories(
    categories: TiktokCachedCategory[],
    query: string
): TiktokCachedCategory[] {
    const q = query.toLowerCase();
    const terms = q.split(/[\s,]+/).filter(t => t.length > 1);

    return categories
        .map(cat => {
            let score = 0;
            for (const term of terms) {
                if (cat.name.toLowerCase().includes(term)) score += 3;
                if (cat.path.toLowerCase().includes(term)) score += 2;
                if (cat.keywords.some(kw => kw.includes(term))) score += 1;
            }
            return { cat, score };
        })
        .filter(x => x.score >= 2)
        .sort((a, b) => b.score - a.score)
        .slice(0, 15)
        .map(x => x.cat);
}

// ===== 属性 =====

/**
 * 从项目打包的 tiktok_attributes.json 加载全量属性（按 catId 索引）
 */
async function ensureAttributesLoaded(): Promise<Map<string, TiktokAttribute[]>> {
    if (_attributesCache) return _attributesCache;

    const resp = await import('../data/tiktok_attributes.json');
    const rawData = (resp.default || resp) as unknown as Array<{
        catId: string;
        attrs: Array<{
            id: string;
            name: string;
            type: string | number;
            req: boolean;
            vals: Array<{ id: string; name: string }>;
        }>;
    }>;

    _attributesCache = new Map();
    for (const item of rawData) {
        _attributesCache.set(item.catId, item.attrs.map(a => ({
            id: a.id,
            name: a.name,
            type: a.type,
            req: a.req,
            vals: a.vals || [],
        })));
    }

    return _attributesCache;
}

/**
 * 获取指定类目的属性模板
 */
export async function getTiktokLocalAttributes(catId: string): Promise<TiktokAttribute[]> {
    const cache = await ensureAttributesLoaded();
    return cache.get(catId) || [];
}

// ===== 两阶段 AI 匹配 =====

/** AI 产品分类 → TikTok 顶层分类的映射表 */
const CATEGORY_MAPPING: Record<string, string[]> = {
    'Electrónica': ['Teléfonos y electrónica', 'Ordenadores y material de oficina'],
    'Ropa y Calzado': ['Ropa de mujer', 'Ropa de hombre', 'Zapatos'],
    'Hogar y Muebles': ['Suministros para el hogar', 'Muebles', 'Textiles para el hogar', 'Mejoras en el hogar', 'Menaje de cocina'],
    'Belleza y Cuidado Personal': ['Belleza y cuidado personal'],
    'Alimentos y Bebidas': ['Salud'],
    'Deportes y Aire Libre': ['Deportes y Actividades al Aire Libre'],
    'Bebés y Juguetes': ['Juguetes y hobbies'],
    'Libros y Papelería': ['Libros, revistas y audio', 'Ordenadores y material de oficina'],
    'Joyería y Accesorios': ['Accesorios de moda', 'Equipaje y bolsos'],
    'Automotriz': ['Automoción y motocicletas'],
    'Otros': ['Herramientas y hardware', 'Electrodomésticos', 'Productos para mascotas', 'Artículos coleccionables'],
};

/**
 * 将 AI 返回的 category 映射到 TikTok 顶层分类名
 * 返回匹配的顶层分类名列表（可能多个）
 */
export function matchTopLevel(aiCategory: string): string[] {
    const normalized = aiCategory.toLowerCase().trim();

    // 精确映射
    for (const [key, tops] of Object.entries(CATEGORY_MAPPING)) {
        if (key.toLowerCase() === normalized || normalized.includes(key.toLowerCase()) || key.toLowerCase().includes(normalized)) {
            return tops;
        }
    }

    // 关键字 fallback
    const keywordMap: Record<string, string[]> = {
        'electr': ['Teléfonos y electrónica', 'Ordenadores y material de oficina'],
        'ropa': ['Ropa de mujer', 'Ropa de hombre'],
        'calzado': ['Zapatos'],
        'zapato': ['Zapatos'],
        'hogar': ['Suministros para el hogar', 'Muebles', 'Menaje de cocina'],
        'mueble': ['Muebles'],
        'cocina': ['Menaje de cocina'],
        'belleza': ['Belleza y cuidado personal'],
        'cuidado': ['Belleza y cuidado personal'],
        'perfum': ['Belleza y cuidado personal'],
        'cosmeti': ['Belleza y cuidado personal'],
        'deporte': ['Deportes y Actividades al Aire Libre'],
        'juguete': ['Juguetes y hobbies'],
        'mascota': ['Productos para mascotas'],
        'auto': ['Automoción y motocicletas'],
        'herramienta': ['Herramientas y hardware'],
        'joya': ['Accesorios de moda'],
        'accesorio': ['Accesorios de moda', 'Equipaje y bolsos'],
        'bolso': ['Equipaje y bolsos'],
        'libro': ['Libros, revistas y audio'],
    };

    for (const [kw, tops] of Object.entries(keywordMap)) {
        if (normalized.includes(kw)) return tops;
    }

    // 找不到 → 返回全部顶层
    return [];
}

/**
 * 按顶层分类筛选叶子类目
 */
export async function getCategoriesByTopLevel(topLevelNames: string[]): Promise<TiktokCachedCategory[]> {
    const cats = await getTiktokLocalCategories();
    if (topLevelNames.length === 0) return cats; // 无匹配时返回全部

    return cats.filter(c => {
        const catTop = c.path.split(' → ')[0];
        return topLevelNames.includes(catTop);
    });
}

/**
 * 生成指定顶层分类下的类目列表（供第二阶段 AI 精确匹配）
 * 格式: "catId|路径"
 */
export async function getTiktokCategoryListForAI(): Promise<string> {
    const cats = await getTiktokLocalCategories();
    if (cats.length === 0) return '';
    return cats.map(c => `${c.catId}|${c.path}`).join('\n');
}

/**
 * 生成指定顶层分类下的类目列表（缩小范围，提高精度）
 */
export async function getTiktokCategoryListForAIByTopLevel(topLevelNames: string[]): Promise<string> {
    const cats = await getCategoriesByTopLevel(topLevelNames);
    if (cats.length === 0) return '';
    return cats.map(c => `${c.catId}|${c.path}`).join('\n');
}
