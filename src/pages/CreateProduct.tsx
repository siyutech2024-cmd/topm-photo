import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Save, Check } from 'lucide-react';
import ImageUploader from '../components/ImageUploader';
import ImagePreview from '../components/ImagePreview';
import ProductForm from '../components/ProductForm';
import GeneratingAnimation from '../components/GeneratingAnimation';
import { generateProductContent } from '../services/aiGenerator';
import { createProduct } from '../services/productService';
import type { GenerationResult, ProductAttribute } from '../types';

type Step = 'upload' | 'generating' | 'edit' | 'done';

export default function CreateProduct() {
    const navigate = useNavigate();
    const [step, setStep] = useState<Step>('upload');
    const [images, setImages] = useState<string[]>([]);
    const [progress, setProgress] = useState(0);
    const [progressMsg, setProgressMsg] = useState('');

    // Product data
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [price, setPrice] = useState(0);
    const [currency, setCurrency] = useState('CNY');
    const [category, setCategory] = useState('数码电子');
    const [attributes, setAttributes] = useState<ProductAttribute[]>([]);
    const [productImages, setProductImages] = useState<string[]>([]);
    const [effectImages, setEffectImages] = useState<string[]>([]);

    const handleGenerate = useCallback(async () => {
        if (images.length === 0) return;
        setStep('generating');
        setProgress(0);
        setProgressMsg('准备中...');

        try {
            const result: GenerationResult = await generateProductContent(images, (p, msg) => {
                setProgress(Math.round(p * 100));
                setProgressMsg(msg);
            });

            setTitle(result.title);
            setDescription(result.description);
            setPrice(result.price);
            setCategory(result.category);
            setAttributes(result.attributes);
            setProductImages(result.productImages);
            setEffectImages(result.effectImages);
            setStep('edit');
        } catch (err) {
            console.error('Generation error:', err);
            alert('生成失败: ' + (err instanceof Error ? err.message : '未知错误'));
            setStep('upload');
        }
    }, [images]);

    const handleSave = async (status: 'draft' | 'generated') => {
        try {
            const id = await createProduct({
                title,
                description,
                price,
                currency,
                category,
                attributes,
                original_images: images,
                product_images: productImages,
                effect_images: effectImages,
                status,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            });
            setStep('done');
            setTimeout(() => navigate(`/products/${id}`), 1500);
        } catch (err) {
            console.error('Save error:', err);
            alert('保存失败: ' + (err instanceof Error ? err.message : '未知错误'));
        }
    };

    const getStepIndex = () => {
        switch (step) {
            case 'upload': return 0;
            case 'generating': return 1;
            case 'edit': return 2;
            case 'done': return 3;
            default: return 0;
        }
    };

    const stepLabels = ['上传图片', 'AI 生成', '编辑信息', '完成'];
    const currentStepIndex = getStepIndex();

    return (
        <div>
            <div className="page-header">
                <h1>创建产品</h1>
                <p>上传产品实拍图，AI 自动生成电商产品图和信息</p>
            </div>

            {/* Steps indicator */}
            <div className="steps">
                {stepLabels.map((label, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                        {i > 0 && <div className="step-divider" />}
                        <div className={`step ${i === currentStepIndex ? 'active' : i < currentStepIndex ? 'completed' : ''}`}>
                            <div className="step-number">
                                {i < currentStepIndex ? <Check size={12} /> : i + 1}
                            </div>
                            <span>{label}</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Step: Upload */}
            {step === 'upload' && (
                <div style={{ position: 'relative', zIndex: 1 }}>
                    <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
                        <ImageUploader images={images} onImagesChange={setImages} maxImages={4} />
                    </div>
                    {images.length > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-md)' }}>
                            <button className="btn btn-secondary" onClick={() => setImages([])}>
                                清空重选
                            </button>
                            <button className="btn btn-primary btn-lg" onClick={handleGenerate}>
                                <Sparkles size={18} /> 开始 AI 生成
                                {images.length < 4 && (
                                    <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                                        （已选 {images.length}/4 张）
                                    </span>
                                )}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Step: Generating */}
            {step === 'generating' && (
                <div className="card">
                    <GeneratingAnimation progress={progress} message={progressMsg} />
                </div>
            )}

            {/* Step: Edit */}
            {step === 'edit' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-lg)', position: 'relative', zIndex: 1 }}>
                    <div>
                        <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
                            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 'var(--space-lg)' }}>
                                生成结果
                            </h2>
                            <ImagePreview productImages={productImages} effectImages={effectImages} />
                        </div>
                    </div>
                    <div>
                        <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
                            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 'var(--space-lg)' }}>
                                产品信息
                            </h2>
                            <ProductForm
                                title={title}
                                description={description}
                                price={price}
                                currency={currency}
                                category={category}
                                attributes={attributes}
                                onTitleChange={setTitle}
                                onDescriptionChange={setDescription}
                                onPriceChange={setPrice}
                                onCurrencyChange={setCurrency}
                                onCategoryChange={setCategory}
                                onAttributesChange={setAttributes}
                            />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-md)' }}>
                            <button className="btn btn-secondary" onClick={() => handleSave('draft')}>
                                <Save size={16} /> 保存为草稿
                            </button>
                            <button className="btn btn-primary" onClick={() => handleSave('generated')}>
                                <Check size={16} /> 确认保存
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Step: Done */}
            {step === 'done' && (
                <div className="card" style={{ textAlign: 'center', padding: 'var(--space-3xl)', position: 'relative', zIndex: 1 }}>
                    <div style={{
                        width: 80, height: 80, borderRadius: '50%',
                        background: 'rgba(52, 211, 153, 0.12)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto var(--space-lg)',
                        color: 'var(--color-success)',
                    }}>
                        <Check size={36} />
                    </div>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 'var(--space-sm)' }}>
                        产品创建成功！
                    </h2>
                    <p style={{ color: 'var(--color-text-secondary)' }}>
                        正在跳转到产品详情页...
                    </p>
                </div>
            )}
        </div>
    );
}
