import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** 检查 Supabase 是否已正确配置（非占位值） */
export function isSupabaseConfigured(): boolean {
    return !!(
        supabaseUrl &&
        supabaseAnonKey &&
        supabaseUrl !== 'your_supabase_url' &&
        supabaseAnonKey !== 'your_supabase_anon_key' &&
        supabaseUrl.startsWith('https://')
    );
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
