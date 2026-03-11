/**
 * 验证修复面板 + 属性编辑器
 *
 * 导出：
 * - default: ValidationFixPanel（验证→修复面板）
 * - ManualAttributeEditor（通用属性编辑器，用于 JsonGenerator 内联编辑）
 * - MatchedAttribute, TemplateAttribute（类型）
 */

import { useState } from 'react';
import {
    Loader, AlertTriangle, CheckCircle, Send,
    RefreshCw, ChevronDown, ChevronUp, AlertOctagon,
    Edit3, Image, Tag, Package,
} from 'lucide-react';
import { submitForValidation } from '../services/productionApiService';
import type {
    ValidationError, ManualAttributeItem, ProductionApiResponse,
} from '../services/productionApiService';

// ===== 兼容旧版类型导出 =====

export interface MatchedAttribute {
    attribute_id: number | string;
    attribute_value_id?: number | string;
    value_id?: string;
    attribute_extra_value?: string;
    custom_attribute_value?: string;
    value_name?: string;
    _display_name?: string;
    _display_value?: string;
}

export interface TemplateAttribute {
    id: number | string;
    name: string;
    required?: boolean;
    values?: Array<{ id: number | string; name: string }>;
    [key: string]: unknown;
}

// ===== 通用属性编辑器（兼容旧版 JsonGenerator 调用） =====

interface ManualAttributeEditorProps {
    matchedAttrs: MatchedAttribute[];
    templateAttrs: TemplateAttribute[];
    productData: Record<string, unknown>;
    onAttributesUpdated: (updated: MatchedAttribute[]) => void;
    platform: string;
}

export function ManualAttributeEditor({
    matchedAttrs,
    templateAttrs: _templateAttrs,
    productData: _productData,
    onAttributesUpdated,
    platform,
}: ManualAttributeEditorProps) {
    const [attrs, setAttrs] = useState<MatchedAttribute[]>(matchedAttrs);

    const handleRemove = (idx: number) => {
        const next = attrs.filter((_, i) => i !== idx);
        setAttrs(next);
        onAttributesUpdated(next);
    };

    const platformColor = platform === 'tiktok' ? '#ff004f' : '#10b981';

    return (
        <div style={{
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            padding: '8px',
            marginTop: '6px',
            maxHeight: '250px',
            overflow: 'auto',
        }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', marginBottom: '6px' }}>
                已匹配 {attrs.length} 个属性 — 点击 ✕ 可删除
            </div>
            {attrs.map((a, i) => (
                <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '4px 8px', marginBottom: '2px',
                    background: 'var(--color-bg-input)', borderRadius: 'var(--radius-sm)',
                    fontSize: '0.7rem',
                }}>
                    <span>
                        <span style={{ fontWeight: 600, color: platformColor }}>{a._display_name || `ID:${a.attribute_id}`}</span>
                        {' = '}
                        <span style={{ color: 'var(--color-text-primary)' }}>{a._display_value || a.attribute_extra_value || a.value_name || `ID:${a.attribute_value_id || a.value_id}`}</span>
                    </span>
                    <button
                        onClick={() => handleRemove(i)}
                        style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--color-text-muted)', fontSize: '0.7rem', padding: '2px 4px',
                        }}
                    >✕</button>
                </div>
            ))}
        </div>
    );
}

// ===== Props =====

interface ValidationFixPanelProps {
    /** 已生成的 SHEIN JSON */
    generatedJson: Record<string, unknown>;
    /** 修复后回调：将修复的属性数据传回父组件 */
    onFixed: (fixedData: {
        manualAttributes: ManualAttributeItem[];
        saleAttributeFix?: string;
        skuFix?: string;
    }) => void;
    /** 产品相关信息（用于显示） */
    productTitle?: string;
}

// ===== 错误类型的图标和颜色 =====

