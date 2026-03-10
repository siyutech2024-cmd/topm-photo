import { useState, useEffect, useCallback } from 'react';
import { Copy, Check, AlertTriangle, CheckCircle, HelpCircle, RefreshCw, ChevronDown, ChevronUp, ExternalLink, Download, Search, Plus, X, Loader } from 'lucide-react';
import { generatePlatformParams, exportParamsAsJson, copyToClipboard, getFieldSummary, getCategoriesForPlatform } from '../services/platformService';
import { fetchAttributes, buildSheinJson, autoMatchAttributes, autoMatchSaleAttribute, autoMatchSkuSaleAttributes, downloadJsonFile, transformImageUrls } from '../services/sheinApiService';
import { getLocalCategories, getLocalAttributes, getLocalMainAttrStatus, searchLocalCategories, getCacheStats } from '../services/sheinCacheService';
import type { Product, PlatformType, PlatformParamsResult } from '../types';
import type { SheinAttribute } from '../services/sheinApiService';
import type { CachedCategory } from '../services/sheinCacheService';

const PLATFORMS: { key: PlatformType; name: string; color: string; icon: string }[] = [
    { key: 'shein', name: 'SHEIN', color: '#000000', icon: '🛍️' },
    { key: 'tiktok', name: 'TikTok Shop', color: '#ff0050', icon: '🎵' },
    { key: 'temu', name: 'Temu', color: '#f56e28', icon: '🏪' },
];

interface Props {
    product: Product;
}

// ===== SHEIN 专用面板（AI 自动匹配 + 本地缓存） =====

