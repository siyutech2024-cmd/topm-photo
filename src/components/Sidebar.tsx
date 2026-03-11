import { NavLink } from 'react-router-dom';
import { LayoutDashboard, ImagePlus, Package, Settings, Sparkles, FileJson, Layers, FlaskConical } from 'lucide-react';

export default function Sidebar() {
    return (
        <aside className="sidebar">
            <div className="sidebar-header">
                <div className="sidebar-logo">
                    <div className="sidebar-logo-icon">T</div>
                    <div className="sidebar-logo-text">
                        <span>TOPM Photo</span>
                        <span>AI Product Studio</span>
                    </div>
                </div>
            </div>

            <nav className="sidebar-nav">
                <div className="nav-section">
                    <div className="nav-section-title">主菜单</div>
                    <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} end>
                        <LayoutDashboard />
                        <span>仪表盘</span>
                    </NavLink>
                    <NavLink to="/create" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                        <ImagePlus />
                        <span>创建产品</span>
                    </NavLink>
                </div>

                <div className="nav-section">
                    <div className="nav-section-title">管理</div>
                    <NavLink to="/products" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                        <Package />
                        <span>产品管理</span>
                    </NavLink>
                    <NavLink to="/json-generator" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                        <FileJson />
                        <span>数据生成</span>
                    </NavLink>
                    <NavLink to="/batch-generator" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                        <Layers />
                        <span>批量生成</span>
                    </NavLink>
                </div>

                <div className="nav-section">
                    <div className="nav-section-title">开发工具</div>
                    <NavLink to="/api-tester" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                        <FlaskConical />
                        <span>API 测试</span>
                    </NavLink>
                </div>

                <div className="nav-section">
                    <div className="nav-section-title">系统</div>
                    <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                        <Settings />
                        <span>设置</span>
                    </NavLink>
                </div>
            </nav>

            <div style={{ padding: 'var(--space-md)', borderTop: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', borderRadius: 'var(--radius-md)', background: 'var(--color-accent-light)' }}>
                    <Sparkles size={16} style={{ color: 'var(--color-accent)' }} />
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-accent)', fontWeight: 600 }}>AI 驱动</span>
                </div>
            </div>
        </aside>
    );
}
