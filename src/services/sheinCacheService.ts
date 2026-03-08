/**
 * SHEIN 类目/属性 IndexedDB 本地缓存服务
 * 
 * 一次性从 SHEIN API 拉取类目树和属性模板 → 存入 IndexedDB →
 * 产品分析时直接从本地读取，无需每次调 API。
 */

import { fetchCategories, flattenCategories, fetchAttributes } from './sheinApiService';
import type { SheinAttribute } from './sheinApiService';

// ===== IndexedDB 初始化 =====

const DB_NAME = 'topm_shein_cache';
const DB_VERSION = 1;
const STORE_CATEGORIES = 'categories';
const STORE_ATTRIBUTES = 'attributes';
const STORE_META = 'meta';

export interface CachedCategory {
    categoryId: number;
    productTypeId: number;
    label: string;          // 完整路径: "Mujer → Vestidos → Mini"
    leafName: string;       // 叶子名: "Mini"
    keywords: string[];     // 搜索关键词
}

export interface CachedAttributeSet {
    productTypeId: number;
    attributes: SheinAttribute[];
    syncedAt: string;
}

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE_CATEGORIES)) {
                db.createObjectStore(STORE_CATEGORIES, { keyPath: 'categoryId' });
            }
            if (!db.objectStoreNames.contains(STORE_ATTRIBUTES)) {
                db.createObjectStore(STORE_ATTRIBUTES, { keyPath: 'productTypeId' });
            }
            if (!db.objectStoreNames.contains(STORE_META)) {
                db.createObjectStore(STORE_META, { keyPath: 'key' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function putAll<T>(storeName: string, items: T[]): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        for (const item of items) store.put(item);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function getAll<T>(storeName: string): Promise<T[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).getAll();
        req.onsuccess = () => resolve(req.result as T[]);
        req.onerror = () => reject(req.error);
    });
}

async function clearStore(storeName: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function setMeta(key: string, value: unknown): Promise<void> {
    await putAll(STORE_META, [{ key, value }]);
}

async function getMeta(key: string): Promise<unknown> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_META, 'readonly');
        const req = tx.objectStore(STORE_META).get(key);
        req.onsuccess = () => resolve(req.result?.value ?? null);
        req.onerror = () => reject(req.error);
    });
}

// ===== 类目同步 =====

function buildKeywords(label: string): string[] {
    return label
        .split(' → ')
        .flatMap(part => part.toLowerCase().split(/[\s,/&]+/))
        .filter(w => w.length > 1);
}

/**
 * 从项目打包的静态 JSON 文件加载类目数据（离线 fallback）
 * 数据来源: SHEIN 测试环境 API → 保存为 src/data/shein_leaf_categories.json
 */
export async function loadBundledCategories(
    onProgress?: (msg: string) => void
): Promise<number> {
    onProgress?.('📦 从本地数据加载 SHEIN 类目...');
    const resp = await import('../data/shein_leaf_categories.json');
    const leaves: Array<{ id: number; name: string; typeId: number; path: string }> = resp.default || resp;

    const cached: CachedCategory[] = leaves.map(c => ({
        categoryId: c.id,
        productTypeId: c.typeId,
        label: c.path,
        leafName: c.name,
        keywords: buildKeywords(c.path),
    }));

    await clearStore(STORE_CATEGORIES);
    await putAll(STORE_CATEGORIES, cached);
    await setMeta('lastCategorySync', new Date().toISOString());
    await setMeta('categoryCount', cached.length);
    await setMeta('dataSource', 'bundled');

    onProgress?.(`✅ ${cached.length} 个类目已从本地数据加载`);
    return cached.length;
}

export async function syncCategories(
    onProgress?: (msg: string) => void
): Promise<number> {
    try {
        onProgress?.('正在从 SHEIN API 获取类目树...');
        const tree = await fetchCategories();

        onProgress?.('处理类目数据...');
        const flat = flattenCategories(tree);

        const cached: CachedCategory[] = flat.map(c => ({
            categoryId: c.categoryId,
            productTypeId: c.productTypeId,
            label: c.label,
            leafName: c.label.split(' → ').pop() || c.label,
            keywords: buildKeywords(c.label),
        }));

        onProgress?.(`保存 ${cached.length} 个类目到本地缓存...`);
        await clearStore(STORE_CATEGORIES);
        await putAll(STORE_CATEGORIES, cached);
        await setMeta('lastCategorySync', new Date().toISOString());
        await setMeta('categoryCount', cached.length);
        await setMeta('dataSource', 'api');

        onProgress?.(`✅ ${cached.length} 个类目已同步 (API)`);
        return cached.length;
    } catch (err) {
        console.warn('API 同步失败，使用本地数据:', err);
        onProgress?.('⚠️ API 同步失败，切换到本地数据...');
        return loadBundledCategories(onProgress);
    }
}

