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

if (!isSupabaseConfigured()) {
    console.warn(
        '⚠️ Supabase 环境变量未配置。请在 .env 文件中设置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY'
    );
}

export const supabase = createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder'
);

export const STORAGE_BUCKET = 'product-images';
