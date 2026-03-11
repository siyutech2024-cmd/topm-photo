export interface ProductAttribute {
  key: string;
  value: string;
}

// SKU 变体 (颜色+尺码组合)
export interface ProductVariant {
  color: string;
  size: string;
  sku_code: string;
  price: number;
  stock: number;
  weight_g: number;        // 重量(克)
  length_cm?: number;
  width_cm?: number;
  height_cm?: number;
}

// 平台参数生成结果
export type PlatformType = 'shein' | 'tiktok' | 'temu';

export interface PlatformFieldStatus {
  field: string;
  label: string;
  value: unknown;
  status: 'filled' | 'missing' | 'estimated';
  required: boolean;
}

export interface PlatformParamsResult {
  platform: PlatformType;
  params: Record<string, unknown>;
  fields: PlatformFieldStatus[];
  generated_at: string;
}

export interface Product {
  id?: string;          // UUID from Supabase
  title: string;
  description: string;
  price: number;
  currency: string;
  category: string;
  attributes: ProductAttribute[];
  original_images: string[];    // Supabase Storage URLs
  product_images: string[];     // Supabase Storage URLs
  effect_images: string[];      // Supabase Storage URLs
  grid_images: string[];        // 九宫格(3x3) + 十六宫格(4x4) 场景拼图
  status: 'draft' | 'generated' | 'published';
  created_at: string;
  updated_at: string;
  // 多平台上架扩展字段 (可选)
  variants?: ProductVariant[];
  weight_g?: number;
  package_length_cm?: number;
  package_width_cm?: number;
  package_height_cm?: number;
  // SHEIN AI 自动匹配 (可选)
  shein_category_id?: number;
  shein_product_type_id?: number;
  // 多语言扩展 (可选，用于 SHEIN zh-cn)
  titleZh?: string;
  descriptionZh?: string;
}

export interface GenerationResult {
  productImages: string[];      // base64 (before uploading to Storage)
  effectImages: string[];       // base64 (before uploading to Storage)
  gridImages: string[];         // 九宫格 + 十六宫格场景拼图 base64
  title: string;
  description: string;
  price: number;
  category: string;
  attributes: ProductAttribute[];
  // SHEIN AI 自动匹配
  shein_category_id?: number;
  shein_product_type_id?: number;
}

export interface ExportOptions {
  includeImages: boolean;
  includeExcel: boolean;
  productIds: string[];
}

export interface DashboardStats {
  totalProducts: number;
  thisWeekCount: number;
  totalImages: number;
  draftCount: number;
}
