/**
 * 批量文件解析服务
 *
 * 支持 Excel (.xlsx/.xls) 和 PDF 文件的产品数据提取。
 * Excel: 使用 xlsx 库解析行列数据
 * PDF: 将 PDF 转为图片后由 AI 识别产品列表
 */

import * as XLSX from 'xlsx';
import { callGeminiTextOnly } from './geminiService';

// ===== 类型定义 =====

export interface ParsedProduct {
    id: string;              // 唯一标识（通常是 SKU）
    sku: string;             // SKU 编码
    name: string;            // 产品名称
    price?: number;          // 价格（可选）
    stock?: number;          // 库存（可选）
    description?: string;    // 描述（可选）
    imageUrls?: string[];    // 图片 URL（可选）
    images?: string[];       // base64 图片（可选，下载后填充）
    rawRow?: Record<string, unknown>; // 原始行数据
}

// ===== 列名映射 =====

/** 多语言列名模糊匹配映射表 */
const COLUMN_MAPPINGS: Record<string, string[]> = {
    sku: [
        'sku', 'sku code', 'sku_code', 'skucode', 'product_id', 'productid',
        '产品编号', '产品id', '编号', 'sku代码', 'sku编码', '货号',
        'código', 'codigo', 'referencia', 'ref',
    ],
    name: [
        'name', 'product_name', 'productname', 'title', 'product title',
        '产品名称', '名称', '商品名称', '标题', '产品标题',
        'nombre', 'nombre del producto', 'título', 'titulo',
    ],
    price: [
        'price', 'unit_price', 'unitprice', 'sell_price', 'selling_price',
        '价格', '售价', '单价',
        'precio', 'precio unitario', 'precio de venta',
    ],
    stock: [
        'stock', 'quantity', 'qty', 'inventory', 'count',
        '库存', '数量', '库存量',
        'inventario', 'cantidad', 'existencia',
    ],
    description: [
        'description', 'desc', 'product_description',
        '描述', '产品描述', '商品描述',
        'descripción', 'descripcion',
    ],
    image: [
        'image', 'image_url', 'imageurl', 'img', 'photo', 'picture', 'image url',
        '图片', '图片链接', '图片url', '产品图片',
        'imagen', 'url de imagen', 'foto',
    ],
};

/**
 * 在表头中匹配字段名
 */
function matchColumn(headers: string[], field: string): number {
    const candidates = COLUMN_MAPPINGS[field] || [];
    for (let i = 0; i < headers.length; i++) {
        const h = headers[i].toLowerCase().trim();
        if (candidates.includes(h)) return i;
    }
    // 模糊包含匹配
    for (let i = 0; i < headers.length; i++) {
        const h = headers[i].toLowerCase().trim();
        for (const c of candidates) {
            if (h.includes(c) || c.includes(h)) return i;
        }
    }
    return -1;
}

// ===== Excel 解析 =====

/**
 * 解析 Excel 文件，自动识别列头映射，返回产品列表
 */