// ===== 属性同步 =====

export async function syncAttributes(
    productTypeIds: number[],
    onProgress?: (msg: string) => void
): Promise<number> {
    let synced = 0;
    let failed = 0;
    const total = productTypeIds.length;
    const startTime = Date.now();

    for (const ptId of productTypeIds) {
        const elapsed = (Date.now() - startTime) / 1000;
        const avgTime = synced > 0 ? elapsed / synced : 0.3;
        const remaining = Math.round(avgTime * (total - synced - failed));
        const eta = remaining > 60
            ? `~${Math.round(remaining / 60)}m`
            : `~${remaining}s`;

        onProgress?.(`📦 同步属性 ${synced + failed + 1}/${total} (${synced} ✅ ${failed} ❌) | 预计剩余 ${eta}`);

        try {
            const attrs = await fetchAttributes(ptId);
            const cached: CachedAttributeSet = {
                productTypeId: ptId,
                attributes: attrs,
                syncedAt: new Date().toISOString(),
            };
            await putAll(STORE_ATTRIBUTES, [cached]);
            synced++;
        } catch (err) {
            failed++;
            console.warn(`Failed to sync attributes for productTypeId ${ptId}:`, err);
        }
        // 避免 API 限流
        await new Promise(r => setTimeout(r, 200));
    }

    await setMeta('lastAttributeSync', new Date().toISOString());
    await setMeta('attributeCount', synced);

    const totalTime = Math.round((Date.now() - startTime) / 1000);
    onProgress?.(`✅ ${synced}/${total} 属性模板已同步 (${failed} 失败) | 耗时 ${totalTime}s`);
    return synced;
}

/** 同步全部：类目 + 所有类目的属性模板（无数量限制） */
export async function syncAll(
    onProgress?: (msg: string) => void
): Promise<{ categories: number; attributes: number }> {
    const catCount = await syncCategories(onProgress);

    // 获取所有类目的 productTypeId（去重）
    const cats = await getLocalCategories();
    const uniquePtIds = [...new Set(cats.map(c => c.productTypeId))];

    onProgress?.(`🔄 准备同步 ${uniquePtIds.length} 个类目的属性模板（无数量限制）...`);

    // 同步全部类目的属性模板
    const attrCount = await syncAttributes(uniquePtIds, onProgress);

    // 同步完成后自动导出到文件
    onProgress?.('💾 正在导出属性数据为本地文件...');
    await exportAttributesToFile();
    onProgress?.('✅ 属性数据已导出为 shein_attributes.json');

    return { categories: catCount, attributes: attrCount };
}

// ===== 属性数据文件导出/导入 =====

/**
 * 将 IndexedDB 中的全量属性数据导出为 JSON 文件下载
 * 文件名: shein_attributes.json
 * 格式: { productTypeId → attributes[] } 的数组
 * 用户需将下载的文件放到 src/data/ 目录下作为离线 fallback
 */
export async function exportAttributesToFile(): Promise<void> {
    const db = await openDB();
    const allSets: CachedAttributeSet[] = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_ATTRIBUTES, 'readonly');
        const req = tx.objectStore(STORE_ATTRIBUTES).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });

    if (allSets.length === 0) {
        console.warn('没有属性数据可导出');
        return;
    }

    // 转换为精简格式
    const exportData = allSets.map(s => ({
        ptId: s.productTypeId,
        attrs: s.attributes.map(a => ({
            id: a.attribute_id,
            name: a.attribute_name,
            type: a.attribute_type,
            label: a.attribute_label,
            mode: a.attribute_mode,
            req: a.is_required,
            vals: (a.values || []).map(v => ({
                id: v.value_id,
                name: v.value_name,
            })),
        })),
    }));

    const json = JSON.stringify(exportData);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
    const a = document.createElement('a');
    a.setAttribute('href', dataUri);
    a.setAttribute('download', 'shein_attributes.json');
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => document.body.removeChild(a), 500);
}

/**
 * 从项目打包的 shein_attributes.json 加载属性数据到 IndexedDB
 * 用于离线环境或初始化时的 fallback
 * 文件路径: src/data/shein_attributes.json
 */
