import { useState, useCallback, useRef } from 'react';
import {
    Download, Loader, AlertTriangle, CheckCircle,
    XCircle, Trash2, FileSpreadsheet, Package, Play, Pause, RotateCcw,
} from 'lucide-react';
import { parseFile } from '../services/batchParserService';
import type { ParsedProduct } from '../services/batchParserService';
import {
    hasGeminiAccess, processProduct,
    buildSheinJsonFromResult, buildTiktokJsonFromResult,
} from '../services/geminiService';
import type { ProcessProductResult } from '../services/geminiService';
import { downloadJsonFile } from '../services/sheinApiService';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

// ===== 类型 =====

type ItemStatus = 'pending' | 'processing' | 'done' | 'error';

interface BatchItem extends ParsedProduct {
    status: ItemStatus;
    progress: string;
    result?: ProcessProductResult;
    sheinJson?: Record<string, unknown>;
    tiktokJson?: Record<string, unknown>;
    error?: string;
}

// ===== 主页面 =====

export default function BatchJsonGenerator() {
    // 文件上传
    const [fileName, setFileName] = useState<string>('');
    const [parsing, setParsing] = useState(false);
    const [parseError, setParseError] = useState('');
    const [dragOver, setDragOver] = useState(false);

    // 产品队列
    const [items, setItems] = useState<BatchItem[]>([]);

    // 平台选择
    const [platform, setPlatform] = useState<'tiktok' | 'shein' | 'both'>('tiktok');

    // 批量处理
    const [processing, setProcessing] = useState(false);
    const [paused, setPaused] = useState(false);
    const pausedRef = useRef(false);
    const [currentIdx, setCurrentIdx] = useState(-1);

    // 统计
    const doneCount = items.filter(i => i.status === 'done').length;
    const errorCount = items.filter(i => i.status === 'error').length;
    const totalCount = items.length;

    // ===== 文件处理 =====

    const handleFile = useCallback(async (file: File) => {
        setParsing(true);
        setParseError('');
        setFileName(file.name);
        setItems([]);

        try {
            const products = await parseFile(file);
            if (products.length === 0) {
                setParseError('文件中没有找到产品数据');
                return;
            }
            setItems(products.map(p => ({
                ...p,
                status: 'pending' as ItemStatus,
                progress: '',
            })));
        } catch (err) {
            setParseError(err instanceof Error ? err.message : '文件解析失败');
        } finally {
            setParsing(false);
        }
    }, []);

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    };

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
    };

    const removeItem = (id: string) => {
        setItems(prev => prev.filter(i => i.id !== id));
    };

    // ===== 批量处理 =====

    const startBatchProcess = async () => {
        setProcessing(true);
        setPaused(false);
        pausedRef.current = false;

        const pendingItems = items.filter(i => i.status === 'pending' || i.status === 'error');

        for (let i = 0; i < pendingItems.length; i++) {
            if (pausedRef.current) break;

            const item = pendingItems[i];
            const itemIndex = items.findIndex(x => x.id === item.id);
            setCurrentIdx(itemIndex);

            // 更新状态为 processing
            setItems(prev => prev.map(x =>
                x.id === item.id ? { ...x, status: 'processing' as ItemStatus, progress: '准备中...', error: undefined } : x
            ));

            try {
                // 调用完整的产品处理流程
                const result = await processProduct(
                    item.images || [],
                    item.name,
                    (msg) => {
                        setItems(prev => prev.map(x =>
                            x.id === item.id ? { ...x, progress: msg } : x
                        ));
                    }
                );

                // 构建 JSON
                let sheinJson: Record<string, unknown> | undefined;
                let tiktokJson: Record<string, unknown> | undefined;

                if (platform === 'shein' || platform === 'both') {
                    const sj = buildSheinJsonFromResult(result, item.sku, item.price || result.productData.price, item.stock ?? 100, item.images || []);
                    if (sj) sheinJson = sj;
                }

                if (platform === 'tiktok' || platform === 'both') {
                    const tj = buildTiktokJsonFromResult(result, item.sku, item.price || result.productData.price, item.stock ?? 100);
                    if (tj) tiktokJson = tj;
                }

                setItems(prev => prev.map(x =>
                    x.id === item.id ? {
                        ...x,
                        status: 'done' as ItemStatus,
                        progress: '✅ 完成',
                        result,
                        sheinJson,
                        tiktokJson,
                    } : x
                ));
            } catch (err) {
                setItems(prev => prev.map(x =>
                    x.id === item.id ? {
                        ...x,
                        status: 'error' as ItemStatus,
                        progress: '',
                        error: err instanceof Error ? err.message : '处理失败',
                    } : x
                ));
            }

            // 间隔 1 秒避免限流
            if (i < pendingItems.length - 1 && !pausedRef.current) {
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        setProcessing(false);
        setCurrentIdx(-1);
    };

    const togglePause = () => {
        pausedRef.current = !pausedRef.current;
        setPaused(pausedRef.current);
    };

    const resetAll = () => {
        setItems(prev => prev.map(i => ({ ...i, status: 'pending' as ItemStatus, progress: '', result: undefined, sheinJson: undefined, tiktokJson: undefined, error: undefined })));
    };

    // ===== 下载 =====

    const downloadSingle = (item: BatchItem, type: 'shein' | 'tiktok') => {
        const json = type === 'shein' ? item.sheinJson : item.tiktokJson;
        if (!json) return;
        downloadJsonFile(json, `${type}_${item.sku}.json`);
    };

    const downloadAllAsZip = async () => {
        const zip = new JSZip();
        const doneItems = items.filter(i => i.status === 'done');

        for (const item of doneItems) {
            if (item.sheinJson) {
                zip.file(`shein_${item.sku}.json`, JSON.stringify(item.sheinJson, null, 2));
            }
            if (item.tiktokJson) {
                zip.file(`tiktok_${item.sku}.json`, JSON.stringify(item.tiktokJson, null, 2));
            }
        }

        const blob = await zip.generateAsync({ type: 'blob' });
        const timestamp = new Date().toISOString().slice(0, 10);
        saveAs(blob, `batch_json_${timestamp}.zip`);
    };

    // ===== 渲染 =====

    const hasGemini = hasGeminiAccess();

    const statusIcon = (status: ItemStatus) => {
        switch (status) {
            case 'pending': return <span style={{ color: 'var(--color-text-muted)', fontSize: '0.7rem' }}>⏳</span>;
            case 'processing': return <Loader size={13} className="spin" style={{ color: 'var(--color-accent)' }} />;
            case 'done': return <CheckCircle size={13} style={{ color: '#10b981' }} />;
            case 'error': return <XCircle size={13} style={{ color: '#ef4444' }} />;
        }
    };

    const statusLabel = (item: BatchItem) => {
        switch (item.status) {
            case 'pending': return '待处理';
            case 'processing': return item.progress || '处理中...';
            case 'done': {
                const parts: string[] = [];
                if (item.result?.sheinCategory) parts.push(`SHEIN:${item.result.sheinMatchedAttrs.length}属性`);
                if (item.result?.tiktokCategory) parts.push(`TikTok:${item.result.tiktokMatchedAttrs.length}属性`);
                return parts.join(' | ') || '✅ 完成';
            }
            case 'error': return item.error || '失败';
        }
    };

    return (
        <div>
            <div className="page-header">
                <h1>📦 批量 JSON 生成</h1>
                <p>上传 Excel / PDF → AI 自动识别产品 → 批量生成上架 JSON 文件</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: items.length > 0 ? '1fr 320px' : '1fr', gap: 'var(--space-lg)', alignItems: 'start' }}>

                {/* ===== 左栏：主操作区 ===== */}
                <div>
                    {/* 文件上传 */}
                    <div className="card" style={{ marginBottom: 'var(--space-md)' }}>
                        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: 'var(--space-sm)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ background: 'var(--color-accent)', color: '#fff', width: 22, height: 22, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700 }}>1</span>
                            上传文件
                        </h3>

                        <div
                            className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
                            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={handleDrop}
                            onClick={() => document.getElementById('batch-file-input')?.click()}
                            style={{
                                border: '2px dashed var(--color-border)',
                                borderRadius: 'var(--radius-md)',
                                padding: 'var(--space-lg)',
                                textAlign: 'center',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                background: dragOver ? 'var(--color-accent-light)' : 'transparent',
                            }}
                        >
                            {parsing ? (
                                <><Loader size={24} className="spin" style={{ color: 'var(--color-accent)', marginBottom: '4px' }} />
                                    <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>正在解析文件...</p></>
                            ) : (
                                <>
                                    <FileSpreadsheet size={28} style={{ color: 'var(--color-text-muted)', marginBottom: '6px' }} />
                                    <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>拖拽或点击上传</p>
                                    <p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>支持 Excel (.xlsx / .xls) 和 PDF</p>
                                </>
                            )}
                            <input
                                id="batch-file-input"
                                type="file"
                                accept=".xlsx,.xls,.csv,.pdf"
                                onChange={handleFileInput}
                                style={{ display: 'none' }}
                            />
                        </div>

                        {fileName && !parseError && (
                            <p style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: '6px' }}>
                                📄 {fileName} — {totalCount} 个产品
                            </p>
                        )}

                        {parseError && (
                            <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 'var(--radius-sm)', marginTop: '8px', fontSize: '0.75rem', color: '#ef4444' }}>
                                <AlertTriangle size={12} style={{ verticalAlign: 'middle' }} /> {parseError}
                            </div>
                        )}
                    </div>

                    {/* 平台选择 + 操作 */}
                    {items.length > 0 && (
                        <div className="card" style={{ marginBottom: 'var(--space-md)' }}>
                            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: 'var(--space-sm)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ background: 'var(--color-secondary)', color: '#fff', width: 22, height: 22, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700 }}>2</span>
                                批量处理
                            </h3>

                            {/* 平台选择 */}
                            <div style={{ display: 'flex', gap: '6px', marginBottom: 'var(--space-sm)' }}>
                                {(['tiktok', 'shein', 'both'] as const).map(p => (
                                    <button
                                        key={p}
                                        onClick={() => setPlatform(p)}
                                        style={{
                                            flex: 1,
                                            padding: '8px 12px',
                                            fontSize: '0.78rem',
                                            fontWeight: 600,
                                            border: platform === p
                                                ? p === 'tiktok' ? '2px solid #ff004f' : p === 'shein' ? '2px solid #10b981' : '2px solid var(--color-accent)'
                                                : '2px solid var(--color-border)',
                                            background: platform === p
                                                ? p === 'tiktok' ? 'rgba(255,0,79,0.06)' : p === 'shein' ? 'rgba(16,185,129,0.08)' : 'var(--color-accent-light)'
                                                : 'transparent',
                                            color: platform === p
                                                ? p === 'tiktok' ? '#ff004f' : p === 'shein' ? '#10b981' : 'var(--color-accent)'
                                                : 'var(--color-text-muted)',
                                            cursor: 'pointer',
                                            borderRadius: 'var(--radius-sm)',
                                            transition: 'all 0.2s',
                                        }}
                                    >
                                        {p === 'tiktok' ? '🎵 TikTok' : p === 'shein' ? '🛍️ SHEIN' : '📦 双平台'}
                                    </button>
                                ))}
                            </div>

                            {!hasGemini && (
                                <div style={{ padding: '8px 12px', background: 'rgba(251,191,36,0.08)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-sm)', fontSize: '0.75rem', color: '#b45309' }}>
                                    <AlertTriangle size={12} style={{ verticalAlign: 'middle' }} /> 需要 Gemini API
                                </div>
                            )}

                            {/* 进度条 */}
                            {(processing || doneCount > 0) && (
                                <div style={{ marginBottom: 'var(--space-sm)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
                                        <span>{doneCount} / {totalCount} 完成</span>
                                        {errorCount > 0 && <span style={{ color: '#ef4444' }}>{errorCount} 失败</span>}
                                    </div>
                                    <div style={{ height: '6px', background: 'var(--color-bg-input)', borderRadius: '3px', overflow: 'hidden' }}>
                                        <div style={{
                                            height: '100%',
                                            width: `${totalCount > 0 ? ((doneCount + errorCount) / totalCount) * 100 : 0}%`,
                                            background: errorCount > 0 ? 'linear-gradient(90deg, #10b981, #ef4444)' : 'var(--color-accent)',
                                            borderRadius: '3px',
                                            transition: 'width 0.3s',
                                        }} />
                                    </div>
                                </div>
                            )}

                            {/* 操作按钮 */}
                            <div style={{ display: 'flex', gap: '6px' }}>
                                {!processing ? (
                                    <button
                                        className="btn btn-primary"
                                        onClick={startBatchProcess}
                                        disabled={items.filter(i => i.status === 'pending' || i.status === 'error').length === 0 || !hasGemini}
                                        style={{ flex: 1 }}
                                    >
                                        <Play size={14} /> 🚀 开始批量生成
                                    </button>
                                ) : (
                                    <button className="btn btn-secondary" onClick={togglePause} style={{ flex: 1 }}>
                                        {paused ? <><Play size={14} /> 继续</> : <><Pause size={14} /> 暂停</>}
                                    </button>
                                )}

                                {doneCount > 0 && !processing && (
                                    <button className="btn btn-primary" onClick={downloadAllAsZip} style={{ flex: 1 }}>
                                        <Package size={14} /> 📦 打包下载 ({doneCount})
                                    </button>
                                )}

                                {(doneCount > 0 || errorCount > 0) && !processing && (
                                    <button className="btn btn-secondary" onClick={resetAll} title="重置所有">
                                        <RotateCcw size={14} />
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* 产品队列表格 */}
                    {items.length > 0 && (
                        <div className="card">
                            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: 'var(--space-sm)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ background: '#10b981', color: '#fff', width: 22, height: 22, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700 }}>3</span>
                                产品队列 ({totalCount})
                            </h3>

                            <div style={{ maxHeight: '500px', overflow: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                                    <thead>
                                        <tr style={{ background: 'var(--color-bg-secondary)', position: 'sticky', top: 0, zIndex: 1 }}>
                                            <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.68rem', width: '28px' }}>#</th>
                                            <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.68rem' }}>状态</th>
                                            <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.68rem' }}>SKU</th>
                                            <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.68rem' }}>产品名称</th>
                                            <th style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.68rem', width: '60px' }}>价格</th>
                                            <th style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.68rem', width: '60px' }}>操作</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map((item, idx) => (
                                            <tr
                                                key={item.id}
                                                style={{
                                                    borderBottom: '1px solid var(--color-border)',
                                                    background: currentIdx === idx ? 'rgba(99,102,241,0.08)' : undefined,
                                                    transition: 'background 0.2s',
                                                }}
                                            >
                                                <td style={{ padding: '8px 10px', color: 'var(--color-text-muted)', fontSize: '0.7rem' }}>{idx + 1}</td>
                                                <td style={{ padding: '8px 10px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        {statusIcon(item.status)}
                                                        <span style={{
                                                            fontSize: '0.68rem',
                                                            color: item.status === 'error' ? '#ef4444'
                                                                : item.status === 'done' ? '#10b981'
                                                                    : item.status === 'processing' ? 'var(--color-accent)'
                                                                        : 'var(--color-text-muted)',
                                                            maxWidth: '200px',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap',
                                                        }}>
                                                            {statusLabel(item)}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '8px 10px', fontWeight: 600, fontSize: '0.72rem', color: 'var(--color-text-primary)', fontFamily: 'monospace' }}>
                                                    {item.sku}
                                                </td>
                                                <td style={{ padding: '8px 10px', fontSize: '0.72rem', color: 'var(--color-text-primary)', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {item.name}
                                                </td>
                                                <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: '0.72rem', color: 'var(--color-text-secondary)' }}>
                                                    {item.price ? `$${item.price.toFixed(2)}` : '—'}
                                                </td>
                                                <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                    <div style={{ display: 'flex', gap: '3px', justifyContent: 'center' }}>
                                                        {item.status === 'done' && (
                                                            <>
                                                                {item.tiktokJson && (
                                                                    <button
                                                                        className="btn btn-secondary btn-sm"
                                                                        style={{ fontSize: '0.55rem', padding: '2px 5px' }}
                                                                        onClick={() => downloadSingle(item, 'tiktok')}
                                                                        title="下载 TikTok JSON"
                                                                    >
                                                                        <Download size={9} />
                                                                    </button>
                                                                )}
                                                                {item.sheinJson && (
                                                                    <button
                                                                        className="btn btn-secondary btn-sm"
                                                                        style={{ fontSize: '0.55rem', padding: '2px 5px' }}
                                                                        onClick={() => downloadSingle(item, 'shein')}
                                                                        title="下载 SHEIN JSON"
                                                                    >
                                                                        <Download size={9} />
                                                                    </button>
                                                                )}
                                                            </>
                                                        )}
                                                        {!processing && (
                                                            <button
                                                                className="btn btn-secondary btn-sm"
                                                                style={{ fontSize: '0.55rem', padding: '2px 5px', color: '#ef4444' }}
                                                                onClick={() => removeItem(item.id)}
                                                                title="移除"
                                                            >
                                                                <Trash2 size={9} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                {/* ===== 右栏：说明和统计 ===== */}
                {items.length > 0 && (
                    <div style={{ position: 'sticky', top: 'var(--space-md)' }}>
                        {/* 统计 */}
                        <div className="card" style={{ marginBottom: 'var(--space-md)' }}>
                            <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                📊 批量统计
                            </h4>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                {[
                                    { label: '总产品数', value: totalCount, color: 'var(--color-text-primary)' },
                                    { label: '已完成', value: doneCount, color: '#10b981' },
                                    { label: '失败', value: errorCount, color: '#ef4444' },
                                    { label: '待处理', value: items.filter(i => i.status === 'pending').length, color: 'var(--color-text-muted)' },
                                ].map((s, i) => (
                                    <div key={i} style={{ padding: '10px', background: 'var(--color-bg-input)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                                        <div style={{ fontSize: '1.2rem', fontWeight: 700, color: s.color }}>{s.value}</div>
                                        <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>{s.label}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 已完成产品 JSON 预览 */}
                        {doneCount > 0 && (
                            <div className="card" style={{ marginBottom: 'var(--space-md)' }}>
                                <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '10px' }}>
                                    ✅ 已生成 JSON ({doneCount})
                                </h4>
                                <div style={{ maxHeight: '350px', overflow: 'auto' }}>
                                    {items.filter(i => i.status === 'done').map(item => (
                                        <div key={item.id} style={{ padding: '8px 10px', marginBottom: '4px', background: 'var(--color-bg-input)', borderRadius: 'var(--radius-sm)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                                                    {item.sku}
                                                </span>
                                                <div style={{ display: 'flex', gap: '3px' }}>
                                                    {item.tiktokJson && (
                                                        <button className="btn btn-secondary btn-sm" style={{ fontSize: '0.55rem', padding: '2px 6px' }} onClick={() => downloadSingle(item, 'tiktok')}>
                                                            <Download size={8} /> TikTok
                                                        </button>
                                                    )}
                                                    {item.sheinJson && (
                                                        <button className="btn btn-secondary btn-sm" style={{ fontSize: '0.55rem', padding: '2px 6px' }} onClick={() => downloadSingle(item, 'shein')}>
                                                            <Download size={8} /> SHEIN
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                            <div style={{ fontSize: '0.62rem', color: 'var(--color-text-muted)' }}>
                                                {item.result?.tiktokCategory && (
                                                    <span>🎵 {item.result.tiktokCategory.name} ({item.result.tiktokMatchedAttrs.length}属性)</span>
                                                )}
                                                {item.result?.sheinCategory && (
                                                    <span style={{ marginLeft: '8px' }}>🛍️ {item.result.sheinCategory.label?.split(' → ').pop()} ({item.result.sheinMatchedAttrs.length}属性)</span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Excel 格式说明 */}
                        <div className="card">
                            <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px' }}>
                                📋 Excel 格式说明
                            </h4>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.68rem' }}>
                                <thead>
                                    <tr style={{ background: 'var(--color-bg-secondary)' }}>
                                        <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 600, color: 'var(--color-text-muted)' }}>列名</th>
                                        <th style={{ padding: '4px 8px', textAlign: 'center', fontWeight: 600, color: 'var(--color-text-muted)' }}>必填</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[
                                        { col: 'SKU / 产品编号', req: true },
                                        { col: '产品名称 / Name / Title', req: true },
                                        { col: '价格 / Price', req: false },
                                        { col: '库存 / Stock', req: false },
                                        { col: '描述 / Description', req: false },
                                        { col: '图片 / Image URL', req: false },
                                    ].map((r, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                            <td style={{ padding: '4px 8px', color: 'var(--color-text-primary)' }}>{r.col}</td>
                                            <td style={{ padding: '4px 8px', textAlign: 'center', color: r.req ? '#ef4444' : 'var(--color-text-muted)' }}>
                                                {r.req ? '✅' : '可选'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <p style={{ fontSize: '0.62rem', color: 'var(--color-text-muted)', marginTop: '6px' }}>
                                💡 支持中文、英语、西班牙语列名自动匹配
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