function SheinPanel({ product }: Props) {
    // 类目
    const [categorySearch, setCategorySearch] = useState('');
    const [allLocalCats, setAllLocalCats] = useState<CachedCategory[]>([]);
    const [filteredCats, setFilteredCats] = useState<CachedCategory[]>([]);
    const [selectedCat, setSelectedCat] = useState<CachedCategory | null>(null);
    const [catSource, setCatSource] = useState<'ai' | 'manual' | 'none'>('none');
    const [cacheReady, setCacheReady] = useState(false);

    // 属性
    const [attributes, setAttributes] = useState<SheinAttribute[]>([]);
    const [matchedAttrs, setMatchedAttrs] = useState<{ attribute_id: number; attribute_value_id: number; attribute_extra_value?: string; _display_name?: string; _display_value?: string }[]>([]);
    const [allAttrs, setAllAttrs] = useState<import('../services/sheinApiService').SheinAttribute[]>([]);
    const [matchedSaleAttr, setMatchedSaleAttr] = useState<{ attribute_id: number; attribute_value_id: number; custom_attribute_value?: string; _display_name?: string; _display_value?: string } | null>(null);
    const [matchedSkuSaleAttrs, setMatchedSkuSaleAttrs] = useState<{ attribute_id: number; attribute_value_id: number; _display_name?: string; _display_value?: string }[]>([]);
    const [mainAttrStatus, setMainAttrStatus] = useState<number | undefined>(undefined);
    const [loadingAttrs, setLoadingAttrs] = useState(false);

    // 图片
    const [imageUrls, setImageUrls] = useState<string[]>(product.product_images || []);
    const [newImageUrl, setNewImageUrl] = useState('');
    const [transforming, setTransforming] = useState(false);

    // JSON
    const [generatedJson, setGeneratedJson] = useState<Record<string, unknown> | null>(null);
    const [showJson, setShowJson] = useState(false);
    const [copied, setCopied] = useState(false);

    // 初始化：加载本地缓存 + AI 自动匹配
    const initFromCache = useCallback(async () => {
        try {
            const stats = await getCacheStats();
            if (stats.categoryCount === 0) {
                setCacheReady(false);
                return;
            }

            const cats = await getLocalCategories();
            setAllLocalCats(cats);
            setCacheReady(true);

            // 如果产品已有 AI 匹配的 SHEIN 类目
            if (product.shein_category_id && product.shein_product_type_id) {
                const matched = cats.find(c => c.categoryId === product.shein_category_id);
                if (matched) {
                    setSelectedCat(matched);
                    setCatSource('ai');
                    // 自动加载属性模板
                    loadAttributesForCategory(matched.productTypeId, cats);
                    return;
                }
            }

            // Fallback: 用产品标题/类目搜索匹配
            const query = `${product.title} ${product.category}`;
            const searched = searchLocalCategories(cats, query);
            if (searched.length > 0) {
                setSelectedCat(searched[0]);
                setCatSource('ai');
                loadAttributesForCategory(searched[0].productTypeId, cats);
            }
        } catch {
            setCacheReady(false);
        }
    }, [product]);

    const loadAttributesForCategory = async (productTypeId: number, _cats?: CachedCategory[]) => {
        setLoadingAttrs(true);
        try {
            // 先从本地读取
            let attrs = await getLocalAttributes(productTypeId);
            if (attrs.length === 0) {
                attrs = await fetchAttributes(productTypeId);
            }
            const mas = await getLocalMainAttrStatus(productTypeId);
            setMainAttrStatus(mas);
            setAttributes(attrs);
            setAllAttrs(attrs);
            const matched = autoMatchAttributes(product.attributes, attrs);
            setMatchedAttrs(matched);
            // 自动匹配销售属性
            const saleMatch = autoMatchSaleAttribute(product.attributes, attrs);
            if (saleMatch) setMatchedSaleAttr(saleMatch);
            const skuMatch = autoMatchSkuSaleAttributes(product.attributes, product.variants || [], attrs);
            setMatchedSkuSaleAttrs(skuMatch);
        } catch {
            setAttributes([]);
            setMatchedAttrs([]);
        } finally {
            setLoadingAttrs(false);
        }
    };

    useEffect(() => { initFromCache(); }, [initFromCache]);

    // 搜索过滤类目
    useEffect(() => {
        if (!categorySearch.trim()) {
            setFilteredCats(allLocalCats.slice(0, 50));
            return;
        }
        const results = searchLocalCategories(allLocalCats, categorySearch);
        setFilteredCats(results);
    }, [categorySearch, allLocalCats]);

    // 手动选择类目
    const handleSelectCategory = async (cat: CachedCategory) => {
        setSelectedCat(cat);
        setCatSource('manual');
        setGeneratedJson(null);
        await loadAttributesForCategory(cat.productTypeId);
    };

    // 添加图片 URL
    const addImageUrl = () => {
        if (newImageUrl.trim() && !imageUrls.includes(newImageUrl.trim())) {
            setImageUrls([...imageUrls, newImageUrl.trim()]);
            setNewImageUrl('');
        }
    };

    const removeImageUrl = (idx: number) => {
        setImageUrls(imageUrls.filter((_, i) => i !== idx));
    };

    // 转换图片链接
    const handleTransformImages = async () => {
        setTransforming(true);
        try {
            const converted = await transformImageUrls(imageUrls);
            setImageUrls(converted);
        } catch {
            // 保持原始 URL
        } finally {
            setTransforming(false);
        }
    };

    // 生成完整 JSON
    const handleGenerateJson = () => {
        if (!selectedCat) return;
        const json = buildSheinJson(product, {
            categoryId: selectedCat.categoryId,
            productTypeId: selectedCat.productTypeId,
            imageUrls,
            matchedAttributes: matchedAttrs,
            allAttributes: allAttrs,
            saleAttribute: matchedSaleAttr || undefined,
            skuSaleAttributes: matchedSkuSaleAttrs.length > 0 ? matchedSkuSaleAttrs : undefined,
            mainAttrStatus: mainAttrStatus,
        });
        setGeneratedJson(json as unknown as Record<string, unknown>);
        setShowJson(false);
        setCopied(false);
    };

    // 下载 JSON 文件
    const handleDownload = () => {
        if (!generatedJson) return;
        const filename = `shein_${product.title?.replace(/\s+/g, '_').slice(0, 30) || 'product'}_${Date.now()}.json`;
        downloadJsonFile(generatedJson, filename);
    };

    const handleCopy = async () => {
        if (!generatedJson) return;
        await copyToClipboard(JSON.stringify(generatedJson, null, 2));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const requiredAttrs = attributes.filter(a => a.is_required);
    const matchedCount = matchedAttrs.length;
    const totalRequired = requiredAttrs.length;

    return (
        <div className="shein-panel">
            {/* 缓存未就绪提示 */}
            {!cacheReady && (
                <div className="api-hint" style={{ background: 'rgba(251, 191, 36, 0.08)', borderColor: 'rgba(251, 191, 36, 0.3)', color: '#b45309' }}>
                    <AlertTriangle size={14} />
                    <span>⚠️ 尚未同步 SHEIN 数据。请前往 <strong>设置</strong> 页面点击"同步 SHEIN 数据"以启用 AI 自动匹配。</span>
                </div>
            )}

            {/* 步骤 1: 类目匹配 */}
            <div className="shein-step">
                <div className="step-header">
                    <span className="step-num">1</span>
                    <span className="step-title">
                        Categoría
                        <span className="step-subtitle">
                            {catSource === 'ai' ? '🤖 AI 自动匹配' : catSource === 'manual' ? '✋ 人工选择' : '选择类目'}
                        </span>
                    </span>
                    {selectedCat && <CheckCircle size={16} className="step-done" />}
                </div>

                {selectedCat ? (
                    <div className="selected-cat">
                        <div>
                            <span>📂 {selectedCat.label}</span>
                            {catSource === 'ai' && (
                                <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                                    🤖 AI 根据产品图片自动匹配 | ID: {selectedCat.categoryId}
                                </span>
                            )}
                        </div>
                        <button className="btn-copy" onClick={() => { setSelectedCat(null); setCatSource('none'); setAttributes([]); setMatchedAttrs([]); setGeneratedJson(null); }}>
                            Cambiar
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="cat-search-box">
                            <Search size={14} />
                            <input
                                type="text"
                                className="form-input"
                                placeholder="Buscar categoría... (搜索类目)"
                                value={categorySearch}
                                onChange={e => setCategorySearch(e.target.value)}
                                style={{ paddingLeft: '32px' }}
                            />
                        </div>
                        <div className="cat-list">
                            {filteredCats.length === 0 && (
                                <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', padding: '8px' }}>
                                    {allLocalCats.length === 0 ? '⚠️ 本地无缓存数据，请先到设置页面同步' : 'No se encontraron categorías'}
                                </p>
                            )}
                            {filteredCats.map((cat, i) => (
                                <button key={i} className="cat-item" onClick={() => handleSelectCategory(cat)}>
                                    {cat.label}
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* 步骤 2: 属性匹配 */}
            {selectedCat && (
                <div className="shein-step">
                    <div className="step-header">
                        <span className="step-num">2</span>
                        <span className="step-title">Atributos <span className="step-subtitle">🤖 AI 自动匹配属性</span></span>
                        {matchedCount > 0 && (
                            <span className="attr-count">
                                {matchedCount}/{totalRequired} obligatorios
                            </span>
                        )}
                    </div>

                    {loadingAttrs ? (
                        <div style={{ padding: '16px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                            <Loader size={16} className="spin" /> Cargando plantilla de atributos...
                        </div>
                    ) : attributes.length > 0 ? (
                        <div className="attr-list">
                            {requiredAttrs.map((attr, i) => {
                                const matched = matchedAttrs.find(m => m.attribute_id === attr.attribute_id);
                                return (
                                    <div key={i} className={`field-row ${matched ? 'filled' : 'missing'}`}>
                                        <div className="field-info">
                                            <span className="field-label">
                                                <span className="required-mark">*</span>
                                                {attr.attribute_name}
                                            </span>
                                            <span className="field-name">
                                                ID: {attr.attribute_id} | {attr.values?.length || 0} opciones
                                            </span>
                                        </div>
                                        <div className="field-status-badge">
                                            {matched ? (
                                                <><CheckCircle size={12} /> {matched._display_value}</>
                                            ) : (
                                                <><AlertTriangle size={12} /> Pendiente</>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                            {attributes.filter(a => !a.is_required).length > 0 && (
                                <p style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: '8px' }}>
                                    + {attributes.filter(a => !a.is_required).length} atributos opcionales
                                </p>
                            )}
                        </div>
                    ) : (
                        <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', padding: '8px' }}>
                            No se encontraron atributos en caché local.
                        </p>
                    )}
                </div>
            )}

            {/* 步骤 3: 图片管理 */}
            {selectedCat && (
                <div className="shein-step">
                    <div className="step-header">
                        <span className="step-num">3</span>
                        <span className="step-title">Imágenes <span className="step-subtitle">图片管理</span></span>
                        <span className="attr-count">{imageUrls.length} imágenes</span>
                    </div>

                    <div className="image-manager">
                        {imageUrls.map((url, i) => (
                            <div key={i} className="image-row">
                                <span className="img-badge">{i === 0 ? '📸 Principal' : `🖼️ #${i + 1}`}</span>
                                <span className="img-url">{url}</span>
                                <div className="img-actions">
                                    <a href={url} target="_blank" rel="noopener noreferrer" className="btn-icon-sm">
                                        <ExternalLink size={12} />
                                    </a>
                                    <button className="btn-icon-sm btn-danger-sm" onClick={() => removeImageUrl(i)}>
                                        <X size={12} />
                                    </button>
                                </div>
                            </div>
                        ))}

                        <div className="add-image-row">
                            <input
                                type="text"
                                className="form-input"
                                placeholder="Pegar URL de imagen..."
                                value={newImageUrl}
                                onChange={e => setNewImageUrl(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && addImageUrl()}
                                style={{ flex: 1 }}
                            />
                            <button className="btn btn-sm btn-secondary" onClick={addImageUrl} disabled={!newImageUrl.trim()}>
                                <Plus size={14} />
                            </button>
                        </div>

                        <button
                            className="btn btn-sm btn-secondary"
                            onClick={handleTransformImages}
                            disabled={transforming || imageUrls.length === 0}
                            style={{ width: '100%', marginTop: '8px' }}
                        >
                            {transforming ? <><Loader size={12} className="spin" /> Convirtiendo...</> : <>🔄 Convertir a URLs SHEIN</>}
                        </button>
                    </div>
                </div>
            )}

            {/* 步骤 4: 生成 JSON */}
            {selectedCat && (
                <div className="shein-step">
                    <div className="step-header">
                        <span className="step-num">4</span>
                        <span className="step-title">Generar JSON <span className="step-subtitle">生成文件</span></span>
                    </div>

                    <button
                        className="btn btn-primary"
                        onClick={handleGenerateJson}
                        disabled={imageUrls.length === 0}
                        style={{ width: '100%', marginBottom: 'var(--space-md)' }}
                    >
                        ✨ Generar JSON completo para SHEIN
                    </button>

                    {generatedJson && (
                        <>
                            <div style={{ display: 'flex', gap: '8px', marginBottom: 'var(--space-md)' }}>
                                <button className="btn btn-primary btn-sm" onClick={handleDownload} style={{ flex: 1 }}>
                                    <Download size={14} /> Descargar .json
                                </button>
                                <button className="btn btn-secondary btn-sm" onClick={handleCopy} style={{ flex: 1 }}>
                                    {copied ? <><Check size={14} /> Copiado</> : <><Copy size={14} /> Copiar JSON</>}
                                </button>
                            </div>

                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => setShowJson(!showJson)}
                                style={{ width: '100%' }}
                            >
                                {showJson ? <><ChevronUp size={14} /> Ocultar</> : <><ChevronDown size={14} /> Vista previa</>}
                            </button>

                            {showJson && (
                                <div className="json-preview" style={{ marginTop: '8px' }}>
                                    <div className="json-header">
                                        <span>SHEIN publishOrEdit JSON</span>
                                        <button className="btn-copy" onClick={handleCopy}>
                                            {copied ? <><Check size={12} /> ✓</> : <><Copy size={12} /> Copiar</>}
                                        </button>
                                    </div>
                                    <pre className="json-code">{JSON.stringify(generatedJson, null, 2)}</pre>
                                </div>
                            )}

                            <p style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: 'var(--space-md)', lineHeight: 1.6 }}>
                                📂 {selectedCat.label} {catSource === 'ai' && '(🤖 AI)'}<br />
                                🏷️ {matchedCount}/{totalRequired} atributos obligatorios<br />
                                🖼️ {imageUrls.length} imágenes
                            </p>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

// ===== TikTok / Temu 面板 =====

function GenericPanel({ product, platform }: { product: Product; platform: PlatformType }) {
    const [result, setResult] = useState<PlatformParamsResult | null>(null);
    const [copied, setCopied] = useState(false);
    const [showJson, setShowJson] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState('');
    const categories = getCategoriesForPlatform(platform);

    const handleGenerate = () => {
        setGenerating(true);
        setTimeout(() => {
            const r = generatePlatformParams(product, platform, selectedCategory || undefined);
            setResult(r);
            setGenerating(false);
            setShowJson(false);
            setCopied(false);
        }, 300);
    };

    const handleCopy = async () => {
        if (!result) return;
        await copyToClipboard(exportParamsAsJson(result));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const summary = result ? getFieldSummary(result.fields) : null;

    return (
        <div>
            <div style={{ marginBottom: 'var(--space-md)' }}>
                <label className="form-label" style={{ fontSize: '0.75rem', marginBottom: '6px' }}>📂 Categoría</label>
                <select className="form-select" value={selectedCategory} onChange={e => { setSelectedCategory(e.target.value); setResult(null); }}>
                    <option value="">-- Seleccionar --</option>
                    {categories.map((c, i) => <option key={i} value={c.label}>{c.label} ({c.label_en})</option>)}
                </select>
            </div>

            <button className="btn btn-primary" onClick={handleGenerate} disabled={generating} style={{ width: '100%', marginBottom: 'var(--space-md)' }}>
                {generating ? <><RefreshCw size={14} className="spin" /> Generando...</> : <>✨ Generar parámetros</>}
            </button>

            {result && summary && (
                <div className="platform-result">
                    <div className="field-summary">
                        <div className="summary-item filled"><CheckCircle size={14} /><span>{summary.filled} Completado</span></div>
                        {summary.estimated > 0 && <div className="summary-item estimated"><HelpCircle size={14} /><span>{summary.estimated} Requiere API</span></div>}
                        {summary.missing > 0 && <div className="summary-item missing"><AlertTriangle size={14} /><span>{summary.missing} Pendiente</span></div>}
                    </div>
                    <div className="field-list">
                        {result.fields.map((f, i) => (
                            <div key={i} className={`field-row ${f.status}`}>
                                <div className="field-info">
                                    <span className="field-label">{f.required && <span className="required-mark">*</span>}{f.label}</span>
                                    <span className="field-name">{f.field}</span>
                                </div>
                                <div className="field-status-badge">
                                    {f.status === 'filled' && <><CheckCircle size={12} /> Completado</>}
                                    {f.status === 'estimated' && <><HelpCircle size={12} /> Requiere API</>}
                                    {f.status === 'missing' && <><AlertTriangle size={12} /> Pendiente</>}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="json-section">
                        <button className="btn btn-secondary btn-sm" onClick={() => setShowJson(!showJson)} style={{ width: '100%' }}>
                            {showJson ? <><ChevronUp size={14} /> Ocultar</> : <><ChevronDown size={14} /> Ver JSON</>}
                        </button>
                        {showJson && (
                            <div className="json-preview" style={{ marginTop: '8px' }}>
                                <div className="json-header">
                                    <span>{platform === 'tiktok' ? 'TikTok Shop' : 'Temu'} API</span>
                                    <button className="btn-copy" onClick={handleCopy}>{copied ? <><Check size={12} /> ✓</> : <><Copy size={12} /> Copiar</>}</button>
                                </div>
                                <pre className="json-code">{exportParamsAsJson(result)}</pre>
                            </div>
                        )}
                        {!showJson && (
                            <button className="btn btn-primary btn-sm" onClick={handleCopy} style={{ width: '100%', marginTop: '8px' }}>
                                {copied ? <><Check size={14} /> Copiado</> : <><Copy size={14} /> Copiar JSON</>}
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ===== 主组件 =====

export default function PlatformExport({ product }: Props) {
    const [activePlatform, setActivePlatform] = useState<PlatformType>('shein');

    return (
        <div className="platform-export">
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 'var(--space-lg)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🌐 Parámetros de Plataforma
                <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 400 }}>Idioma: Español</span>
            </h2>

            <div className="platform-tabs">
                {PLATFORMS.map(p => (
                    <button
                        key={p.key}
                        className={`platform-tab ${activePlatform === p.key ? 'active' : ''}`}
                        onClick={() => setActivePlatform(p.key)}
                        style={{ '--platform-color': p.color } as React.CSSProperties}
                    >
                        <span className="platform-icon">{p.icon}</span>
                        <span>{p.name}</span>
                        {p.key === 'shein' && <span className="api-badge">API</span>}
                    </button>
                ))}
            </div>

            <div style={{ marginTop: 'var(--space-md)' }}>
                {activePlatform === 'shein' ? <SheinPanel product={product} /> : <GenericPanel product={product} platform={activePlatform} />}
            </div>
        </div>
    );
}