export async function loadBundledAttributes(
    onProgress?: (msg: string) => void
): Promise<number> {
    onProgress?.('📦 从本地文件加载 SHEIN 属性模板...');

    let rawData: Array<{
        ptId: number;
        attrs: Array<{
            id: number;
            name: string;
            type: number;
            label: number;
            mode: number;
            req: boolean;
            vals: Array<{ id: number; name: string }>;
        }>;
    }>;

    try {
        const resp = await import('../data/shein_attributes.json');
        rawData = (resp.default || resp) as typeof rawData;
    } catch {
        onProgress?.('⚠️ 未找到本地属性文件 (src/data/shein_attributes.json)');
        return 0;
    }

    let loaded = 0;
    for (const item of rawData) {
        const attrs: SheinAttribute[] = item.attrs.map(a => ({
            attribute_id: a.id,
            attribute_name: a.name,
            attribute_type: a.type,
            attribute_label: a.label ?? 0,
            attribute_mode: a.mode ?? 1,
            is_required: a.req,
            values: (a.vals || []).map(v => ({
                value_id: v.id,
                value_name: v.name,
            })),
        }));

        const cached: CachedAttributeSet = {
            productTypeId: item.ptId,
            attributes: attrs,
            syncedAt: new Date().toISOString(),
        };
        await putAll(STORE_ATTRIBUTES, [cached]);
        loaded++;
    }

    await setMeta('lastAttributeSync', new Date().toISOString());
    await setMeta('attributeCount', loaded);
    await setMeta('attrDataSource', 'bundled');

    onProgress?.(`✅ ${loaded} 个类目的属性模板已从本地文件加载`);
    return loaded;
}

// ===== 本地读取 =====

export async function getLocalCategories(): Promise<CachedCategory[]> {
    return getAll<CachedCategory>(STORE_CATEGORIES);
}

export async function getLocalAttributes(productTypeId: number): Promise<SheinAttribute[]> {
    // 1. 先从 IndexedDB 查找
    const db = await openDB();
    const cached = await new Promise<CachedAttributeSet | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE_ATTRIBUTES, 'readonly');
        const req = tx.objectStore(STORE_ATTRIBUTES).get(productTypeId);
        req.onsuccess = () => resolve(req.result as CachedAttributeSet | undefined);
        req.onerror = () => reject(req.error);
    });

    if (cached?.attributes?.length) {
        return cached.attributes;
    }

    // 2. IndexedDB 没有 → 从打包文件加载
    try {
        const resp = await import('../data/shein_attributes.json');
        const rawData: Array<{
            ptId: number;
            attrs: Array<{
                id: number; name: string; type: number;
                label: number; mode: number; req: boolean;
                vals: Array<{ id: number; name: string }>;
            }>;
        }> = resp.default || resp;

        const item = rawData.find(d => d.ptId === productTypeId);
        if (!item) return [];

        return item.attrs.map(a => ({
            attribute_id: a.id,
            attribute_name: a.name,
            attribute_type: a.type,
            attribute_label: a.label ?? 0,
            attribute_mode: a.mode ?? 1,
            is_required: a.req,
            values: (a.vals || []).map(v => ({
                value_id: v.id,
                value_name: v.name,
            })),
        }));
    } catch {
        return [];
    }
}

export async function getLastSyncTime(): Promise<string | null> {
    return await getMeta('lastCategorySync') as string | null;
}

export async function getCacheStats(): Promise<{
    categoryCount: number;
    attributeCount: number;
    lastSync: string | null;
}> {
    const [catCount, attrCount, lastSync] = await Promise.all([
        getMeta('categoryCount'),
        getMeta('attributeCount'),
        getMeta('lastCategorySync'),
    ]);
    return {
        categoryCount: (catCount as number) || 0,
        attributeCount: (attrCount as number) || 0,
        lastSync: (lastSync as string) || null,
    };
}

export async function clearAllCache(): Promise<void> {
    await clearStore(STORE_CATEGORIES);
    await clearStore(STORE_ATTRIBUTES);
    await clearStore(STORE_META);
}

// ===== AI 匹配辅助 =====

/** 
 * 从本地类目中提取用于 AI prompt 的摘要列表
 * 返回格式: "categoryId|productTypeId|完整路径"
 * 发送全部类目（Gemini 2.0 Flash 支持 100 万 token，类目列表仅约 5000 tokens）
 */
export async function getCategoryListForAI(): Promise<string> {
    const cats = await getLocalCategories();
    if (cats.length === 0) return '';

    return cats
        .map(c => `${c.categoryId}|${c.productTypeId}|${c.label}`)
        .join('\n');
}

/**
 * 根据产品关键词从本地搜索匹配类目
 * 用于 AI 匹配不到时的 fallback
 * 最低分数门槛 >= 3，避免弱匹配导致错误分类
 */
export function searchLocalCategories(
    categories: CachedCategory[],
    query: string
): CachedCategory[] {
    const q = query.toLowerCase();
    const terms = q.split(/[\s,]+/).filter(t => t.length > 1);

    return categories
        .map(cat => {
            let score = 0;
            for (const term of terms) {
                if (cat.label.toLowerCase().includes(term)) score += 2;
                if (cat.keywords.some(kw => kw.includes(term))) score += 1;
            }
            return { cat, score };
        })
        .filter(x => x.score >= 3)   // 最低分数门槛，避免弱匹配
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .map(x => x.cat);
}
