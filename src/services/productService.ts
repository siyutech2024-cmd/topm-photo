import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import type { Product } from '../types';

// ===== localStorage 存储层 =====
const LOCAL_STORAGE_KEY = 'topm_products';

function getLocalProducts(): Product[] {
    try {
        const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (!raw) return [];
        return JSON.parse(raw) as Product[];
    } catch {
        return [];
    }
}

function saveLocalProducts(products: Product[]): void {
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(products));
    } catch {
        console.warn('localStorage 写入失败');
    }
}

/**
 * Supabase 健康状态：如果连续失败，后续请求直接跳过
 */
let supabaseHealthy = true;
let supabaseFailCount = 0;
const MAX_FAIL_BEFORE_SKIP = 1; // 失败1次立即切换到本地模式

function markSupabaseFailed() {
    supabaseFailCount++;
    if (supabaseFailCount >= MAX_FAIL_BEFORE_SKIP) {
        supabaseHealthy = false;
        console.warn(`Supabase 已连续失败 ${supabaseFailCount} 次，切换到纯本地模式`);
    }
}

function shouldTrySupabase(): boolean {
    return isSupabaseConfigured() && supabaseHealthy;
}

/**
 * 本地同步写入
 */
function syncToLocal(product: Product): void {
    const all = getLocalProducts();
    const idx = all.findIndex(p => p.id === product.id);
    if (idx >= 0) {
        all[idx] = product;
    } else {
        all.unshift(product);
    }
    saveLocalProducts(all);
}

// ===== API =====

export async function createProduct(product: Omit<Product, 'id'>): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const fullProduct: Product = {
        ...product,
        id,
        created_at: product.created_at || now,
        updated_at: product.updated_at || now,
    };

    // 始终先写 localStorage
    syncToLocal(fullProduct);

    if (shouldTrySupabase()) {
        try {
            const { data, error } = await supabase
                .from('products')
                .insert({
                    title: product.title,
                    description: product.description,
                    price: product.price,
                    currency: product.currency,
                    category: product.category,
                    attributes: product.attributes,
                    original_images: product.original_images,
                    product_images: product.product_images,
                    effect_images: product.effect_images,
                    grid_images: product.grid_images,
                    status: product.status,
                })
                .select('id')
                .single();

            if (!error && data) return data.id;
            markSupabaseFailed();
        } catch {
            markSupabaseFailed();
        }
    }

    return id;
}

export async function getProduct(id: string): Promise<Product | null> {
    // 先查本地（快速）
    const local = getLocalProducts().find(p => p.id === id);

    if (shouldTrySupabase()) {
        try {
            const { data, error } = await supabase
                .from('products')
                .select('*')
                .eq('id', id)
                .single();

            if (!error && data) return data as Product;
            if (error && error.code !== 'PGRST116') markSupabaseFailed();
        } catch {
            markSupabaseFailed();
        }
    }

    return local || null;
}

export async function getAllProducts(): Promise<Product[]> {
    // 始终先获取本地数据（保证有值可返回）
    const localData = getLocalProducts().sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    if (!shouldTrySupabase()) {
        return localData;
    }

    try {
        const supabaseQuery = supabase
            .from('products')
            .select('*')
            .order('created_at', { ascending: false });

        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 4000)
        );

        const { data, error } = await Promise.race([supabaseQuery, timeoutPromise]);

        if (!error && data && data.length > 0) {
            return data as Product[];
        }
        if (error) {
            markSupabaseFailed();
        }
    } catch {
        markSupabaseFailed();
    }

    return localData;
}

export async function updateProduct(id: string, updates: Partial<Product>): Promise<void> {
    // 先更新本地
    const all = getLocalProducts();
    const idx = all.findIndex(p => p.id === id);
    if (idx >= 0) {
        all[idx] = { ...all[idx], ...updates, updated_at: new Date().toISOString() };
        saveLocalProducts(all);
    }

    if (shouldTrySupabase()) {
        try {
            const row: Record<string, unknown> = {};
            for (const [key, val] of Object.entries(updates)) {
                if (val !== undefined) row[key] = val;
            }

            await supabase.from('products').update(row).eq('id', id);
        } catch {
            markSupabaseFailed();
        }
    }
}

export async function deleteProduct(id: string): Promise<void> {
    saveLocalProducts(getLocalProducts().filter(p => p.id !== id));

    if (shouldTrySupabase()) {
        try {
            await supabase.from('products').delete().eq('id', id);
        } catch {
            markSupabaseFailed();
        }
    }
}

export async function deleteProducts(ids: string[]): Promise<void> {
    const idSet = new Set(ids);
    saveLocalProducts(getLocalProducts().filter(p => !idSet.has(p.id!)));

    if (shouldTrySupabase()) {
        try {
            await supabase.from('products').delete().in('id', ids);
        } catch {
            markSupabaseFailed();
        }
    }
}

export async function getProductCount(): Promise<number> {
    if (shouldTrySupabase()) {
        try {
            const { count, error } = await supabase
                .from('products')
                .select('*', { count: 'exact', head: true });

            if (!error && count !== null) return count;
            markSupabaseFailed();
        } catch {
            markSupabaseFailed();
        }
    }

    return getLocalProducts().length;
}

export async function getThisWeekCount(): Promise<number> {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);

    if (shouldTrySupabase()) {
        try {
            const { count, error } = await supabase
                .from('products')
                .select('*', { count: 'exact', head: true })
                .gte('created_at', weekStart.toISOString());

            if (!error && count !== null) return count;
            markSupabaseFailed();
        } catch {
            markSupabaseFailed();
        }
    }

    return getLocalProducts().filter(p => new Date(p.created_at) >= weekStart).length;
}

export async function searchProducts(query: string): Promise<Product[]> {
    if (!query.trim()) return getAllProducts();

    if (shouldTrySupabase()) {
        try {
            const { data, error } = await supabase
                .from('products')
                .select('*')
                .or(`title.ilike.%${query}%,description.ilike.%${query}%,category.ilike.%${query}%`)
                .order('created_at', { ascending: false });

            if (!error && data) return data as Product[];
            markSupabaseFailed();
        } catch {
            markSupabaseFailed();
        }
    }

    const q = query.toLowerCase();
    return getLocalProducts().filter(p =>
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
}

export async function clearAllProducts(): Promise<void> {
    saveLocalProducts([]);

    if (shouldTrySupabase()) {
        try {
            await supabase.from('products').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        } catch {
            markSupabaseFailed();
        }
    }
}
