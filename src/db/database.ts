import Dexie, { type Table } from 'dexie';

export interface ProductRecord {
    id?: number;
    title: string;
    description: string;
    price: number;
    currency: string;
    category: string;
    attributes: string;           // JSON string
    original_images: string;      // JSON string of base64 array
    product_images: string;       // JSON string of base64 array  
    effect_images: string;        // JSON string of base64 array
    grid_images: string;          // JSON string of base64 array (3x3 + 4x4 grids)
    status: string;
    created_at: string;
    updated_at: string;
}

class TOPMDatabase extends Dexie {
    products!: Table<ProductRecord>;

    constructor() {
        super('topm-photo-db');
        this.version(1).stores({
            products: '++id, title, status, category, created_at',
        });
        this.version(2).stores({
            products: '++id, title, status, category, created_at',
        });
    }
}

export const db = new TOPMDatabase();
