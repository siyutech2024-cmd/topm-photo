import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit3, Trash2, Download, Save, Check, X } from 'lucide-react';
import { getProduct, updateProduct, deleteProduct } from '../services/productService';
import { exportProductsWithImages } from '../services/exportService';
import ImagePreview from '../components/ImagePreview';
import ProductForm from '../components/ProductForm';
import { formatDate, formatPrice } from '../utils/helpers';
import type { Product, ProductAttribute } from '../types';

export default function ProductDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [product, setProduct] = useState<Product | null>(null);
    const [editing, setEditing] = useState(false);
    const [loading, setLoading] = useState(true);

    // Editable fields
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [price, setPrice] = useState(0);
    const [currency, setCurrency] = useState('CNY');
    const [category, setCategory] = useState('');
    const [attributes, setAttributes] = useState<ProductAttribute[]>([]);

    useEffect(() => {
        if (id) loadProduct(id);
    }, [id]);

    async function loadProduct(pid: string) {
        setLoading(true);
        const p = await getProduct(pid);
        if (p) {
            setProduct(p);
            setTitle(p.title);
            setDescription(p.description);
            setPrice(p.price);
            setCurrency(p.currency);
            setCategory(p.category);
            setAttributes(p.attributes);
        }
        setLoading(false);
    }

    const handleSave = async () => {
        if (!product?.id) return;
        await updateProduct(product.id, { title, description, price, currency, category, attributes });
        setProduct({ ...product, title, description, price, currency, category, attributes });
        setEditing(false);
    };

    const handleDelete = async () => {
        if (!product?.id) return;
        if (!confirm('确定删除此产品吗？')) return;
        await deleteProduct(product.id);
        navigate('/products');
    };

    const handleExport = async () => {
        if (!product) return;
        await exportProductsWithImages([product]);
    };

    const handlePublish = async () => {
        if (!product?.id) return;
        await updateProduct(product.id, { status: 'published' });
        setProduct({ ...product, status: 'published' });
    };

    if (loading) {
        return (
            <div>
                <div className="page-header"><h1>加载中...</h1></div>
            </div>
        );
    }

    if (!product) {
        return (
            <div>
                <div className="page-header"><h1>产品不存在</h1></div>
                <Link to="/products" className="btn btn-secondary"><ArrowLeft size={16} /> 返回列表</Link>
            </div>
        );
    }

    return (
        <div>
            <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                    <Link to="/products" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--color-text-secondary)', textDecoration: 'none', fontSize: '0.85rem', marginBottom: '8px' }}>
                        <ArrowLeft size={14} /> 返回产品列表
                    </Link>
                    <h1>{product.title}</h1>
                    <p style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginTop: '4px' }}>
                        <span className={`status-badge ${product.status}`}>
                            {product.status === 'draft' ? '草稿' : product.status === 'generated' ? '已生成' : '已发布'}
                        </span>
                        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
                            创建于 {formatDate(new Date(product.created_at))}
                        </span>
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-sm)', flexShrink: 0 }}>
                    {product.status !== 'published' && (
                        <button className="btn btn-primary btn-sm" onClick={handlePublish}>
                            <Check size={14} /> 发布
                        </button>
                    )}
                    <button className="btn btn-secondary btn-sm" onClick={handleExport}>
                        <Download size={14} /> 导出
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditing(!editing)}>
                        {editing ? <><X size={14} /> 取消</> : <><Edit3 size={14} /> 编辑</>}
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={handleDelete}>
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 'var(--space-lg)', position: 'relative', zIndex: 1 }}>
                {/* Images */}
                <div className="card">
                    <ImagePreview productImages={product.product_images} effectImages={product.effect_images} gridImages={product.grid_images} />
                </div>

                {/* Info */}
                <div className="card">
                    {editing ? (
                        <>
                            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 'var(--space-lg)' }}>编辑产品信息</h2>
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
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-md)', marginTop: 'var(--space-lg)' }}>
                                <button className="btn btn-secondary" onClick={() => setEditing(false)}>取消</button>
                                <button className="btn btn-primary" onClick={handleSave}>
                                    <Save size={14} /> 保存修改
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 'var(--space-lg)' }}>产品信息</h2>

                            <div className="form-group">
                                <label className="form-label">产品标题</label>
                                <p style={{ fontSize: '0.95rem' }}>{product.title}</p>
                            </div>

                            <div className="form-group">
                                <label className="form-label">产品描述</label>
                                <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
                                    {product.description}
                                </p>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">价格</label>
                                    <p style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-accent)' }}>
                                        {formatPrice(product.price, product.currency)}
                                    </p>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">类目</label>
                                    <p>{product.category}</p>
                                </div>
                            </div>

                            {product.attributes.length > 0 && (
                                <div className="form-group">
                                    <label className="form-label">电商参数属性</label>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                        {product.attributes.map((attr, i) => (
                                            <div key={i} style={{
                                                padding: '8px 12px',
                                                background: 'var(--color-bg-input)',
                                                borderRadius: 'var(--radius-md)',
                                                fontSize: '0.85rem',
                                            }}>
                                                <span style={{ color: 'var(--color-text-muted)' }}>{attr.key}：</span>
                                                <span>{attr.value}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="form-group">
                                <label className="form-label">图片统计</label>
                                <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
                                    <div style={{
                                        padding: '8px 16px', borderRadius: 'var(--radius-md)',
                                        background: 'var(--color-accent-light)', fontSize: '0.85rem',
                                        color: 'var(--color-accent)', fontWeight: 600,
                                    }}>
                                        产品图 {product.product_images.length} 张
                                    </div>
                                    <div style={{
                                        padding: '8px 16px', borderRadius: 'var(--radius-md)',
                                        background: 'var(--color-secondary-light)', fontSize: '0.85rem',
                                        color: 'var(--color-secondary)', fontWeight: 600,
                                    }}>
                                        效果图 {product.effect_images.length} 张
                                    </div>
                                    <div style={{
                                        padding: '8px 16px', borderRadius: 'var(--radius-md)',
                                        background: 'rgba(251,191,36,0.12)', fontSize: '0.85rem',
                                        color: 'var(--color-warning)', fontWeight: 600,
                                    }}>
                                        原图 {product.original_images.length} 张
                                    </div>
                                    {product.grid_images?.length > 0 && (
                                        <div style={{
                                            padding: '8px 16px', borderRadius: 'var(--radius-md)',
                                            background: 'rgba(139,92,246,0.12)', fontSize: '0.85rem',
                                            color: '#8b5cf6', fontWeight: 600,
                                        }}>
                                            场景拼图 {product.grid_images.length} 张
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
