import { useState, useRef } from 'react';
import { Send, AlertTriangle, CheckCircle, Copy, RotateCw, ChevronDown, Trash2, Clock, Info } from 'lucide-react';

// 测试店铺配置
const TEST_STORES = [
    { name: '🇲🇽 墨西哥 - 自发货', key: 'AAA6DE7858DC4F9C9C4FFA06F3663ADC', secret: '59ECAE225C78420F96832763D99ACE28', site: 'shein-mx' },
    { name: '🇲🇽 墨西哥 - 平台', key: 'B3EA8E9A735147E081DC9DA61BB9A9C2', secret: 'E81C68F316C3494E94E3F777897115D1', site: 'shein-mx' },
    { name: '🇺🇸 美国', key: 'EED6AEEA6B4741EF94D29FED5A1CE76F', secret: '35D01D988EBA46FB9D87CA066FFD1805', site: 'shein-us' },
    { name: '🇧🇷 巴西', key: '9F9ADD60C20C4A958E6FAB28B13DD8F2', secret: 'D00C696677A3426CB5AB55EFF4874C5C', site: 'shein-br' },
    { name: '🇪🇺 欧洲', key: '9E4138ED97694A28B9C58E287F483DB6', secret: 'A581F9B876244FBE8E04C6503F711D01', site: 'shein-eu' },
];

const SAMPLE_JSON = {
    brand_code: "",
    category_id: 13221,
    product_type_id: 9950,
    source_system: "openapi",
    suit_flag: 0,
    supplier_code: "TOPM-001",
    multi_language_name_list: [
        { language: "es", name: "Soporte Universal para Teléfono de Coche" },
        { language: "zh-cn", name: "Soporte Universal para Teléfono de Coche" }
    ],
    multi_language_desc_list: [
        { language: "es", name: "Este soporte universal combina funcionalidad y estilo." },
        { language: "zh-cn", name: "Este soporte universal combina funcionalidad y estilo." }
    ],
    product_attribute_list: [
        { attribute_id: "1000547", attribute_value_id: "1330" },
        { attribute_id: "1000439", attribute_extra_value: "N/A" },
        { attribute_id: "1000566", attribute_value_id: "1382" },
        { attribute_id: "1000565", attribute_value_id: "1004582" },
        { attribute_id: "1000546", attribute_extra_value: "N/A" },
    ],
    site_list: [{ main_site: "shein", sub_site_list: ["shein-mx"] }],
    skc_list: [{
        sale_attribute: { attribute_id: "27", attribute_value_id: 112 },
        sku_list: [{
            supplier_sku: "TOPM-001",
            mall_state: 1, weight: 200, length: 25, width: 15, height: 10,
            stop_purchase: 1,
            cost_info: { cost_price: "19.99", currency: "MXN" },
            stock_info_list: [{ inventory_num: "100" }]
        }],
        shelf_require: "0",
        shelf_way: "1"
    }]
};

// API actions
const API_ACTIONS = [
    { value: 'publish', label: '📦 发布产品 (publishOrEdit)', desc: '提交产品 JSON 到 SHEIN' },
    { value: 'attributes', label: '📋 查询属性模板', desc: '查询 product_type_id 的属性' },
    { value: 'categories', label: '🗂️ 查询类目树', desc: '获取 SHEIN 类目结构' },
    { value: 'fill-standard', label: '📏 填写标准查询', desc: '查询发布填写标准' },
];

interface LogEntry {
    id: number;
    time: string;
    action: string;
    store: string;
    status: 'success' | 'error' | 'pending';
    code: string;
    msg: string;
    request?: string;
    response?: string;
    duration?: number;
}

