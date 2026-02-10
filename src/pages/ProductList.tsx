import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Search, Download, Trash2, ImagePlus, Package, Eye } from 'lucide-react';
import { getAllProducts, deleteProducts, searchProducts } from '../services/productService';
import ExportModal from '../components/ExportModal';
import { formatDate, formatPrice, truncateText } from '../utils/helpers';
import type { Product } from '../types';

export default function ProductList() {
    const [products, setProducts] = useState<Product[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [showExport, setShowExport] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadProducts();
    }, []);

    async function loadProducts() {
        setLoading(true);
        const data = await getAllProducts();
        setProducts(data);
        setLoading(false);
    }

    const handleSearch = useCallback(async (query: string) => {
        setSearchQuery(query);
        const results = await searchProducts(query);
        setProducts(results);
    }, []);

    const toggleSelect = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === products.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(products.map(p => p.id!)));
        }
    };

    const handleDelete = async () => {
        if (selectedIds.size === 0) return;
        if (!confirm(`确定删除 ${selectedIds.size} 个产品吗？`)) return;
        await deleteProducts(Array.from(selectedIds));
        setSelectedIds(new Set());
        loadProducts();
    };

    const selectedProducts = products.filter(p => selectedIds.has(p.id!));

    return (
        <div>
            <div className="page-header">
                <h1>产品管理</h1>
                <p>管理所有产品数据，支持批量导出</p>
            </div>

            <div className="toolbar">
                <div className="toolbar-group">
                    <div className="search-bar">
                        <Search size={16} />
                        <input
                            type="text"
                            placeholder="搜索产品..."
                            value={searchQuery}
                            onChange={e => handleSearch(e.target.value)}
                        />
                    </div>
                </div>
                <div className="toolbar-group">
                    {selectedIds.size > 0 && (
                        <>
                            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                                已选 {selectedIds.size} 项
                            </span>
                            <button className="btn btn-danger btn-sm" onClick={handleDelete}>
                                <Trash2 size={14} /> 删除
                            </button>
                            <button className="btn btn-secondary btn-sm" onClick={() => setShowExport(true)}>
                                <Download size={14} /> 导出选中
                            </button>
                        </>
                    )}
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                            setSelectedIds(new Set(products.map(p => p.id!)));
                            setShowExport(true);
                        }}
                        disabled={products.length === 0}
                    >
                        <Download size={14} /> 导出全部
                    </button>
                    <Link to="/create" className="btn btn-primary btn-sm">
                        <ImagePlus size={14} /> 新建产品
                    </Link>
                </div>
            </div>

            {loading ? (
                <div className="card" style={{ textAlign: 'center', padding: 'var(--space-2xl)' }}>
                    <p style={{ color: 'var(--color-text-secondary)' }}>加载中...</p>
                </div>
            ) : products.length === 0 ? (
                <div className="card">
                    <div className="empty-state">
                        <div className="empty-state-icon">
                            <Package size={36} />
                        </div>
                        <h3>{searchQuery ? '未找到匹配产品' : '还没有产品'}</h3>
                        <p>{searchQuery ? '尝试其他关键词搜索' : '创建您的第一个 AI 产品图片'}</p>
                        {!searchQuery && (
                            <Link to="/create" className="btn btn-primary">
                                <ImagePlus size={16} /> 创建产品
                            </Link>
                        )}
                    </div>
                </div>
            ) : (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div className="product-table-wrapper">
                        <table className="product-table">
                            <thead>
                                <tr>
                                    <th style={{ width: 40 }}>
                                        <input
                                            type="checkbox"
                                            className="checkbox"
                                            checked={selectedIds.size === products.length && products.length > 0}
                                            onChange={toggleSelectAll}
                                        />
                                    </th>
                                    <th>产品</th>
                                    <th>类目</th>
                                    <th>价格</th>
                                    <th>图片</th>
                                    <th>状态</th>
                                    <th>创建时间</th>
                                    <th style={{ width: 80 }}>操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {products.map(product => (
                                    <tr key={product.id}>
                                        <td>
                                            <input
                                                type="checkbox"
                                                className="checkbox"
                                                checked={selectedIds.has(product.id!)}
                                                onChange={() => toggleSelect(product.id!)}
                                            />
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                                                {product.product_images.length > 0 ? (
                                                    <img src={product.product_images[0]} alt="" className="product-table-thumb" />
                                                ) : (
                                                    <div className="product-table-thumb" style={{ background: 'var(--color-bg-input)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        <Package size={18} style={{ color: 'var(--color-text-muted)' }} />
                                                    </div>
                                                )}
                                                <div>
                                                    <div className="product-table-title">{truncateText(product.title, 25)}</div>
                                                    <div className="product-table-category">{truncateText(product.description, 40)}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ color: 'var(--color-text-secondary)' }}>{product.category}</td>
                                        <td style={{ fontWeight: 600 }}>{formatPrice(product.price, product.currency)}</td>
                                        <td style={{ color: 'var(--color-text-secondary)' }}>
                                            {product.product_images.length + product.effect_images.length} 张
                                        </td>
                                        <td>
                                            <span className={`status-badge ${product.status}`}>
                                                {product.status === 'draft' ? '草稿' : product.status === 'generated' ? '已生成' : '已发布'}
                                            </span>
                                        </td>
                                        <td style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
                                            {formatDate(new Date(product.created_at))}
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                <Link to={`/products/${product.id}`} className="btn btn-icon btn-ghost" title="查看详情">
                                                    <Eye size={16} />
                                                </Link>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {showExport && (
                <ExportModal
                    products={selectedProducts.length > 0 ? selectedProducts : products}
                    onClose={() => setShowExport(false)}
                />
            )}
        </div>
    );
}
