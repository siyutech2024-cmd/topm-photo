import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** 
 * 检查 Supabase 是否启用
 * 当前强制使用本地存储模式（localStorage），跳过所有 Supabase 调用
 * 如需恢复 Supabase，将 return false 改回原来的检查逻辑
 */
export function isSupabaseConfigured(): boolean {
    return false;
}

// Supabase 已禁用，使用本地 IndexedDB 存储

export const supabase = createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder'
);

export const STORAGE_BUCKET = 'product-images';
