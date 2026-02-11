import { useState, useCallback } from 'react';
import { Sparkles, Upload, CheckCircle } from 'lucide-react';
import ImageUploader from '../components/ImageUploader';
import { createProduct } from '../services/productService';
import { taskManager } from '../services/taskManager';

export default function CreateProduct() {
    const [images, setImages] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [justSubmitted, setJustSubmitted] = useState(false);

    const handleSubmit = useCallback(async () => {
        if (images.length === 0 || submitting) return;
        setSubmitting(true);

        try {
            // 1. 立即创建 draft 产品（只保存原图）
            const id = await createProduct({
                title: '生成中...',
                description: '',
                price: 0,
                currency: 'USD',
                category: '',
                attributes: [],
                original_images: images,
                product_images: [],
                effect_images: [],
                grid_images: [],
                status: 'draft',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            });

            // 2. 加入后台生成队列
            taskManager.addTask(id, images);

            // 3. 显示成功提示，清空表单让用户继续上传
            setJustSubmitted(true);
            setImages([]);

            setTimeout(() => {
                setJustSubmitted(false);
            }, 3000);
        } catch (err) {
            console.error('Submit error:', err);
            alert('提交失败: ' + (err instanceof Error ? err.message : '未知错误'));
        } finally {
            setSubmitting(false);
        }
    }, [images, submitting]);

    return (
        <div>
            <div className="page-header">
                <h1>创建产品</h1>
                <p>上传产品实拍图，AI 在后台自动生成产品图和信息，您可以继续上传新产品</p>
            </div>

            {/* Success notification */}
            {justSubmitted && (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-md)',
                        padding: 'var(--space-md) var(--space-lg)',
                        marginBottom: 'var(--space-lg)',
                        borderRadius: 'var(--radius-lg)',
                        background: 'rgba(52, 211, 153, 0.1)',
                        border: '1px solid rgba(52, 211, 153, 0.3)',
                        color: 'var(--color-success)',
                        fontSize: '0.9rem',
                        fontWeight: 500,
                        animation: 'fadeInDown 0.3s ease',
                    }}
                >
                    <CheckCircle size={20} />
                    <span>已提交！AI 正在后台生成中，您可以继续上传新产品。查看右下角进度。</span>
                </div>
            )}

            {/* Upload area */}
            <div style={{ position: 'relative', zIndex: 1 }}>
                <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
                    <ImageUploader images={images} onImagesChange={setImages} maxImages={4} />
                </div>

                {images.length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-md)' }}>
                        <button className="btn btn-secondary" onClick={() => setImages([])}>
                            清空重选
                        </button>
                        <button
                            className="btn btn-primary btn-lg"
                            onClick={handleSubmit}
                            disabled={submitting}
                            style={{ minWidth: 180 }}
                        >
                            {submitting ? (
                                <>
                                    <Upload size={18} style={{ animation: 'spin 1s linear infinite' }} />
                                    提交中...
                                </>
                            ) : (
                                <>
                                    <Sparkles size={18} />
                                    提交并后台生成
                                    {images.length < 4 && (
                                        <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                                            （已选 {images.length}/4 张）
                                        </span>
                                    )}
                                </>
                            )}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
