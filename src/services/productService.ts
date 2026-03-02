import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import type { Product } from '../types';

export async function createProduct(product: Omit<Product, 'id'>): Promise<string> {
    if (!isSupabaseConfigured()) {
        throw new Error('⚠️ Supabase 未配置，无法创建产品。请在 .env 中配置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY');
    }

    const row = {
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
    };

    const { data, error } = await supabase
        .from('products')
        .insert(row)
        .select('id')
        .single();

    if (error) throw new Error(`创建产品失败: ${error.message}`);
    return data.id;
}

export async function getProduct(id: string): Promise<Product | null> {
    if (!isSupabaseConfigured()) return null;

    const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        if (error.code === 'PGRST116') return null;
        console.warn('获取产品失败:', error.message);
        return null;
    }
    return data as Product;
}

export async function getAllProducts(): Promise<Product[]> {
    if (!isSupabaseConfigured()) return [];

    const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.warn('获取产品列表失败:', error.message);
        return [];
    }
    return (data || []) as Product[];
}

export async function updateProduct(id: string, updates: Partial<Product>): Promise<void> {
    if (!isSupabaseConfigured()) {
        throw new Error('⚠️ Supabase 未配置，无法更新产品');
    }

    const row: Record<string, unknown> = {};
    if (updates.title !== undefined) row.title = updates.title;
    if (updates.description !== undefined) row.description = updates.description;
    if (updates.price !== undefined) row.price = updates.price;
    if (updates.currency !== undefined) row.currency = updates.currency;
    if (updates.category !== undefined) row.category = updates.category;
    if (updates.status !== undefined) row.status = updates.status;
    if (updates.attributes !== undefined) row.attributes = updates.attributes;
    if (updates.original_images !== undefined) row.original_images = updates.original_images;
    if (updates.product_images !== undefined) row.product_images = updates.product_images;
    if (updates.effect_images !== undefined) row.effect_images = updates.effect_images;
    if (updates.grid_images !== undefined) row.grid_images = updates.grid_images;

    const { error } = await supabase
        .from('products')
        .update(row)
        .eq('id', id);

    if (error) throw new Error(`更新产品失败: ${error.message}`);
}

export async function deleteProduct(id: string): Promise<void> {
    if (!isSupabaseConfigured()) {
        throw new Error('⚠️ Supabase 未配置，无法删除产品');
    }

    const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);

    if (error) throw new Error(`删除产品失败: ${error.message}`);
}

export async function deleteProducts(ids: string[]): Promise<void> {
    if (!isSupabaseConfigured()) {
        throw new Error('⚠️ Supabase 未配置，无法批量删除产品');
    }

    const { error } = await supabase
        .from('products')
        .delete()
        .in('id', ids);

    if (error) throw new Error(`批量删除产品失败: ${error.message}`);
}

export async function getProductCount(): Promise<number> {
    if (!isSupabaseConfigured()) return 0;

    const { count, error } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true });

    if (error) {
        console.warn('获取产品数量失败:', error.message);
        return 0;
    }
    return count || 0;
}

export async function getThisWeekCount(): Promise<number> {
    if (!isSupabaseConfigured()) return 0;

    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const { count, error } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', weekStart.toISOString());

    if (error) {
        console.warn('获取本周数量失败:', error.message);
        return 0;
    }
    return count || 0;
}

export async function searchProducts(query: string): Promise<Product[]> {
    if (!isSupabaseConfigured()) return [];
    if (!query.trim()) return getAllProducts();

    const { data, error } = await supabase
        .from('products')
        .select('*')
        .or(`title.ilike.%${query}%,description.ilike.%${query}%,category.ilike.%${query}%`)
        .order('created_at', { ascending: false });

    if (error) {
        console.warn('搜索产品失败:', error.message);
        return [];
    }
    return (data || []) as Product[];
}

export async function clearAllProducts(): Promise<void> {
    if (!isSupabaseConfigured()) {
        throw new Error('⚠️ Supabase 未配置，无法清空产品');
    }

    const { error } = await supabase
        .from('products')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

    if (error) throw new Error(`清空产品失败: ${error.message}`);
}
