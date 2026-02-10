import { supabase, STORAGE_BUCKET } from '../lib/supabaseClient';
import { base64ToBlob } from '../utils/helpers';

/**
 * 上传 base64 图片到 Supabase Storage
 * @returns 公开 URL
 */
export async function uploadImage(base64Data: string, folder: string, fileName: string): Promise<string> {
    const blob = base64ToBlob(base64Data);
    const path = `${folder}/${fileName}`;

    const { error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, blob, {
            contentType: 'image/jpeg',
            upsert: true,
        });

    if (error) {
        console.error('Upload error:', error);
        throw new Error(`图片上传失败: ${error.message}`);
    }

    const { data } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(path);

    return data.publicUrl;
}

/**
 * 批量上传图片
 * @param base64Images base64 图片数组
 * @param folder 存储文件夹路径
 * @param prefix 文件名前缀
 * @returns 公开 URL 数组
 */
export async function uploadImages(
    base64Images: string[],
    folder: string,
    prefix: string
): Promise<string[]> {
    const urls: string[] = [];
    for (let i = 0; i < base64Images.length; i++) {
        const fileName = `${prefix}_${i + 1}_${Date.now()}.jpg`;
        const url = await uploadImage(base64Images[i], folder, fileName);
        urls.push(url);
    }
    return urls;
}

/**
 * 删除 Storage 中的文件夹
 */
export async function deleteFolder(folder: string): Promise<void> {
    const { data: files } = await supabase.storage
        .from(STORAGE_BUCKET)
        .list(folder);

    if (files && files.length > 0) {
        const paths = files.map(f => `${folder}/${f.name}`);
        await supabase.storage
            .from(STORAGE_BUCKET)
            .remove(paths);
    }
}

/**
 * 从 URL 下载图片为 Blob（用于导出 ZIP）
 */
export async function downloadImageAsBlob(url: string): Promise<Blob> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`下载图片失败: ${url}`);
    }
    return await response.blob();
}
