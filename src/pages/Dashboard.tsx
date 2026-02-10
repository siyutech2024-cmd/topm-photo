import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Package, ImagePlus, Images, Clock, ArrowRight, TrendingUp } from 'lucide-react';
import { getAllProducts, getProductCount, getThisWeekCount } from '../services/productService';
import { formatDate, formatPrice, truncateText } from '../utils/helpers';
import type { Product } from '../types';

export default function Dashboard() {
    const [stats, setStats] = useState({ total: 0, thisWeek: 0, totalImages: 0, drafts: 0 });
    const [recentProducts, setRecentProducts] = useState<Product[]>([]);

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        const [total, thisWeek, products] = await Promise.all([
            getProductCount(),
            getThisWeekCount(),
            getAllProducts(),
        ]);

        const totalImages = products.reduce((acc, p) => acc + p.product_images.length + p.effect_images.length, 0);
        const drafts = products.filter(p => p.status === 'draft').length;

        setStats({ total, thisWeek, totalImages, drafts });
        setRecentProducts(products.slice(0, 5));
    }

    return (
        <div>
            <div className="page-header">
                <h1>仪表盘</h1>
                <p>欢迎使用 TOPM Photo AI 产品图片生成平台</p>
            </div>

            <div className="stats-grid">
                <div className="card stat-card">
                    <div className="stat-card-icon"><Package size={20} /></div>
                    <div className="stat-card-value">{stats.total}</div>
                    <div className="stat-card-label">产品总数</div>
                </div>
                <div className="card stat-card">
                    <div className="stat-card-icon"><TrendingUp size={20} /></div>
                    <div className="stat-card-value">{stats.thisWeek}</div>
                    <div className="stat-card-label">本周新增</div>
                </div>
                <div className="card stat-card">
                    <div className="stat-card-icon"><Images size={20} /></div>
                    <div className="stat-card-value">{stats.totalImages}</div>
                    <div className="stat-card-label">生成图片总数</div>
                </div>
                <div className="card stat-card">
                    <div className="stat-card-icon"><Clock size={20} /></div>
                    <div className="stat-card-value">{stats.drafts}</div>
                    <div className="stat-card-label">待处理草稿</div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-lg)', position: 'relative', zIndex: 1 }}>
                <div className="card">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-lg)' }}>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>最近产品</h2>
                        <Link to="/products" className="btn btn-ghost btn-sm">
                            查看全部 <ArrowRight size={14} />
                        </Link>
                    </div>

                    {recentProducts.length === 0 ? (
                        <div className="empty-state" style={{ padding: 'var(--space-xl)' }}>
                            <div className="empty-state-icon" style={{ width: 60, height: 60 }}>
                                <Package size={24} />
                            </div>
                            <h3>暂无产品</h3>
                            <p>点击下方按钮创建您的第一个产品</p>
                            <Link to="/create" className="btn btn-primary">
                                <ImagePlus size={16} /> 创建产品
                            </Link>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            {recentProducts.map(product => (
                                <Link
                                    key={product.id}
                                    to={`/products/${product.id}`}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 'var(--space-md)',
                                        padding: 'var(--space-sm) var(--space-md)',
                                        borderRadius: 'var(--radius-md)',
                                        textDecoration: 'none', color: 'inherit',
                                        transition: 'background 0.2s ease',
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-card-hover)')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                >
                                    {product.product_images.length > 0 ? (
                                        <img
                                            src={product.product_images[0]}
                                            alt=""
                                            style={{ width: 42, height: 42, borderRadius: 'var(--radius-md)', objectFit: 'cover', border: '1px solid var(--color-border)' }}
                                        />
                                    ) : (
                                        <div style={{ width: 42, height: 42, borderRadius: 'var(--radius-md)', background: 'var(--color-bg-input)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Images size={18} style={{ color: 'var(--color-text-muted)' }} />
                                        </div>
                                    )}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 600, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {truncateText(product.title, 30)}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                                            {product.category} · {formatPrice(product.price, product.currency)}
                                        </div>
                                    </div>
                                    <span className={`status-badge ${product.status}`}>
                                        {product.status === 'draft' ? '草稿' : product.status === 'generated' ? '已生成' : '已发布'}
                                    </span>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                                        {formatDate(new Date(product.created_at))}
                                    </span>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>

                <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                    <div style={{
                        width: 80, height: 80, borderRadius: '50%',
                        background: 'var(--gradient-primary)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        marginBottom: 'var(--space-lg)',
                        boxShadow: 'var(--shadow-glow)',
                    }}>
                        <ImagePlus size={32} color="#fff" />
                    </div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 'var(--space-sm)' }}>
                        创建新产品
                    </h3>
                    <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem', marginBottom: 'var(--space-lg)' }}>
                        上传 4 张实拍图，AI 自动生成产品图和效果图
                    </p>
                    <Link to="/create" className="btn btn-primary btn-lg">
                        <ImagePlus size={18} /> 开始创建
                    </Link>
                </div>
            </div>
        </div>
    );
}
