import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import type { Product } from '../types';
import { downloadImageAsBlob } from './storageService';

export async function exportProductsToExcel(products: Product[]): Promise<void> {
    const data = products.map((p, idx) => ({
        '序号': idx + 1,
        '产品标题': p.title,
        '产品描述': p.description,
        '价格': p.price,
        '货币': p.currency,
        '类目': p.category,
        '状态': p.status === 'draft' ? '草稿' : p.status === 'generated' ? '已生成' : '已发布',
        '产品图数量': p.product_images.length,
        '效果图数量': p.effect_images.length,
        '创建时间': new Date(p.created_at).toLocaleString('zh-CN'),
        ...Object.fromEntries(p.attributes.map(a => [a.key, a.value])),
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '产品数据');

    // Auto-fit column widths
    const colWidths = Object.keys(data[0] || {}).map(key => ({
        wch: Math.max(key.length * 2, ...data.map(row => {
            const val = (row as Record<string, unknown>)[key];
            return String(val || '').length;
        })) + 4
    }));
    ws['!cols'] = colWidths;

    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `TOPM_产品数据_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.xlsx`);
}

export async function exportProductsWithImages(products: Product[]): Promise<void> {
    const zip = new JSZip();

    // Add Excel file
    const data = products.map((p, idx) => ({
        '序号': idx + 1,
        '产品标题': p.title,
        '产品描述': p.description,
        '价格': p.price,
        '货币': p.currency,
        '类目': p.category,
        '状态': p.status === 'draft' ? '草稿' : p.status === 'generated' ? '已生成' : '已发布',
        '产品图文件名': Array.from({ length: p.product_images.length }, (_, i) => `产品图_${i + 1}.jpg`).join(', '),
        '效果图文件名': Array.from({ length: p.effect_images.length }, (_, i) => `效果图_${i + 1}.jpg`).join(', '),
        '创建时间': new Date(p.created_at).toLocaleString('zh-CN'),
        ...Object.fromEntries(p.attributes.map(a => [a.key, a.value])),
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '产品数据');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    zip.file('产品数据.xlsx', buf);

    // Add images for each product
    for (let pi = 0; pi < products.length; pi++) {
        const product = products[pi];
        const folderName = `${pi + 1}_${product.title.substring(0, 20).replace(/[/\\?%*:|"<>]/g, '_')}`;
        const productFolder = zip.folder(folderName)!;

        // Original images
        const origFolder = productFolder.folder('原始图片')!;
        for (let i = 0; i < product.original_images.length; i++) {
            try {
                const blob = await downloadImageAsBlob(product.original_images[i]);
                origFolder.file(`原图_${i + 1}.jpg`, blob);
            } catch (e) {
                console.warn(`Failed to download original image ${i + 1}:`, e);
            }
        }

        // Generated product images
        const prodImgFolder = productFolder.folder('产品图')!;
        for (let i = 0; i < product.product_images.length; i++) {
            try {
                const blob = await downloadImageAsBlob(product.product_images[i]);
                prodImgFolder.file(`产品图_${i + 1}.jpg`, blob);
            } catch (e) {
                console.warn(`Failed to download product image ${i + 1}:`, e);
            }
        }

        // Effect images
        const effectFolder = productFolder.folder('效果图')!;
        for (let i = 0; i < product.effect_images.length; i++) {
            try {
                const blob = await downloadImageAsBlob(product.effect_images[i]);
                effectFolder.file(`效果图_${i + 1}.jpg`, blob);
            } catch (e) {
                console.warn(`Failed to download effect image ${i + 1}:`, e);
            }
        }
    }

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, `TOPM_产品导出_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.zip`);
}
