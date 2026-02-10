import { useState } from 'react';
import { HardDrive, Info, ExternalLink } from 'lucide-react';

export default function Settings() {
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
                            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>TOPM Photo v1.1.0</p>
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
                            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Supabase 云端存储</p>
                        </div>
                    </div>
                    <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: 'var(--space-md)' }}>
                        所有数据存储在 Supabase 云端数据库（PostgreSQL），图片存储在 Supabase Storage。
                        数据安全可靠，支持跨设备访问。
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                        <div style={{ padding: '8px 12px', background: 'var(--color-bg-input)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
                            <span style={{ color: 'var(--color-text-muted)' }}>数据库：</span>
                            <span>Supabase PostgreSQL</span>
                        </div>
                        <div style={{ padding: '8px 12px', background: 'var(--color-bg-input)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
                            <span style={{ color: 'var(--color-text-muted)' }}>图片存储：</span>
                            <span>Supabase Storage</span>
                        </div>
                        <div style={{ padding: '8px 12px', background: 'var(--color-bg-input)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
                            <span style={{ color: 'var(--color-text-muted)' }}>部署：</span>
                            <span>Vercel</span>
                        </div>
                    </div>
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
                            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>前端 + 后端服务</p>
                        </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        {[
                            { name: 'React 18', desc: '前端框架' },
                            { name: 'TypeScript', desc: '类型安全' },
                            { name: 'Vite', desc: '构建工具' },
                            { name: 'Supabase', desc: '后端服务' },
                            { name: 'Vercel', desc: '部署平台' },
                            { name: 'Canvas API', desc: 'AI 图片处理' },
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
