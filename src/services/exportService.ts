import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import type { Product } from '../types';
import { base64ToBlob } from '../utils/helpers';

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

async function imageToBlob(image: string): Promise<Blob> {
    // Check if it's a URL or base64
    if (image.startsWith('http')) {
        try {
            const response = await fetch(image);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.blob();
        } catch (err) {
            console.warn('下载图片失败:', err);
            return new Blob();
        }
    }
    return base64ToBlob(image);
}

export async function exportProductsWithImages(products: Product[]): Promise<void> {
    const zip = new JSZip();

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

    for (let pi = 0; pi < products.length; pi++) {
        const product = products[pi];
        const folderName = `${pi + 1}_${product.title.substring(0, 20).replace(/[/\\?%*:|"<>]/g, '_')}`;
        const productFolder = zip.folder(folderName)!;

        const origFolder = productFolder.folder('原始图片')!;
        for (let i = 0; i < product.original_images.length; i++) {
            origFolder.file(`原图_${i + 1}.jpg`, await imageToBlob(product.original_images[i]));
        }

        const prodImgFolder = productFolder.folder('产品图')!;
        for (let i = 0; i < product.product_images.length; i++) {
            prodImgFolder.file(`产品图_${i + 1}.jpg`, await imageToBlob(product.product_images[i]));
        }

        const effectFolder = productFolder.folder('效果图')!;
        for (let i = 0; i < product.effect_images.length; i++) {
            effectFolder.file(`效果图_${i + 1}.jpg`, await imageToBlob(product.effect_images[i]));
        }
    }

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, `TOPM_产品导出_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.zip`);
}
