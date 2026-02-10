import { supabase } from '../lib/supabaseClient';
import type { Product } from '../types';
import { deleteFolder } from './storageService';

export async function createProduct(product: Omit<Product, 'id'>): Promise<string> {
    const { data, error } = await supabase
        .from('products')
        .insert(product)
        .select('id')
        .single();

    if (error) {
        console.error('Create product error:', error);
        throw new Error(`创建产品失败: ${error.message}`);
    }

    return data.id;
}

export async function getProduct(id: string): Promise<Product | null> {
    const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        console.error('Get product error:', error);
        return null;
    }

    return data as Product;
}

export async function getAllProducts(): Promise<Product[]> {
    const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Get all products error:', error);
        return [];
    }

    return (data || []) as Product[];
}

export async function updateProduct(id: string, updates: Partial<Product>): Promise<void> {
    const { error } = await supabase
        .from('products')
        .update(updates)
        .eq('id', id);

    if (error) {
        console.error('Update product error:', error);
        throw new Error(`更新产品失败: ${error.message}`);
    }
}

export async function deleteProduct(id: string): Promise<void> {
    // Delete associated images from Storage
    try {
        await deleteFolder(`products/${id}`);
    } catch (e) {
        console.warn('Failed to delete images:', e);
    }

    const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Delete product error:', error);
        throw new Error(`删除产品失败: ${error.message}`);
    }
}

export async function deleteProducts(ids: string[]): Promise<void> {
    // Delete associated images
    for (const id of ids) {
        try {
            await deleteFolder(`products/${id}`);
        } catch (e) {
            console.warn('Failed to delete images for product:', id, e);
        }
    }

    const { error } = await supabase
        .from('products')
        .delete()
        .in('id', ids);

    if (error) {
        console.error('Delete products error:', error);
        throw new Error(`批量删除产品失败: ${error.message}`);
    }
}

export async function getProductCount(): Promise<number> {
    const { count, error } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true });

    if (error) {
        console.error('Count error:', error);
        return 0;
    }

    return count || 0;
}

export async function getThisWeekCount(): Promise<number> {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const { count, error } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', weekStart.toISOString());

    if (error) {
        console.error('Week count error:', error);
        return 0;
    }

    return count || 0;
}

export async function searchProducts(query: string): Promise<Product[]> {
    if (!query.trim()) {
        return getAllProducts();
    }

    const { data, error } = await supabase
        .from('products')
        .select('*')
        .or(`title.ilike.%${query}%,description.ilike.%${query}%,category.ilike.%${query}%`)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Search error:', error);
        return [];
    }

    return (data || []) as Product[];
}
