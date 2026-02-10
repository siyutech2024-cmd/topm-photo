export interface ProductAttribute {
  key: string;
  value: string;
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
  status: 'draft' | 'generated' | 'published';
  created_at: string;
  updated_at: string;
}

export interface GenerationResult {
  productImages: string[];      // base64 (before uploading to Storage)
  effectImages: string[];       // base64 (before uploading to Storage)
  title: string;
  description: string;
  price: number;
  category: string;
  attributes: ProductAttribute[];
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
