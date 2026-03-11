/**
 * 产品数据服务 — 纯本地 IndexedDB 存储
 * 无外部依赖，数据直接存储在浏览器 IndexedDB（容量 250MB+）
 */

import { dbGetAll, dbGet, dbPut, dbDelete, dbDeleteMany, dbCount, dbSearch, dbClear } from '../lib/localDb';
import type { Product } from '../types';

export async function createProduct(product: Omit<Product, 'id'>): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const fullProduct: Product = {
        ...product,
        id,
        created_at: product.created_at || now,
        updated_at: product.updated_at || now,
    };
    await dbPut(fullProduct);
    return id;
}

export async function getProduct(id: string): Promise<Product | null> {
    return dbGet(id);
}

export async function getAllProducts(): Promise<Product[]> {
    return dbGetAll();
}

export async function updateProduct(id: string, updates: Partial<Product>): Promise<void> {
    const existing = await dbGet(id);
    if (!existing) {
        // 产品可能刚刚创建但还没写入 DB，创建新记录
        const newProduct: Product = {
            id,
            title: '',
            description: '',
            price: 0,
            currency: 'USD',
            category: '',
            attributes: [],
            original_images: [],
            product_images: [],
            effect_images: [],
            grid_images: [],
            status: 'draft',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...updates,
        };
        await dbPut(newProduct);
        return;
    }
    await dbPut({ ...existing, ...updates, updated_at: new Date().toISOString() });
}

export async function deleteProduct(id: string): Promise<void> {
    await dbDelete(id);
}

export async function deleteProducts(ids: string[]): Promise<void> {
    await dbDeleteMany(ids);
}

export async function getProductCount(): Promise<number> {
    return dbCount();
}

export async function getThisWeekCount(): Promise<number> {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const all = await dbGetAll();
    return all.filter(p => new Date(p.created_at) >= weekStart).length;
}

export async function searchProducts(query: string): Promise<Product[]> {
    return dbSearch(query);
}

export async function clearAllProducts(): Promise<void> {
    await dbClear();
}
