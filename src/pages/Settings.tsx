import { HardDrive, Info, ExternalLink, Trash2, RefreshCw, Database } from 'lucide-react';
import { clearAllProducts } from '../services/productService';
import { syncAll, getCacheStats, clearAllCache } from '../services/sheinCacheService';
import { useState, useEffect } from 'react';

export default function Settings() {
    const [clearing, setClearing] = useState(false);

    // SHEIN 同步状态
    const [syncing, setSyncing] = useState(false);
    const [syncMsg, setSyncMsg] = useState('');
    const [cacheStats, setCacheStats] = useState<{ categoryCount: number; attributeCount: number; lastSync: string | null }>({ categoryCount: 0, attributeCount: 0, lastSync: null });

    useEffect(() => {
        getCacheStats().then(setCacheStats).catch(() => { });
    }, []);

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

    const handleSheinSync = async () => {
        setSyncing(true);
        setSyncMsg('开始同步...');
        try {
            const result = await syncAll((msg) => setSyncMsg(msg));
            setSyncMsg(`✅ 同步完成: ${result.categories} 个类目, ${result.attributes} 个属性模板`);
            const stats = await getCacheStats();
            setCacheStats(stats);
        } catch (e) {
            setSyncMsg('❌ 同步失败: ' + (e instanceof Error ? e.message : '未知错误'));
        } finally {
            setSyncing(false);
        }
    };

    const handleClearCache = async () => {
        if (!confirm('确定清空 SHEIN 缓存数据？')) return;
        await clearAllCache();
        setCacheStats({ categoryCount: 0, attributeCount: 0, lastSync: null });
        setSyncMsg('缓存已清空');
    };

    const formatTime = (iso: string | null) => {
        if (!iso) return '从未同步';
        return new Date(iso).toLocaleString('zh-CN');
    };

    return (
        <div>
            <div className="page-header">
                <h1>系统设置</h1>
                <p>管理系统配置和数据</p>
            </div>

            <div style={{ maxWidth: 600, position: 'relative', zIndex: 1 }}>
                {/* SHEIN 数据同步 */}
                <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
                        <div style={{
                            width: 40, height: 40, borderRadius: 'var(--radius-md)',
                            background: 'rgba(16, 185, 129, 0.12)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#10b981',
                        }}>
                            <Database size={20} />
                        </div>
                        <div>
                            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>🛍️ SHEIN 数据同步</h3>
                            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>类目树 + 属性模板 → 本地缓存</p>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: 'var(--space-md)' }}>
                        <div style={{ padding: '10px', background: 'var(--color-bg-input)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-accent)' }}>{cacheStats.categoryCount}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>类目</div>
                        </div>
                        <div style={{ padding: '10px', background: 'var(--color-bg-input)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-secondary)' }}>{cacheStats.attributeCount}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>属性模板</div>
                        </div>
                        <div style={{ padding: '10px', background: 'var(--color-bg-input)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>{formatTime(cacheStats.lastSync)}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>上次同步</div>
                        </div>
                    </div>

                    {syncMsg && (
                        <p style={{ fontSize: '0.78rem', color: syncMsg.startsWith('❌') ? 'var(--color-danger)' : syncMsg.startsWith('✅') ? 'var(--color-success)' : 'var(--color-text-secondary)', marginBottom: 'var(--space-md)', padding: '8px 12px', background: 'var(--color-bg-input)', borderRadius: 'var(--radius-sm)' }}>
                            {syncMsg}
                        </p>
                    )}

                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn btn-primary btn-sm" onClick={handleSheinSync} disabled={syncing} style={{ flex: 1 }}>
                            <RefreshCw size={14} className={syncing ? 'spin' : ''} /> {syncing ? '同步中...' : '同步 SHEIN 数据'}
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={handleClearCache} disabled={syncing || cacheStats.categoryCount === 0}>
                            <Trash2 size={14} /> 清空缓存
                        </button>
                    </div>

                    <p style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: 'var(--space-sm)', lineHeight: 1.5 }}>
                        同步后，产品创建时 AI 将自动从本地数据匹配 SHEIN 类目和属性，无需手动选择。
                    </p>
                </div>

                {/* 关于 */}
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

                {/* 数据存储 */}
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
                            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Supabase 云端存储</p>
                        </div>
                    </div>
                    <button className="btn btn-danger btn-sm" onClick={handleClearData} disabled={clearing}>
                        <Trash2 size={14} /> {clearing ? '清空中...' : '清空所有数据'}
                    </button>
                </div>

                {/* 技术栈 */}
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
                            { name: 'Supabase', desc: '云端数据库' },
                            { name: 'Gemini AI', desc: '产品分析' },
                            { name: 'SHEIN API', desc: '平台对接' },
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

