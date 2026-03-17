/**
 * IndexedDB 存储层
 * 替代 localStorage（5MB 限制），支持存储大量 base64 图片数据
 * IndexedDB 容量通常 > 250MB
 *
 * 连接管理：
 * - 监听 onclose/onversionchange 事件自动重置失效连接
 * - 所有操作含自动重试逻辑，连接断开时自动重连
 */

import type { Product } from '../types';

const DB_NAME = 'topm_photo_db';
const DB_VERSION = 1;
const STORE_NAME = 'products';
const MAX_RETRIES = 2;

let dbInstance: IDBDatabase | null = null;
let dbOpenPromise: Promise<IDBDatabase> | null = null;

/** 重置连接缓存，下次调用 openDb 会重新打开 */
function resetDb() {
    dbInstance = null;
    dbOpenPromise = null;
}

function openDb(): Promise<IDBDatabase> {
    // 如果已有有效连接，直接返回
    if (dbInstance) return Promise.resolve(dbInstance);
    // 如果正在打开中，复用同一个 Promise 避免并发冲突
    if (dbOpenPromise) return dbOpenPromise;

    dbOpenPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('created_at', 'created_at', { unique: false });
                store.createIndex('status', 'status', { unique: false });
            }
        };

        request.onsuccess = () => {
            const db = request.result;

            // 监听连接关闭，自动重置缓存
            db.onclose = () => {
                console.warn('[localDb] IndexedDB 连接已关闭，将在下次操作时自动重连');
                resetDb();
            };

            // 监听版本变更（其他 tab 升级数据库），主动关闭避免阻塞
            db.onversionchange = () => {
                console.warn('[localDb] 检测到数据库版本变更，关闭当前连接');
                db.close();
                resetDb();
            };

            dbInstance = db;
            dbOpenPromise = null;
            resolve(db);
        };

        request.onerror = () => {
            dbOpenPromise = null;
            reject(request.error);
        };
    });

    return dbOpenPromise;
}

/**
 * 带自动重试的数据库操作包装器
 * 当遇到连接关闭错误时，自动重置连接并重试
 */
async function withRetry<T>(operation: (db: IDBDatabase) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const db = await openDb();
            return await operation(db);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const isConnectionError =
                msg.includes('connection is closing') ||
                msg.includes('connection was lost') ||
                msg.includes('database connection is closing');

            if (isConnectionError && attempt < MAX_RETRIES) {
                console.warn(`[localDb] 连接错误，第 ${attempt + 1} 次重试...`);
                resetDb();
                // 短暂等待后重试
                await new Promise(r => setTimeout(r, 100));
                continue;
            }
            throw err;
        }
    }
    throw new Error('[localDb] 超过最大重试次数');
}

// ===== CRUD =====

export async function dbGetAll(): Promise<Product[]> {
    return withRetry(db => new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => {
            const products = (request.result as Product[]).sort(
                (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );
            resolve(products);
        };
        request.onerror = () => reject(request.error);
    }));
}

export async function dbGet(id: string): Promise<Product | null> {
    return withRetry(db => new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result as Product ?? null);
        request.onerror = () => reject(request.error);
    }));
}

export async function dbPut(product: Product): Promise<void> {
    return withRetry(db => new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(product);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    }));
}

export async function dbDelete(id: string): Promise<void> {
    return withRetry(db => new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    }));
}

export async function dbDeleteMany(ids: string[]): Promise<void> {
    return withRetry(db => new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        for (const id of ids) {
            store.delete(id);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    }));
}

export async function dbCount(): Promise<number> {
    return withRetry(db => new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    }));
}

export async function dbSearch(query: string): Promise<Product[]> {
    const all = await dbGetAll();
    if (!query.trim()) return all;
    const q = query.toLowerCase();
    return all.filter(p =>
        (p.title || '').toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q)
    );
}

export async function dbClear(): Promise<void> {
    return withRetry(db => new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    }));
}