export async function parseExcelFile(file: File): Promise<ParsedProduct[]> {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });

    // 取第一个 sheet
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // 转为 JSON 数组（header: 1 返回行数组）
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    if (rows.length < 2) {
        throw new Error('Excel 文件至少需要包含表头行和一个数据行');
    }

    // 第一行作为表头
    const headers = rows[0].map(h => String(h).trim());

    // 自动映射列
    const colMap = {
        sku: matchColumn(headers, 'sku'),
        name: matchColumn(headers, 'name'),
        price: matchColumn(headers, 'price'),
        stock: matchColumn(headers, 'stock'),
        description: matchColumn(headers, 'description'),
        image: matchColumn(headers, 'image'),
    };

    // 至少需要 SKU 或名称列
    if (colMap.sku === -1 && colMap.name === -1) {
        throw new Error(`无法在表头中找到 SKU 或产品名称列。\n检测到的表头: ${headers.join(', ')}\n请确保 Excel 包含 "SKU" 或 "产品名称" / "Name" 列。`);
    }

    const products: ParsedProduct[] = [];
    let skuCounter = 1;

    for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.every(cell => !cell && cell !== 0)) continue; // 跳过空行

        const name = colMap.name >= 0 ? String(row[colMap.name] || '').trim() : '';
        const sku = colMap.sku >= 0 ? String(row[colMap.sku] || '').trim() : '';

        // 跳过名称和 SKU 都为空的行
        if (!name && !sku) continue;

        const effectiveSku = sku || `BATCH-${String(skuCounter++).padStart(3, '0')}`;

        const rawRow: Record<string, unknown> = {};
        headers.forEach((h, i) => { rawRow[h] = row[i]; });

        const product: ParsedProduct = {
            id: effectiveSku,
            sku: effectiveSku,
            name: name || effectiveSku,
            rawRow,
        };

        if (colMap.price >= 0) {
            const priceVal = parseFloat(String(row[colMap.price]));
            if (!isNaN(priceVal) && priceVal > 0) product.price = priceVal;
        }

        if (colMap.stock >= 0) {
            const stockVal = parseInt(String(row[colMap.stock]));
            if (!isNaN(stockVal) && stockVal >= 0) product.stock = stockVal;
        }

        if (colMap.description >= 0) {
            product.description = String(row[colMap.description] || '').trim() || undefined;
        }

        if (colMap.image >= 0) {
            const imageStr = String(row[colMap.image] || '').trim();
            if (imageStr) {
                // 支持多个图片 URL（逗号或分号分隔）
                product.imageUrls = imageStr.split(/[,;|\n]+/).map(u => u.trim()).filter(Boolean);
            }
        }

        products.push(product);
    }

    return products;
}

// ===== PDF 解析 =====

/**
 * 将 PDF 文件用 AI 识别产品列表
 * PDF → 转为 base64 → 发给 Gemini AI 识别
 */
export async function parsePdfWithAI(file: File): Promise<ParsedProduct[]> {
    const buffer = await file.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);

    // 调用 Gemini 分析 PDF 内容
    const result = await callGeminiTextOnly(
        `Eres un experto en extracción de datos de documentos PDF de catálogos de productos.

El usuario ha subido un archivo PDF que contiene una lista de productos (puede ser un catálogo, una factura, una orden de compra, etc.).

Los datos del PDF en base64: ${base64.substring(0, 500)}...

(Nota: No puedo enviar el PDF completo en texto. Analiza cualquier tabla o lista de productos que encuentres.)

Por favor extrae TODOS los productos encontrados y devuelve en formato JSON:
{
  "products": [
    {
      "sku": "código/referencia del producto (si existe, o genera uno como BATCH-001)",
      "name": "nombre del producto",
      "price": número (precio si existe, o 0),
      "stock": número (cantidad si existe, o 100),
      "description": "descripción breve si existe"
    }
  ]
}

Si no encuentras productos claros en el contenido, devuelve: {"products": []}`
    );

    const products: ParsedProduct[] = [];
    const parsed = result.products as Array<{ sku?: string; name?: string; price?: number; stock?: number; description?: string }> || [];

    for (let i = 0; i < parsed.length; i++) {
        const p = parsed[i];
        const sku = p.sku || `PDF-${String(i + 1).padStart(3, '0')}`;
        products.push({
            id: sku,
            sku,
            name: p.name || sku,
            price: typeof p.price === 'number' ? p.price : undefined,
            stock: typeof p.stock === 'number' ? p.stock : undefined,
            description: p.description,
        });
    }

    return products;
}

// ===== 图片下载 =====

/**
 * 下载图片 URL 转为 base64（浏览器端）
 */
export async function downloadImageAsBase64(url: string): Promise<string | null> {
    try {
        const response = await fetch(url, { mode: 'cors' });
        if (!response.ok) return null;
        const blob = await response.blob();
        return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch {
        console.warn(`图片下载失败: ${url}`);
        return null;
    }
}

// ===== 工具 =====

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

/**
 * 自动检测文件类型并解析
 */
export async function parseFile(file: File): Promise<ParsedProduct[]> {
    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
        return parseExcelFile(file);
    } else if (ext === 'pdf') {
        return parsePdfWithAI(file);
    } else {
        throw new Error(`不支持的文件格式: .${ext}。请上传 Excel (.xlsx/.xls) 或 PDF 文件。`);
    }
}
