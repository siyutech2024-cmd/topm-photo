import { HardDrive, Info, ExternalLink, Trash2 } from 'lucide-react';
import { clearAllProducts } from '../services/productService';
import { useState } from 'react';

export default function Settings() {
    const [clearing, setClearing] = useState(false);

    const handleClearData = async () => {
        if (!confirm('确定清空所有产品数据吗？此操作不可撤销！')) return;
        setClearing(true);
        try {
            await clearAllProducts();
            alert('数据已清空');
        } catch (e) {
            alert('清空失败: ' + (e instanceof Error ? e.message : '未知错误'));
        }
        setClearing(false);
    };

    return (
        <div>
            <div className="page-header">
                <h1>系统设置</h1>
                <p>管理系统配置和数据</p>
            </div>

            <div style={{ maxWidth: 600, position: 'relative', zIndex: 1 }}>
                <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
                        <div style={{
                            width: 40, height: 40, borderRadius: 'var(--radius-md)',
                            background: 'var(--color-accent-light)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'var(--color-accent)',
                        }}>
                            <Info size={20} />
                        </div>
                        <div>
                            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>关于</h3>
                            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>TOPM Photo v1.0.0</p>
                        </div>
                    </div>
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
                        TOPM Photo 是一款 AI 驱动的产品图片生成工具。上传产品实拍图后，
                        系统自动生成电商级别的产品展示图和场景效果图，同时生成产品标题、描述、
                        价格和电商参数属性。支持一键导出产品数据和图片。
                    </p>
                </div>

                <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
                        <div style={{
                            width: 40, height: 40, borderRadius: 'var(--radius-md)',
                            background: 'var(--color-secondary-light)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'var(--color-secondary)',
                        }}>
                            <HardDrive size={20} />
                        </div>
                        <div>
                            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>数据存储</h3>
                            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>本地浏览器存储</p>
                        </div>
                    </div>
                    <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: 'var(--space-md)' }}>
                        所有数据存储在浏览器 IndexedDB 中，仅限本机访问。后续可迁移到 Supabase 云端。
                    </p>
                    <button className="btn btn-danger btn-sm" onClick={handleClearData} disabled={clearing}>
                        <Trash2 size={14} /> {clearing ? '清空中...' : '清空所有数据'}
                    </button>
                </div>

                <div className="card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
                        <div style={{
                            width: 40, height: 40, borderRadius: 'var(--radius-md)',
                            background: 'rgba(96, 165, 250, 0.12)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'var(--color-info)',
                        }}>
                            <ExternalLink size={20} />
                        </div>
                        <div>
                            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>技术栈</h3>
                            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>前端开发工具</p>
                        </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        {[
                            { name: 'React 18', desc: '前端框架' },
                            { name: 'TypeScript', desc: '类型安全' },
                            { name: 'Vite', desc: '构建工具' },
                            { name: 'IndexedDB', desc: '本地存储' },
                            { name: 'Canvas API', desc: 'AI 图片处理' },
                            { name: 'GitHub', desc: '代码托管' },
                        ].map(tech => (
                            <div key={tech.name} style={{
                                padding: '10px 14px', background: 'var(--color-bg-input)',
                                borderRadius: 'var(--radius-md)', fontSize: '0.85rem',
                            }}>
                                <div style={{ fontWeight: 600, marginBottom: '2px' }}>{tech.name}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{tech.desc}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