const ERROR_TYPE_CONFIG: Record<string, { icon: typeof AlertTriangle; color: string; bg: string; label: string }> = {
    missing_attribute: { icon: Edit3, color: '#ef4444', bg: 'rgba(239,68,68,0.08)', label: '缺失必填属性' },
    sale_attribute:    { icon: Tag, color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', label: '销售属性问题' },
    image:             { icon: Image, color: '#8b5cf6', bg: 'rgba(139,92,246,0.08)', label: '图片问题' },
    sku:               { icon: Package, color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', label: 'SKU 问题' },
    other:             { icon: AlertOctagon, color: '#6b7280', bg: 'rgba(107,114,128,0.08)', label: '其他问题' },
};

// ===== 组件 =====

export default function ValidationFixPanel({
    generatedJson,
    onFixed,
    productTitle,
}: ValidationFixPanelProps) {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<ProductionApiResponse | null>(null);
    const [manualAttrs, setManualAttrs] = useState<ManualAttributeItem[]>([]);
    const [skuFix, setSkuFix] = useState('');
    const [showRaw, setShowRaw] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    // 提交验证
    const handleValidate = async () => {
        setLoading(true);
        setSubmitted(false);
        try {
            const response = await submitForValidation(generatedJson);
            setResult(response);
            setManualAttrs(response.manualAttributes);

            // 提取 SKU 问题中的建议
            const skuError = response.errors.find(e => e.type === 'sku');
            if (skuError) {
                // 从当前 JSON 中提取 SKU 用于编辑
                const currentSku = (generatedJson as Record<string, unknown>).supplier_code as string || '';
                setSkuFix(currentSku);
            }
        } catch (err) {
            setResult({
                success: false,
                errors: [{
                    type: 'other', module: 'client', form_name: '客户端',
                    message: err instanceof Error ? err.message : '提交失败',
                    fixable: false,
                }],
                manualAttributes: [],
                raw: {},
            });
        } finally {
            setLoading(false);
        }
    };

    // 更新人工属性值
    const updateAttrValue = (index: number, value: string) => {
        setManualAttrs(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], value };
            return updated;
        });
    };

    // 应用修复
    const handleApplyFix = () => {
        onFixed({
            manualAttributes: manualAttrs.filter(a => a.value.trim() !== ''),
            skuFix: skuFix || undefined,
        });
        setSubmitted(true);
    };

    // 统计
    const errorsByType = result?.errors.reduce((acc, e) => {
        acc[e.type] = (acc[e.type] || 0) + 1;
        return acc;
    }, {} as Record<string, number>) || {};

    const fixableCount = manualAttrs.length + (result?.errors.some(e => e.type === 'sku') ? 1 : 0);
    const filledCount = manualAttrs.filter(a => a.value.trim() !== '').length + (skuFix ? 1 : 0);

    return (
        <div style={{
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            padding: '14px',
            marginTop: '10px',
            background: 'var(--color-bg-secondary)',
        }}>
            {/* 标题 + 验证按钮 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    🔍 正式 API 验证
                    {productTitle && (
                        <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', fontWeight: 400 }}>
                            — {productTitle.slice(0, 30)}
                        </span>
                    )}
                </h4>
                <button
                    className="btn btn-primary btn-sm"
                    onClick={handleValidate}
                    disabled={loading}
                    style={{
                        fontSize: '0.7rem',
                        padding: '5px 12px',
                        display: 'flex', alignItems: 'center', gap: '5px',
                        background: '#6366f1',
                        borderColor: '#6366f1',
                    }}
                >
                    {loading ? <Loader size={12} className="spin" /> : <Send size={12} />}
                    {loading ? '验证中...' : '提交到正式 API 验证'}
                </button>
            </div>

            {/* ===== 验证成功 ===== */}
            {result?.success && (
                <div style={{
                    padding: '12px 14px',
                    background: 'rgba(16,185,129,0.1)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid rgba(16,185,129,0.3)',
                    display: 'flex', alignItems: 'center', gap: '8px',
                    fontSize: '0.82rem', fontWeight: 600, color: '#10b981',
                }}>
                    <CheckCircle size={16} />
                    ✅ 验证通过！所有数据完整，可以正式提交。
                </div>
            )}

            {/* ===== 验证失败 ===== */}
            {result && !result.success && (
                <div>
                    {/* 错误概览 */}
                    <div style={{
                        padding: '8px 12px',
                        background: 'rgba(239,68,68,0.06)',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid rgba(239,68,68,0.2)',
                        marginBottom: '12px',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', fontWeight: 600, color: '#ef4444' }}>
                            <AlertTriangle size={14} />
                            发现 {result.errors.length} 个问题
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            {Object.entries(errorsByType).map(([type, count]) => {
                                const config = ERROR_TYPE_CONFIG[type] || ERROR_TYPE_CONFIG.other;
                                return (
                                    <span key={type} style={{
                                        fontSize: '0.6rem', padding: '2px 6px',
                                        background: config.bg, color: config.color,
                                        borderRadius: '8px', fontWeight: 600,
                                    }}>
                                        {config.label} ×{count}
                                    </span>
                                );
                            })}
                        </div>
                    </div>

                    {/* ===== 缺失属性（最醒目） ===== */}
                    {manualAttrs.length > 0 && (
                        <div style={{
                            marginBottom: '12px',
                            border: '2px solid #ef4444',
                            borderRadius: 'var(--radius-md)',
                            overflow: 'hidden',
                        }}>
                            <div style={{
                                padding: '8px 12px',
                                background: 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(239,68,68,0.05))',
                                borderBottom: '1px solid rgba(239,68,68,0.2)',
                                display: 'flex', alignItems: 'center', gap: '6px',
                            }}>
                                <Edit3 size={14} style={{ color: '#ef4444' }} />
                                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#ef4444' }}>
                                    🚨 以下属性为必填项，请手动填写
                                </span>
                                <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', marginLeft: 'auto' }}>
                                    {filledCount}/{manualAttrs.length} 已填写
                                </span>
                            </div>

                            <div style={{ padding: '10px 12px' }}>
                                {manualAttrs.map((attr, idx) => (
                                    <div key={idx} style={{
                                        display: 'flex', alignItems: 'center', gap: '8px',
                                        marginBottom: idx < manualAttrs.length - 1 ? '8px' : 0,
                                        padding: '8px 10px',
                                        background: attr.value.trim() ? 'rgba(16,185,129,0.05)' : 'rgba(239,68,68,0.04)',
                                        borderRadius: 'var(--radius-sm)',
                                        border: `1px solid ${attr.value.trim() ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                                        transition: 'all 0.2s',
                                    }}>
                                        {/* 属性名 */}
                                        <div style={{ minWidth: '100px', flexShrink: 0 }}>
                                            <div style={{
                                                fontSize: '0.78rem',
                                                fontWeight: 700,
                                                color: attr.value.trim() ? '#10b981' : '#ef4444',
                                            }}>
                                                {attr.value.trim() ? '✅' : '❌'} {attr.name}
                                            </div>
                                            <div style={{ fontSize: '0.55rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                                                必填
                                            </div>
                                        </div>

                                        {/* 输入框 */}
                                        <input
                                            type="text"
                                            value={attr.value}
                                            onChange={e => updateAttrValue(idx, e.target.value)}
                                            placeholder={`请输入 ${attr.name} 的值...`}
                                            style={{
                                                flex: 1,
                                                padding: '8px 12px',
                                                fontSize: '0.82rem',
                                                fontWeight: 600,
                                                background: 'var(--color-bg-input)',
                                                border: `2px solid ${attr.value.trim() ? '#10b981' : '#ef4444'}`,
                                                borderRadius: 'var(--radius-sm)',
                                                color: 'var(--color-text-primary)',
                                                outline: 'none',
                                                transition: 'border-color 0.2s',
                                            }}
                                            onFocus={e => { e.target.style.borderColor = '#6366f1'; }}
                                            onBlur={e => { e.target.style.borderColor = attr.value.trim() ? '#10b981' : '#ef4444'; }}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ===== SKU 修复 ===== */}
                    {result.errors.some(e => e.type === 'sku') && (
                        <div style={{
                            marginBottom: '12px',
                            padding: '10px 12px',
                            border: '2px solid #3b82f6',
                            borderRadius: 'var(--radius-md)',
                            background: 'rgba(59,130,246,0.04)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                <Package size={14} style={{ color: '#3b82f6' }} />
                                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#3b82f6' }}>
                                    🏷️ SKU 重复，请修改
                                </span>
                            </div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', marginBottom: '6px' }}>
                                {result.errors.find(e => e.type === 'sku')?.message}
                            </div>
                            <input
                                type="text"
                                value={skuFix}
                                onChange={e => setSkuFix(e.target.value)}
                                placeholder="输入新 SKU..."
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    fontSize: '0.82rem',
                                    fontWeight: 600,
                                    background: 'var(--color-bg-input)',
                                    border: '2px solid #3b82f6',
                                    borderRadius: 'var(--radius-sm)',
                                    color: 'var(--color-text-primary)',
                                }}
                            />
                        </div>
                    )}

                    {/* ===== 其他错误（只展示） ===== */}
                    {result.errors.filter(e => e.type !== 'missing_attribute' && e.type !== 'sku').length > 0 && (
                        <div style={{ marginBottom: '12px' }}>
                            {result.errors.filter(e => e.type !== 'missing_attribute' && e.type !== 'sku').map((err, idx) => {
                                const config = ERROR_TYPE_CONFIG[err.type] || ERROR_TYPE_CONFIG.other;
                                const IconComp = config.icon;
                                return (
                                    <div key={idx} style={{
                                        padding: '6px 10px',
                                        marginBottom: '4px',
                                        background: config.bg,
                                        borderRadius: 'var(--radius-sm)',
                                        border: `1px solid ${config.color}20`,
                                        display: 'flex', alignItems: 'center', gap: '6px',
                                        fontSize: '0.7rem', color: config.color,
                                    }}>
                                        <IconComp size={11} />
                                        <span style={{ fontWeight: 600 }}>[{err.form_name}]</span>
                                        {err.message}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* ===== 应用修复按钮 ===== */}
                    {fixableCount > 0 && (
                        <button
                            className="btn btn-primary"
                            onClick={handleApplyFix}
                            disabled={filledCount === 0}
                            style={{
                                width: '100%',
                                padding: '10px',
                                fontSize: '0.85rem',
                                fontWeight: 700,
                                background: filledCount > 0 ? 'linear-gradient(135deg, #10b981, #059669)' : undefined,
                                borderColor: filledCount > 0 ? '#10b981' : undefined,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                            }}
                        >
                            <RefreshCw size={14} />
                            {submitted ? '✅ 已应用修复' : `应用修复并重新生成 JSON (${filledCount}/${fixableCount} 已修复)`}
                        </button>
                    )}
                </div>
            )}

            {/* ===== 原始 API 响应 ===== */}
            {result && (
                <div style={{ marginTop: '8px' }}>
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setShowRaw(!showRaw)}
                        style={{ fontSize: '0.6rem', padding: '2px 6px', display: 'flex', alignItems: 'center', gap: '3px', color: 'var(--color-text-muted)' }}
                    >
                        📋 API 原始响应
                        {showRaw ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
                    </button>
                    {showRaw && (
                        <pre style={{
                            marginTop: '4px', padding: '8px',
                            background: 'var(--color-bg-primary)', borderRadius: 'var(--radius-sm)',
                            fontSize: '0.55rem', overflow: 'auto', maxHeight: '200px',
                            lineHeight: 1.4, color: 'var(--color-text-secondary)',
                            border: '1px solid var(--color-border)',
                        }}>
                            {JSON.stringify(result.raw, null, 2)}
                        </pre>
                    )}
                </div>
            )}
        </div>
    );
}
