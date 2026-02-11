import { db, type ProductRecord } from '../db/database';
import type { Product } from '../types';

function recordToProduct(record: ProductRecord): Product {
    return {
        id: String(record.id),
        title: record.title,
        description: record.description,
        price: record.price,
        currency: record.currency,
        category: record.category,
        attributes: JSON.parse(record.attributes || '[]'),
        original_images: JSON.parse(record.original_images || '[]'),
        product_images: JSON.parse(record.product_images || '[]'),
        effect_images: JSON.parse(record.effect_images || '[]'),
        grid_images: JSON.parse(record.grid_images || '[]'),
        status: record.status as Product['status'],
        created_at: record.created_at,
        updated_at: record.updated_at,
    };
}

function productToRecord(product: Omit<Product, 'id'>): Omit<ProductRecord, 'id'> {
    return {
        title: product.title,
        description: product.description,
        price: product.price,
        currency: product.currency,
        category: product.category,
        attributes: JSON.stringify(product.attributes),
        original_images: JSON.stringify(product.original_images),
        product_images: JSON.stringify(product.product_images),
        effect_images: JSON.stringify(product.effect_images),
        grid_images: JSON.stringify(product.grid_images),
        status: product.status,
        created_at: product.created_at,
        updated_at: product.updated_at,
    };
}

export async function createProduct(product: Omit<Product, 'id'>): Promise<string> {
    const id = await db.products.add(productToRecord(product));
    return String(id);
}

export async function getProduct(id: string): Promise<Product | null> {
    const record = await db.products.get(Number(id));
    return record ? recordToProduct(record) : null;
}

export async function getAllProducts(): Promise<Product[]> {
    const records = await db.products.orderBy('created_at').reverse().toArray();
    return records.map(recordToProduct);
}

export async function updateProduct(id: string, updates: Partial<Product>): Promise<void> {
    const partial: Partial<ProductRecord> = {};
    if (updates.title !== undefined) partial.title = updates.title;
    if (updates.description !== undefined) partial.description = updates.description;
    if (updates.price !== undefined) partial.price = updates.price;
    if (updates.currency !== undefined) partial.currency = updates.currency;
    if (updates.category !== undefined) partial.category = updates.category;
    if (updates.status !== undefined) partial.status = updates.status;
    if (updates.attributes !== undefined) partial.attributes = JSON.stringify(updates.attributes);
    if (updates.original_images !== undefined) partial.original_images = JSON.stringify(updates.original_images);
    if (updates.product_images !== undefined) partial.product_images = JSON.stringify(updates.product_images);
    if (updates.effect_images !== undefined) partial.effect_images = JSON.stringify(updates.effect_images);
    if (updates.grid_images !== undefined) partial.grid_images = JSON.stringify(updates.grid_images);
    partial.updated_at = new Date().toISOString();

    await db.products.update(Number(id), partial);
}

export async function deleteProduct(id: string): Promise<void> {
    await db.products.delete(Number(id));
}

export async function deleteProducts(ids: string[]): Promise<void> {
    await db.products.bulkDelete(ids.map(Number));
}

export async function getProductCount(): Promise<number> {
    return await db.products.count();
}

export async function getThisWeekCount(): Promise<number> {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const isoStart = weekStart.toISOString();

    return await db.products.where('created_at').aboveOrEqual(isoStart).count();
}

export async function searchProducts(query: string): Promise<Product[]> {
    if (!query.trim()) return getAllProducts();
    const q = query.toLowerCase();
    const all = await db.products.toArray();
    return all
        .filter(r => r.title.toLowerCase().includes(q) || r.description.toLowerCase().includes(q) || r.category.toLowerCase().includes(q))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map(recordToProduct);
}

export async function clearAllProducts(): Promise<void> {
    await db.products.clear();
}
