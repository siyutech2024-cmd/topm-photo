-- =============================================
-- TOPM Photo - Supabase 数据库初始化脚本
-- 在 Supabase SQL Editor 中运行此脚本
-- =============================================

-- 1. 创建 products 表
CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'CNY',
  category TEXT NOT NULL DEFAULT '',
  attributes JSONB NOT NULL DEFAULT '[]'::jsonb,
  original_images TEXT[] NOT NULL DEFAULT '{}',
  product_images TEXT[] NOT NULL DEFAULT '{}',
  effect_images TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'generated', 'published')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. 创建索引
CREATE INDEX IF NOT EXISTS idx_products_status ON products (status);
CREATE INDEX IF NOT EXISTS idx_products_category ON products (category);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products (created_at DESC);

-- 3. 自动更新 updated_at 触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_products_updated_at ON products;
CREATE TRIGGER trigger_update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 4. 创建 Storage Bucket（需要通过 Supabase Dashboard 或 API 创建）
-- 在 Supabase Dashboard → Storage → 创建 "product-images" bucket
-- 设置为 Public bucket 以允许公开读取

-- 5. RLS 策略 (Row Level Security)
-- 初版不启用认证，允许所有操作。正式上线时应开启 RLS 并配置策略。
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- 允许匿名用户完全访问（开发/初版用）
CREATE POLICY "Allow anonymous full access" ON products
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 6. Storage 策略
-- 在 Supabase Dashboard → Storage → product-images → Policies 中添加：
-- SELECT: 允许所有用户（公开读取）
-- INSERT/UPDATE/DELETE: 允许所有用户（开发模式）