export default function SheinApiTester() {
    const [jsonInput, setJsonInput] = useState(JSON.stringify(SAMPLE_JSON, null, 2));
    const [selectedStore, setSelectedStore] = useState(0);
    const [selectedAction, setSelectedAction] = useState('publish');
    const [loading, setLoading] = useState(false);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [expandedLog, setExpandedLog] = useState<number | null>(null);
    const [jsonError, setJsonError] = useState<string | null>(null);
    const logIdRef = useRef(0);

    // 验证 JSON
    const validateJson = (text: string): boolean => {
        try {
            JSON.parse(text);
            setJsonError(null);
            return true;
        } catch (e) {
            setJsonError((e as Error).message);
            return false;
        }
    };

    // 发送 API 请求（通过 Vercel 代理）
    const handleSubmit = async () => {
        if (!validateJson(jsonInput)) return;

        const store = TEST_STORES[selectedStore];
        const body = JSON.parse(jsonInput);
        const startTime = Date.now();
        const logId = ++logIdRef.current;

        // 添加 pending log
        const pendingLog: LogEntry = {
            id: logId,
            time: new Date().toLocaleTimeString('zh-CN'),
            action: selectedAction,
            store: store.name,
            status: 'pending',
            code: '...',
            msg: '请求中...',
            request: JSON.stringify(body, null, 2),
        };
        setLogs(prev => [pendingLog, ...prev]);
        setLoading(true);

        try {
            const res = await fetch('/api/shein', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: selectedAction,
                    body: body,
                    // 传递自定义 Key（如果需要覆盖默认 Key）
                    openKey: store.key,
                    secretKey: store.secret,
                }),
            });

            const data = await res.json();
            const duration = Date.now() - startTime;
            const apiCode = data?.data?.code || data?.code || 'unknown';
            const apiMsg = data?.data?.msg || data?.msg || '无返回消息';
            const isSuccess = apiCode === '0' || apiCode === 0;

            setLogs(prev => prev.map(l => l.id === logId ? {
                ...l,
                status: isSuccess ? 'success' : 'error',
                code: String(apiCode),
                msg: apiMsg,
                response: JSON.stringify(data?.data || data, null, 2),
                duration,
            } : l));

            // 自动展开最新结果
            setExpandedLog(logId);
        } catch (e) {
            const duration = Date.now() - startTime;
            setLogs(prev => prev.map(l => l.id === logId ? {
                ...l,
                status: 'error',
                code: 'NETWORK',
                msg: (e as Error).message,
                duration,
            } : l));
            setExpandedLog(logId);
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    const handleFormatJson = () => {
        try {
            const parsed = JSON.parse(jsonInput);
            setJsonInput(JSON.stringify(parsed, null, 2));
            setJsonError(null);
        } catch (e) {
            setJsonError((e as Error).message);
        }
    };

    const handleLoadSample = () => {
        setJsonInput(JSON.stringify(SAMPLE_JSON, null, 2));
        setJsonError(null);
    };

    return (
        <div>
            <div className="page-header">
                <h1>🧪 API 测试工具</h1>
                <p>直接向 SHEIN API 提交产品 JSON 并查看返回结果</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-lg)', alignItems: 'start' }}>
                {/* 左侧：输入区 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                    {/* 操作和店铺选择 */}
                    <div className="card" style={{ padding: 'var(--space-md)' }}>
                        <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
                            {/* API 操作 */}
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px', display: 'block' }}>
                                    API 操作
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <select
                                        id="api-action-select"
                                        value={selectedAction}
                                        onChange={e => setSelectedAction(e.target.value)}
                                        style={{
                                            width: '100%', padding: '10px 32px 10px 12px',
                                            background: 'var(--color-bg-input)', border: '1px solid var(--color-border)',
                                            borderRadius: 'var(--radius-md)', fontSize: '0.85rem',
                                            color: 'var(--color-text-primary)', appearance: 'none',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        {API_ACTIONS.map(a => (
                                            <option key={a.value} value={a.value}>{a.label}</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--color-text-muted)' }} />
                                </div>
                            </div>

                            {/* 店铺选择 */}
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px', display: 'block' }}>
                                    测试店铺
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <select
                                        id="store-select"
                                        value={selectedStore}
                                        onChange={e => setSelectedStore(Number(e.target.value))}
                                        style={{
                                            width: '100%', padding: '10px 32px 10px 12px',
                                            background: 'var(--color-bg-input)', border: '1px solid var(--color-border)',
                                            borderRadius: 'var(--radius-md)', fontSize: '0.85rem',
                                            color: 'var(--color-text-primary)', appearance: 'none',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        {TEST_STORES.map((s, i) => (
                                            <option key={i} value={i}>{s.name}</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--color-text-muted)' }} />
                                </div>
                            </div>
                        </div>

                        {/* Key 预览 */}
                        <div style={{
                            padding: '8px 12px', background: 'var(--color-bg-input)',
                            borderRadius: 'var(--radius-sm)', fontSize: '0.7rem',
                            color: 'var(--color-text-muted)', fontFamily: 'monospace',
                        }}>
                            <span style={{ color: 'var(--color-text-secondary)' }}>OpenKey:</span> {TEST_STORES[selectedStore].key.slice(0, 8)}...
                            <span style={{ margin: '0 8px' }}>|</span>
                            <span style={{ color: 'var(--color-text-secondary)' }}>Site:</span> {TEST_STORES[selectedStore].site}
                        </div>
                    </div>

                    {/* JSON 编辑器 */}
                    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                        {/* 工具栏 */}
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '8px 14px',
                            borderBottom: '1px solid var(--color-border)',
                            background: 'var(--color-bg-secondary)',
                        }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                                📝 请求 Body (JSON)
                            </span>
                            <div style={{ display: 'flex', gap: '4px' }}>
                                <button
                                    id="btn-format-json"
                                    className="btn btn-secondary btn-sm"
                                    onClick={handleFormatJson}
                                    style={{ padding: '4px 10px', fontSize: '0.72rem' }}
                                >
                                    格式化
                                </button>
                                <button
                                    id="btn-load-sample"
                                    className="btn btn-secondary btn-sm"
                                    onClick={handleLoadSample}
                                    style={{ padding: '4px 10px', fontSize: '0.72rem' }}
                                >
                                    加载示例
                                </button>
                                <button
                                    id="btn-copy-json"
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => handleCopy(jsonInput)}
                                    style={{ padding: '4px 10px', fontSize: '0.72rem' }}
                                >
                                    <Copy size={12} />
                                </button>
                            </div>
                        </div>

                        {/* 编辑器 */}
                        <textarea
                            id="json-input"
                            value={jsonInput}
                            onChange={e => {
                                setJsonInput(e.target.value);
                                if (jsonError) validateJson(e.target.value);
                            }}
                            spellCheck={false}
                            style={{
                                width: '100%', minHeight: '400px', maxHeight: '600px',
                                padding: '14px', border: 'none', outline: 'none',
                                background: 'var(--color-bg-primary)',
                                color: 'var(--color-text-primary)',
                                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                fontSize: '0.78rem', lineHeight: 1.6, resize: 'vertical',
                                ...(jsonError ? { boxShadow: 'inset 0 0 0 2px var(--color-danger)' } : {}),
                            }}
                        />

                        {/* JSON 错误提示 */}
                        {jsonError && (
                            <div style={{
                                padding: '8px 14px', background: 'rgba(239, 68, 68, 0.08)',
                                borderTop: '1px solid rgba(239, 68, 68, 0.2)',
                                fontSize: '0.75rem', color: 'var(--color-danger)',
                                display: 'flex', alignItems: 'center', gap: '6px',
                            }}>
                                <AlertTriangle size={13} />
                                JSON 格式错误: {jsonError}
                            </div>
                        )}
                    </div>

                    {/* 提交按钮 */}
                    <button
                        id="btn-submit"
                        className="btn btn-primary"
                        onClick={handleSubmit}
                        disabled={loading || !!jsonError}
                        style={{
                            padding: '14px', fontSize: '0.9rem', fontWeight: 600,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                        }}
                    >
                        {loading ? (
                            <><RotateCw size={16} className="spin" /> 请求中...</>
                        ) : (
                            <><Send size={16} /> 发送请求</>
                        )}
                    </button>
                </div>

                {/* 右侧：结果区 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                    {/* 统计 */}
                    <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                        <div style={{
                            flex: 1, padding: '12px', background: 'var(--color-bg-card)',
                            borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)',
                            textAlign: 'center',
                        }}>
                            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-accent)' }}>
                                {logs.length}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>总请求</div>
                        </div>
                        <div style={{
                            flex: 1, padding: '12px', background: 'var(--color-bg-card)',
                            borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)',
                            textAlign: 'center',
                        }}>
                            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-success)' }}>
                                {logs.filter(l => l.status === 'success').length}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>成功</div>
                        </div>
                        <div style={{
                            flex: 1, padding: '12px', background: 'var(--color-bg-card)',
                            borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)',
                            textAlign: 'center',
                        }}>
                            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-danger)' }}>
                                {logs.filter(l => l.status === 'error').length}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>失败</div>
                        </div>
                    </div>

                    {/* 日志列表 */}
                    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '10px 14px',
                            borderBottom: '1px solid var(--color-border)',
                            background: 'var(--color-bg-secondary)',
                        }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                                📋 请求日志
                            </span>
                            {logs.length > 0 && (
                                <button
                                    id="btn-clear-logs"
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => { setLogs([]); setExpandedLog(null); }}
                                    style={{ padding: '3px 8px', fontSize: '0.7rem' }}
                                >
                                    <Trash2 size={11} /> 清空
                                </button>
                            )}
                        </div>

                        <div style={{ maxHeight: '650px', overflowY: 'auto' }}>
                            {logs.length === 0 ? (
                                <div style={{
                                    padding: '40px 20px', textAlign: 'center',
                                    color: 'var(--color-text-muted)', fontSize: '0.85rem',
                                }}>
                                    <Info size={32} style={{ marginBottom: '12px', opacity: 0.3 }} />
                                    <p>尚无请求记录</p>
                                    <p style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                                        编辑 JSON 并点击「发送请求」开始测试
                                    </p>
                                </div>
                            ) : (
                                logs.map(log => (
                                    <div key={log.id}>
                                        {/* 日志条目 */}
                                        <div
                                            onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                                            style={{
                                                padding: '10px 14px',
                                                borderBottom: '1px solid var(--color-border)',
                                                cursor: 'pointer',
                                                transition: 'background 0.15s',
                                                background: expandedLog === log.id ? 'var(--color-bg-input)' : 'transparent',
                                            }}
                                            onMouseEnter={e => { if (expandedLog !== log.id) e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
                                            onMouseLeave={e => { if (expandedLog !== log.id) e.currentTarget.style.background = 'transparent'; }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                {/* 状态图标 */}
                                                {log.status === 'success' && <CheckCircle size={15} style={{ color: 'var(--color-success)', flexShrink: 0 }} />}
                                                {log.status === 'error' && <AlertTriangle size={15} style={{ color: 'var(--color-danger)', flexShrink: 0 }} />}
                                                {log.status === 'pending' && <RotateCw size={15} className="spin" style={{ color: 'var(--color-accent)', flexShrink: 0 }} />}

                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                                                        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                                                            {API_ACTIONS.find(a => a.value === log.action)?.label || log.action}
                                                        </span>
                                                        <span style={{
                                                            fontSize: '0.65rem', padding: '1px 6px',
                                                            borderRadius: '4px', fontFamily: 'monospace',
                                                            background: log.status === 'success' ? 'rgba(16, 185, 129, 0.12)' : log.status === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(99, 102, 241, 0.1)',
                                                            color: log.status === 'success' ? 'var(--color-success)' : log.status === 'error' ? 'var(--color-danger)' : 'var(--color-accent)',
                                                        }}>
                                                            {log.code}
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {log.msg}
                                                    </div>
                                                </div>

                                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                    <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                        <Clock size={10} /> {log.time}
                                                    </div>
                                                    {log.duration && (
                                                        <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                                                            {log.duration}ms
                                                        </div>
                                                    )}
                                                </div>

                                                <ChevronDown size={14} style={{
                                                    color: 'var(--color-text-muted)',
                                                    transform: expandedLog === log.id ? 'rotate(180deg)' : 'none',
                                                    transition: 'transform 0.2s',
                                                    flexShrink: 0,
                                                }} />
                                            </div>
                                        </div>

                                        {/* 展开详情 */}
                                        {expandedLog === log.id && (
                                            <div style={{
                                                padding: '12px 14px',
                                                borderBottom: '1px solid var(--color-border)',
                                                background: 'var(--color-bg-primary)',
                                            }}>
                                                {/* 错误信息高亮 */}
                                                {log.status === 'error' && (
                                                    <div style={{
                                                        padding: '10px 14px', marginBottom: '10px',
                                                        borderRadius: 'var(--radius-md)',
                                                        background: 'rgba(239, 68, 68, 0.06)',
                                                        border: '1px solid rgba(239, 68, 68, 0.15)',
                                                    }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                                            <AlertTriangle size={14} style={{ color: 'var(--color-danger)' }} />
                                                            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-danger)' }}>
                                                                错误代码: {log.code}
                                                            </span>
                                                        </div>
                                                        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-primary)', margin: 0, lineHeight: 1.5 }}>
                                                            {log.msg}
                                                        </p>
                                                    </div>
                                                )}

                                                {/* 成功信息 */}
                                                {log.status === 'success' && (
                                                    <div style={{
                                                        padding: '10px 14px', marginBottom: '10px',
                                                        borderRadius: 'var(--radius-md)',
                                                        background: 'rgba(16, 185, 129, 0.06)',
                                                        border: '1px solid rgba(16, 185, 129, 0.15)',
                                                    }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <CheckCircle size={14} style={{ color: 'var(--color-success)' }} />
                                                            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-success)' }}>
                                                                请求成功
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* 店铺信息 */}
                                                <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginBottom: '8px' }}>
                                                    店铺: {log.store} | 耗时: {log.duration || '?'}ms
                                                </div>

                                                {/* 响应 JSON */}
                                                {log.response && (
                                                    <div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                                                                响应数据
                                                            </span>
                                                            <button
                                                                className="btn btn-secondary btn-sm"
                                                                onClick={() => handleCopy(log.response || '')}
                                                                style={{ padding: '2px 6px', fontSize: '0.65rem' }}
                                                            >
                                                                <Copy size={10} /> 复制
                                                            </button>
                                                        </div>
                                                        <pre style={{
                                                            background: 'var(--color-bg-input)',
                                                            padding: '10px 12px',
                                                            borderRadius: 'var(--radius-sm)',
                                                            fontSize: '0.72rem',
                                                            lineHeight: 1.5,
                                                            overflowX: 'auto',
                                                            color: 'var(--color-text-primary)',
                                                            maxHeight: '300px',
                                                            margin: 0,
                                                        }}>
                                                            {log.response}
                                                        </pre>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
