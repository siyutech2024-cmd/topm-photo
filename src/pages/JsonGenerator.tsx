import { useState, useCallback, useEffect } from 'react';
import { Upload, FileJson, Download, Copy, Check, Loader, AlertTriangle, CheckCircle, Search, ChevronDown, ChevronUp, Trash2, Clock, Eye } from 'lucide-react';
import { getCategoryListForAI, loadBundledCategories } from '../services/sheinCacheService';
import { getLocalCategories, getLocalAttributes, searchLocalCategories } from '../services/sheinCacheService';
import { autoMatchAttributes, autoMatchSaleAttribute, autoMatchSkuSaleAttributes, buildSheinJson, downloadJsonFile } from '../services/sheinApiService';
import { copyToClipboard } from '../services/platformService';
import type { ProductAttribute } from '../types';
import type { CachedCategory } from '../services/sheinCacheService';

// ===== Gemini AI 调用 =====

const VITE_GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;

function hasGeminiAccess(): boolean {
    return !!(VITE_GEMINI_API_KEY || window.location.hostname !== 'localhost');
}

function extractBase64Data(dataUrl: string): string {
    const idx = dataUrl.indexOf(',');
    return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
}

function getMimeType(dataUrl: string): string {
    const m = dataUrl.match(/^data:([^;]+)/);
    return m ? m[1] : 'image/jpeg';
}

async function callGeminiForProductInfo(
    images: string[],
    sheinCategoryBlock: string
): Promise<{
    title: string;
    description: string;
    price: number;
    category: string;
    attributes: ProductAttribute[];
    shein_category_id?: number;
    shein_product_type_id?: number;
}> {
    const contents: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
        {
            text: `Eres un experto profesional en operaciones de productos de e-commerce. Observa cuidadosamente estas imágenes del producto y genera la información completa del producto en ESPAÑOL.

Devuelve ESTRICTAMENTE en el siguiente formato JSON, sin ningún otro texto ni marcas markdown:

{
  "title": "Título del producto (10-20 palabras, incluir puntos de venta clave y palabras clave)",
  "description": "Descripción detallada del producto (80-150 palabras, incluir características, materiales, escenarios de uso, ventajas, etc.)",
  "price": número (precio de mercado razonable en USD, sin símbolo de moneda),
  "category": "Categoría del producto (elegir de: Electrónica, Ropa y Calzado, Hogar y Muebles, Belleza y Cuidado Personal, Alimentos y Bebidas, Deportes y Aire Libre, Bebés y Juguetes, Libros y Papelería, Joyería y Accesorios, Automotriz, Otros)",${sheinCategoryBlock ? '\n  "shein_category_id": número (de la lista de categorías SHEIN proporcionada),\n  "shein_product_type_id": número (de la lista de categorías SHEIN proporcionada),' : ''}
  "attributes": [
    {"key": "Marca", "value": "marca identificada o estimada"},
    {"key": "Material", "value": "material del producto"},
    {"key": "Color", "value": "color del producto"},
    {"key": "Dimensiones", "value": "tamaño estimado"},
    {"key": "Peso", "value": "peso estimado"},
    {"key": "Origen", "value": "país de origen estimado"},
    {"key": "Empaque", "value": "tipo de empaque"},
    {"key": "Garantía", "value": "período de garantía"}
  ]
}

Requisitos:
1. El título debe ser atractivo, incluir los puntos de venta principales
2. La descripción debe ser detallada y profesional, destacando las ventajas del producto
3. El precio debe ser acorde al mercado para este tipo de producto (en USD)
4. Los atributos deben ser lo más precisos posible, basados en el contenido de las imágenes${sheinCategoryBlock}`,
        },
    ];

    for (let i = 0; i < Math.min(4, images.length); i++) {
        contents.push({
            inlineData: {
                mimeType: getMimeType(images[i]),
                data: extractBase64Data(images[i]),
            },
        });
    }

    // 调用 Gemini
    let response;
    if (VITE_GEMINI_API_KEY) {
        const r = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${VITE_GEMINI_API_KEY}`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: contents }] }) }
        );
        response = await r.json();
    } else {
        const r = await fetch('/api/gemini', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'gemini-2.0-flash', contents }),
        });
        response = await r.json();
    }

    const text = response.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text)
        .filter(Boolean)
        .join('') || '';

    let jsonStr = text;
    const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) jsonStr = jsonMatch[1];
    const objMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objMatch) jsonStr = objMatch[0];

    const parsed = JSON.parse(jsonStr);
    return {
        title: parsed.title || '未命名产品',
        description: parsed.description || '',
        price: typeof parsed.price === 'number' ? parsed.price : parseFloat(parsed.price) || 99.9,
        category: parsed.category || 'Otros',
        attributes: Array.isArray(parsed.attributes) ? parsed.attributes : [],
        shein_category_id: parsed.shein_category_id || undefined,
        shein_product_type_id: parsed.shein_product_type_id || undefined,
    };
}

// ===== 主页面 =====

interface ProductData {
    title: string;
    description: string;
    price: number;
    category: string;
    attributes: ProductAttribute[];
    shein_category_id?: number;
    shein_product_type_id?: number;
}

export default function JsonGenerator() {
    // 图片上传
    const [images, setImages] = useState<string[]>([]);
    const [dragOver, setDragOver] = useState(false);

    // AI 分析
    const [analyzing, setAnalyzing] = useState(false);
    const [progress, setProgress] = useState('');
    const [productData, setProductData] = useState<ProductData | null>(null);

    // SHEIN 类目匹配
    const [matchedCategory, setMatchedCategory] = useState<CachedCategory | null>(null);
    const [showCategoryPicker, setShowCategoryPicker] = useState(false);
    const [catSearch, setCatSearch] = useState('');
    const [catResults, setCatResults] = useState<CachedCategory[]>([]);
    const [matchedAttrs, setMatchedAttrs] = useState<{ attribute_id: number; attribute_value_id: number; attribute_extra_value?: string; _display_name?: string; _display_value?: string }[]>([]);
    const [allAttrs, setAllAttrs] = useState<import('../services/sheinApiService').SheinAttribute[]>([]);  // 全量属性模板
    const [matchedSaleAttr, setMatchedSaleAttr] = useState<{ attribute_id: number; attribute_value_id: number; custom_attribute_value?: string; _display_name?: string; _display_value?: string } | null>(null);
    const [matchedSkuSaleAttrs, setMatchedSkuSaleAttrs] = useState<{ attribute_id: number; attribute_value_id: number; _display_name?: string; _display_value?: string }[]>([]);

    // SKU/价格 可编辑
    const [skuCode, setSkuCode] = useState('TOPM-001');
    const [editPrice, setEditPrice] = useState<number>(0);
    const [editStock, setEditStock] = useState<number>(100);

    // JSON 输出
    const [generatedJson, setGeneratedJson] = useState<Record<string, unknown> | null>(null);
    const [showJson, setShowJson] = useState(false);
    const [copied, setCopied] = useState(false);

    // 历史记录
    interface HistoryItem {
        id: string;
        title: string;
        category: string;
        skuCode: string;
        price: number;
        timestamp: string;
        json: Record<string, unknown>;
    }
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [previewItem, setPreviewItem] = useState<HistoryItem | null>(null);

    // 加载历史记录
    useEffect(() => {
        try {
            const saved = localStorage.getItem('shein_json_history');
            if (saved) setHistory(JSON.parse(saved));
        } catch { /* ignore */ }
    }, []);

    const saveHistory = (items: HistoryItem[]) => {
        setHistory(items);
        localStorage.setItem('shein_json_history', JSON.stringify(items.slice(0, 50))); // 最多 50 条
    };

    const deleteHistoryItem = (id: string) => {
        saveHistory(history.filter(h => h.id !== id));
    };

    const clearHistory = () => {
        saveHistory([]);
    };

    // 图片处理
    const processFiles = useCallback((files: FileList | File[]) => {
        Array.from(files).forEach(file => {
            if (!file.type.startsWith('image/')) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                const result = e.target?.result as string;
                if (result) setImages(prev => [...prev, result]);
            };
            reader.readAsDataURL(file);
        });
    }, []);

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        processFiles(e.dataTransfer.files);
    };

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) processFiles(e.target.files);
    };

    const removeImage = (idx: number) => {
        setImages(prev => prev.filter((_, i) => i !== idx));
    };

    // AI 分析产品
    const handleAnalyze = async () => {
        if (images.length === 0) return;
        setAnalyzing(true);
        setProgress('正在加载 SHEIN 类目数据...');
        setProductData(null);
        setMatchedCategory(null);
        setMatchedAttrs([]);
        setGeneratedJson(null);

        try {
            // 加载本地 SHEIN 类目
            let sheinBlock = '';
            try {
                const catList = await getCategoryListForAI();
                if (catList) {
                    sheinBlock = `\n\nAdemás, tienes acceso a las siguientes categorías reales de SHEIN. IMPORTANTE: Estas categorías SOLO cubren 3 verticales: "Home & Living", "Pet Supplies" y "Toys & Games". NO incluyen moda, ropa, bolsos ni accesorios de moda.

Formato: categoryId|productTypeId|ruta
---SHEIN_CATEGORIES_START---
${catList}
---SHEIN_CATEGORIES_END---

REGLAS ESTRICTAS para elegir la categoría:
1. Debes elegir la categoría cuya ruta sea DIRECTAMENTE relevante al producto
2. Si el producto NO pertenece a ninguna de estas 3 verticales (Home & Living, Pet Supplies, Toys & Games), DEBES poner 0 en ambos campos
3. PROHIBIDO forzar una categoría no relacionada (ej: NO clasificar un bolso de moda como "Pet Supplies")
4. Solo clasifica si estás 90%+ seguro de que la categoría es correcta

Devuelve:
  "shein_category_id": número (categoryId de la lista, o 0 si no hay coincidencia),
  "shein_product_type_id": número (productTypeId de la lista, o 0 si no hay coincidencia),`;
                }
            } catch { /* no cache */ }

            setProgress('🤖 AI 正在分析产品图片...');
            const data = await callGeminiForProductInfo(images, sheinBlock);
            setProductData(data);

            // 匹配 SHEIN 类目
            setProgress('匹配 SHEIN 类目和属性...');
            let cats = await getLocalCategories();
            let foundCategory: CachedCategory | null = null;  // 局部变量追踪（不依赖异步 state）

            // 缓存为空 → 自动从本地打包数据加载
            if (cats.length === 0) {
                setProgress('📦 首次使用，正在加载 SHEIN 类目数据...');
                await loadBundledCategories((msg) => setProgress(msg));
                cats = await getLocalCategories();
            }

            if (cats.length > 0 && data.shein_category_id) {
                const matched = cats.find(c => c.categoryId === data.shein_category_id);
                if (matched) {
                    foundCategory = matched;
                    setMatchedCategory(matched);
                    // 加载属性
                    const attrs = await getLocalAttributes(matched.productTypeId);
                    if (attrs.length > 0) {
                        setAllAttrs(attrs);
                        const autoMatched = autoMatchAttributes(data.attributes, attrs);
                        setMatchedAttrs(autoMatched);
                        // 自动匹配销售属性
                        const saleMatch = autoMatchSaleAttribute(data.attributes, attrs);
                        if (saleMatch) setMatchedSaleAttr(saleMatch);
                        const skuMatch = autoMatchSkuSaleAttributes(data.attributes, [], attrs);
                        setMatchedSkuSaleAttrs(skuMatch);
                    }
                }
            }

            // Fallback: 关键词匹配（仅当 AI 没有匹配到时）
            if (!foundCategory && cats.length > 0) {
                const searched = searchLocalCategories(cats, `${data.title} ${data.category}`);
                if (searched.length > 0) {
                    foundCategory = searched[0];
                    setMatchedCategory(searched[0]);
                    const attrs = await getLocalAttributes(searched[0].productTypeId);
                    if (attrs.length > 0) {
                        setAllAttrs(attrs);
                        const autoMatched = autoMatchAttributes(data.attributes, attrs);
                        setMatchedAttrs(autoMatched);
                        const saleMatch = autoMatchSaleAttribute(data.attributes, attrs);
                        if (saleMatch) setMatchedSaleAttr(saleMatch);
                        const skuMatch = autoMatchSkuSaleAttributes(data.attributes, [], attrs);
                        setMatchedSkuSaleAttrs(skuMatch);
                    }
                }
            }

            setProgress('✅ 分析完成');
        } catch (err) {
            setProgress('❌ 分析失败: ' + (err instanceof Error ? err.message : '未知错误'));
        } finally {
            setAnalyzing(false);
        }
    };

    // 搜索类目
    const handleCatSearch = async (q: string) => {
        setCatSearch(q);
        if (!q.trim()) { setCatResults([]); return; }
        const cats = await getLocalCategories();
        setCatResults(searchLocalCategories(cats, q));
    };

    const selectCategory = async (cat: CachedCategory) => {
        setMatchedCategory(cat);
        setShowCategoryPicker(false);
        setCatSearch('');
        setGeneratedJson(null);

        const attrs = await getLocalAttributes(cat.productTypeId);
        if (attrs.length > 0 && productData) {
            setAllAttrs(attrs);
            const autoMatched = autoMatchAttributes(productData.attributes, attrs);
            setMatchedAttrs(autoMatched);
            const saleMatch = autoMatchSaleAttribute(productData.attributes, attrs);
            if (saleMatch) setMatchedSaleAttr(saleMatch);
            const skuMatch = autoMatchSkuSaleAttributes(productData.attributes, [], attrs);
            setMatchedSkuSaleAttrs(skuMatch);
        }
    };

    // 当 AI 分析出价格后，同步到 editPrice
    useEffect(() => {
        if (productData?.price && editPrice === 0) {
            setEditPrice(productData.price);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [productData?.price]);

    // 生成 SHEIN JSON
    const handleGenerateJson = () => {
        if (!productData || !matchedCategory) return;

        const product = {
            title: productData.title,
            description: productData.description,
            price: editPrice || productData.price,
            currency: 'USD',
            category: productData.category,
            attributes: productData.attributes,
            original_images: images,
            product_images: images,
            effect_images: [] as string[],
            grid_images: [] as string[],
            status: 'generated' as const,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            variants: [{
                color: productData.attributes.find(a => a.key.toLowerCase().includes('color'))?.value || 'Por defecto',
                size: 'Talla única',
                sku_code: skuCode,
                price: editPrice || productData.price,
                stock: editStock,
                weight_g: 200,
            }],
        };

        const json = buildSheinJson(product, {
            categoryId: matchedCategory.categoryId,
            productTypeId: matchedCategory.productTypeId,
            imageUrls: images,
            matchedAttributes: matchedAttrs,
            allAttributes: allAttrs,
            saleAttribute: matchedSaleAttr || undefined,
            skuSaleAttributes: matchedSkuSaleAttrs.length > 0 ? matchedSkuSaleAttrs : undefined,
        });

        const jsonRecord = json as unknown as Record<string, unknown>;
        setGeneratedJson(jsonRecord);
        setShowJson(false);
        setCopied(false);

        // 保存到历史记录
        const item: HistoryItem = {
            id: crypto.randomUUID(),
            title: productData.title,
            category: matchedCategory.label,
            skuCode,
            price: editPrice || productData.price,
            timestamp: new Date().toISOString(),
            json: jsonRecord,
        };
        saveHistory([item, ...history]);
    };

    const handleDownload = () => {
        if (!generatedJson) return;
        downloadJsonFile(generatedJson, `${skuCode}.json`);
    };

    const handleCopy = async () => {
        if (!generatedJson) return;
        await copyToClipboard(JSON.stringify(generatedJson, null, 2));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const hasGemini = hasGeminiAccess();

    return (
        <div>
            <div className="page-header">
                <h1>📋 产品数据生成</h1>
                <p>上传产品图片 → AI 自动生成 SHEIN 上架 JSON 文件</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: productData ? '1fr 1fr' : '1fr', gap: 'var(--space-lg)', alignItems: 'start' }}>

                {/* ===== 左栏：操作区 ===== */}
                <div style={{ position: 'relative', zIndex: 1 }}>
                    {/* Step 1: 上传图片 */}
                    <div className="card" style={{ marginBottom: 'var(--space-md)' }}>
                        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: 'var(--space-sm)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ background: 'var(--color-accent)', color: '#fff', width: 22, height: 22, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700 }}>1</span>
                            上传产品图片
                        </h3>

                        <div
                            className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
                            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={handleDrop}
                            onClick={() => document.getElementById('json-gen-file-input')?.click()}
                            style={{
                                border: '2px dashed var(--color-border)',
                                borderRadius: 'var(--radius-md)',
                                padding: 'var(--space-md)',
                                textAlign: 'center',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                background: dragOver ? 'var(--color-accent-light)' : 'transparent',
                            }}
                        >
                            <Upload size={24} style={{ color: 'var(--color-text-muted)', marginBottom: '4px' }} />
                            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>拖拽或点击上传</p>
                            <p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>JPG / PNG / WebP</p>
                            <input id="json-gen-file-input" type="file" accept="image/*" multiple onChange={handleFileInput} style={{ display: 'none' }} />
                        </div>

                        {images.length > 0 && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))', gap: '6px', marginTop: 'var(--space-sm)' }}>
                                {images.map((img, i) => (
                                    <div key={i} style={{ position: 'relative', borderRadius: 'var(--radius-sm)', overflow: 'hidden', aspectRatio: '1', background: 'var(--color-bg-input)' }}>
                                        <img src={img} alt={`产品图 ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        <button
                                            onClick={(e) => { e.stopPropagation(); removeImage(i); }}
                                            style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                        >
                                            <Trash2 size={9} />
                                        </button>
                                        {i === 0 && (
                                            <span style={{ position: 'absolute', bottom: 2, left: 2, background: 'var(--color-accent)', color: '#fff', fontSize: '0.55rem', padding: '1px 5px', borderRadius: '3px' }}>
                                                主图
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Step 2: AI 分析 */}
                    <div className="card" style={{ marginBottom: 'var(--space-md)' }}>
                        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: 'var(--space-sm)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ background: 'var(--color-secondary)', color: '#fff', width: 22, height: 22, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700 }}>2</span>
                            AI 分析
                        </h3>

                        {!hasGemini && (
                            <div style={{ padding: '8px 12px', background: 'rgba(251,191,36,0.08)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-sm)', fontSize: '0.75rem', color: '#b45309' }}>
                                <AlertTriangle size={12} style={{ verticalAlign: 'middle' }} /> 需要 Gemini API
                            </div>
                        )}

                        <button
                            className="btn btn-primary"
                            onClick={handleAnalyze}
                            disabled={images.length === 0 || analyzing || !hasGemini}
                            style={{ width: '100%', marginBottom: 'var(--space-sm)' }}
                        >
                            {analyzing ? (
                                <><Loader size={14} className="spin" /> {progress}</>
                            ) : (
                                <><FileJson size={14} /> 🤖 AI 分析产品</>
                            )}
                        </button>

                        {progress && !analyzing && (
                            <p style={{ fontSize: '0.72rem', color: progress.startsWith('❌') ? 'var(--color-danger)' : 'var(--color-success)' }}>
                                {progress}
                            </p>
                        )}
                    </div>

                    {/* Step 3: 类目匹配 + SKU/价格 + 生成 */}
                    {productData && (
                        <div className="card" style={{ marginBottom: 'var(--space-md)' }}>
                            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: 'var(--space-sm)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ background: '#10b981', color: '#fff', width: 22, height: 22, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700 }}>3</span>
                                SHEIN JSON 生成
                            </h3>

                            {/* 类目匹配 */}
                            {matchedCategory ? (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'rgba(16,185,129,0.08)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-sm)' }}>
                                    <div>
                                        <div style={{ fontSize: '0.78rem', fontWeight: 600 }}>
                                            <CheckCircle size={12} style={{ color: '#10b981', verticalAlign: 'middle' }} /> {matchedCategory.label.split(' → ').pop()}
                                        </div>
                                        <div style={{ fontSize: '0.62rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                                            ID: {matchedCategory.categoryId} | Type: {matchedCategory.productTypeId}
                                        </div>
                                    </div>
                                    <button className="btn btn-secondary btn-sm" style={{ fontSize: '0.68rem', padding: '3px 8px' }} onClick={() => setShowCategoryPicker(!showCategoryPicker)}>
                                        更换
                                    </button>
                                </div>
                            ) : (
                                <div style={{ padding: '10px 12px', background: 'rgba(251,191,36,0.08)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-sm)', fontSize: '0.75rem', color: '#b45309' }}>
                                    <AlertTriangle size={12} style={{ verticalAlign: 'middle' }} /> 未匹配类目
                                    <button className="btn btn-secondary btn-sm" onClick={() => setShowCategoryPicker(true)} style={{ marginLeft: '8px', fontSize: '0.68rem', padding: '2px 8px' }}>
                                        <Search size={10} /> 搜索
                                    </button>
                                </div>
                            )}

                            {showCategoryPicker && (
                                <div style={{ marginBottom: 'var(--space-sm)' }}>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="搜索 SHEIN 类目..."
                                        value={catSearch}
                                        onChange={e => handleCatSearch(e.target.value)}
                                        style={{ width: '100%', marginBottom: '6px', fontSize: '0.8rem' }}
                                    />
                                    <div style={{ maxHeight: '150px', overflow: 'auto' }}>
                                        {catResults.map((cat, i) => (
                                            <button
                                                key={i}
                                                onClick={() => selectCategory(cat)}
                                                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', marginBottom: '2px', background: 'var(--color-bg-input)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '0.72rem', color: 'var(--color-text-primary)' }}
                                            >
                                                {cat.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* 匹配属性标签 */}
                            {matchedAttrs.length > 0 && (
                                <div style={{ marginBottom: 'var(--space-sm)' }}>
                                    <p style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
                                        🏷️ {matchedAttrs.length} 个属性已匹配
                                    </p>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                                        {matchedAttrs.slice(0, 6).map((a, i) => (
                                            <span key={i} style={{ fontSize: '0.62rem', padding: '2px 6px', background: 'rgba(16,185,129,0.1)', borderRadius: '10px', color: '#10b981' }}>
                                                {a._display_name}: {a._display_value}
                                            </span>
                                        ))}
                                        {matchedAttrs.length > 6 && (
                                            <span style={{ fontSize: '0.62rem', padding: '2px 6px', color: 'var(--color-text-muted)' }}>
                                                +{matchedAttrs.length - 6}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* SPU / 价格 / 库存 */}
                            {matchedCategory && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: 'var(--space-sm)' }}>
                                    <div>
                                        <label style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', marginBottom: '3px', display: 'block' }}>SPU 代码</label>
                                        <input
                                            type="text"
                                            value={skuCode}
                                            onChange={e => setSkuCode(e.target.value)}
                                            placeholder="TOPM-001"
                                            style={{ width: '100%', padding: '6px 10px', background: 'var(--color-bg-input)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-primary)', fontSize: '0.82rem' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', marginBottom: '3px', display: 'block' }}>售价 (MXN)</label>
                                        <input
                                            type="number"
                                            value={editPrice || ''}
                                            onChange={e => setEditPrice(parseFloat(e.target.value) || 0)}
                                            placeholder="0.00"
                                            step="0.01"
                                            min="0"
                                            style={{ width: '100%', padding: '6px 10px', background: 'var(--color-bg-input)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-primary)', fontSize: '0.82rem' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', marginBottom: '3px', display: 'block' }}>库存</label>
                                        <input
                                            type="number"
                                            value={editStock}
                                            onChange={e => setEditStock(parseInt(e.target.value) || 0)}
                                            placeholder="100"
                                            min="0"
                                            style={{ width: '100%', padding: '6px 10px', background: 'var(--color-bg-input)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-primary)', fontSize: '0.82rem' }}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* 生成按钮 */}
                            <button
                                className="btn btn-primary"
                                onClick={handleGenerateJson}
                                disabled={!matchedCategory}
                                style={{ width: '100%', marginBottom: 'var(--space-sm)' }}
                            >
                                <FileJson size={14} /> 生成 SHEIN JSON
                            </button>

                            {/* 下载/复制 */}
                            {generatedJson && (
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <button className="btn btn-primary btn-sm" onClick={handleDownload} style={{ flex: 1 }}>
                                        <Download size={12} /> 下载
                                    </button>
                                    <button className="btn btn-secondary btn-sm" onClick={handleCopy} style={{ flex: 1 }}>
                                        {copied ? <><Check size={12} /> 已复制</> : <><Copy size={12} /> 复制</>}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* 历史记录 */}
                    <div className="card">
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setShowHistory(!showHistory)}
                            style={{ width: '100%', marginBottom: showHistory ? '8px' : 0 }}
                        >
                            <Clock size={13} /> 历史记录 ({history.length})
                            {showHistory ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </button>

                        {showHistory && (
                            <div>
                                {history.length === 0 ? (
                                    <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textAlign: 'center', padding: '12px 0' }}>暂无记录</p>
                                ) : (
                                    <>
                                        <button className="btn btn-secondary btn-sm" onClick={clearHistory} style={{ marginBottom: '6px', fontSize: '0.68rem' }}>
                                            <Trash2 size={10} /> 清空
                                        </button>
                                        <div style={{ maxHeight: '300px', overflow: 'auto' }}>
                                            {history.map(item => (
                                                <div
                                                    key={item.id}
                                                    style={{
                                                        padding: '8px 10px',
                                                        marginBottom: '4px',
                                                        background: previewItem?.id === item.id ? 'rgba(99,102,241,0.15)' : 'var(--color-bg-input)',
                                                        borderRadius: 'var(--radius-sm)',
                                                        border: previewItem?.id === item.id ? '1px solid rgba(99,102,241,0.4)' : '1px solid transparent',
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                                                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                                                            {item.title.slice(0, 30)}{item.title.length > 30 ? '...' : ''}
                                                        </span>
                                                        <span style={{ fontSize: '0.6rem', color: 'var(--color-text-muted)' }}>
                                                            {new Date(item.timestamp).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
                                                        {item.skuCode} | ${item.price.toFixed(2)} MXN
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '4px' }}>
                                                        <button className="btn btn-secondary btn-sm" style={{ fontSize: '0.6rem', padding: '2px 6px' }} onClick={() => setPreviewItem(previewItem?.id === item.id ? null : item)}>
                                                            <Eye size={9} /> 预览
                                                        </button>
                                                        <button className="btn btn-primary btn-sm" style={{ fontSize: '0.6rem', padding: '2px 6px' }} onClick={() => { downloadJsonFile(item.json, `${item.skuCode}.json`); }}>
                                                            <Download size={9} /> 下载
                                                        </button>
                                                        <button className="btn btn-secondary btn-sm" style={{ fontSize: '0.6rem', padding: '2px 6px', color: '#ef4444' }} onClick={() => deleteHistoryItem(item.id)}>
                                                            <Trash2 size={9} />
                                                        </button>
                                                    </div>
                                                    {previewItem?.id === item.id && (
                                                        <pre style={{ marginTop: '6px', padding: '6px', background: 'var(--color-bg-primary)', borderRadius: 'var(--radius-sm)', fontSize: '0.58rem', overflow: 'auto', maxHeight: '180px', lineHeight: 1.4, color: 'var(--color-text-secondary)' }}>
                                                            {JSON.stringify(item.json, null, 2)}
                                                        </pre>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* ===== 右栏：数据显示 ===== */}
                {productData && (
                    <div style={{ position: 'sticky', top: 'var(--space-md)' }}>
                        {/* 产品数据清单 */}
                        <div className="card" style={{ marginBottom: 'var(--space-md)' }}>
                            <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                📊 产品数据清单
                            </h4>

                            {/* 基本信息表 */}
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', marginBottom: '12px' }}>
                                <thead>
                                    <tr>
                                        <th colSpan={2} style={{ textAlign: 'left', padding: '6px 10px', background: 'var(--color-accent-light)', color: 'var(--color-accent)', fontWeight: 600, borderRadius: '6px 6px 0 0', fontSize: '0.75rem' }}>
                                            基本信息
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[
                                        ['产品标题', productData.title],
                                        ['产品描述', productData.description],
                                        ['售价', `$${productData.price.toFixed(2)}`],
                                        ['产品类目', productData.category],
                                        ['图片数量', `${images.length} 张`],
                                    ].map(([label, value], i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                            <td style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--color-text-secondary)', width: '80px', verticalAlign: 'top', whiteSpace: 'nowrap', fontSize: '0.72rem' }}>{label}</td>
                                            <td style={{ padding: '6px 10px', color: 'var(--color-text-primary)', lineHeight: 1.5, fontSize: '0.72rem' }}>{value}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {/* 属性表 */}
                            {productData.attributes.length > 0 && (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', marginBottom: '12px' }}>
                                    <thead>
                                        <tr>
                                            <th colSpan={3} style={{ textAlign: 'left', padding: '6px 10px', background: 'rgba(139,92,246,0.1)', color: 'var(--color-secondary)', fontWeight: 600, borderRadius: '6px 6px 0 0', fontSize: '0.75rem' }}>
                                                🏷️ 产品属性 ({productData.attributes.length})
                                            </th>
                                        </tr>
                                        <tr style={{ background: 'var(--color-bg-secondary)' }}>
                                            <th style={{ padding: '4px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.68rem' }}>#</th>
                                            <th style={{ padding: '4px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.68rem' }}>属性名</th>
                                            <th style={{ padding: '4px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.68rem' }}>属性值</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {productData.attributes.map((a, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                <td style={{ padding: '4px 10px', color: 'var(--color-text-muted)', width: '25px', fontSize: '0.7rem' }}>{i + 1}</td>
                                                <td style={{ padding: '4px 10px', fontWeight: 600, color: 'var(--color-text-secondary)', fontSize: '0.7rem' }}>{a.key}</td>
                                                <td style={{ padding: '4px 10px', color: 'var(--color-text-primary)', fontSize: '0.7rem' }}>{a.value}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}

                            {/* SHEIN 匹配信息 */}
                            {matchedCategory && (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                                    <thead>
                                        <tr>
                                            <th colSpan={2} style={{ textAlign: 'left', padding: '6px 10px', background: 'rgba(16,185,129,0.1)', color: '#10b981', fontWeight: 600, borderRadius: '6px 6px 0 0', fontSize: '0.75rem' }}>
                                                🛍️ SHEIN 匹配
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                                            <td style={{ padding: '4px 10px', fontWeight: 600, color: 'var(--color-text-secondary)', width: '80px', fontSize: '0.7rem' }}>类目</td>
                                            <td style={{ padding: '4px 10px', color: 'var(--color-text-primary)', fontSize: '0.7rem' }}>{matchedCategory.label}</td>
                                        </tr>
                                        <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                                            <td style={{ padding: '4px 10px', fontWeight: 600, color: 'var(--color-text-secondary)', fontSize: '0.7rem' }}>Category ID</td>
                                            <td style={{ padding: '4px 10px', color: 'var(--color-text-primary)', fontSize: '0.7rem' }}>{matchedCategory.categoryId}</td>
                                        </tr>
                                        <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                                            <td style={{ padding: '4px 10px', fontWeight: 600, color: 'var(--color-text-secondary)', fontSize: '0.7rem' }}>Product Type</td>
                                            <td style={{ padding: '4px 10px', color: 'var(--color-text-primary)', fontSize: '0.7rem' }}>{matchedCategory.productTypeId}</td>
                                        </tr>
                                        <tr>
                                            <td style={{ padding: '4px 10px', fontWeight: 600, color: 'var(--color-text-secondary)', fontSize: '0.7rem' }}>匹配属性</td>
                                            <td style={{ padding: '4px 10px', color: 'var(--color-text-primary)', fontSize: '0.7rem' }}>{matchedAttrs.length} 个</td>
                                        </tr>
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {/* JSON 预览 */}
                        {generatedJson && (
                            <div className="card">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <h4 style={{ fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        📄 JSON 预览
                                    </h4>
                                    <button className="btn btn-secondary btn-sm" style={{ fontSize: '0.65rem', padding: '2px 8px' }} onClick={() => setShowJson(!showJson)}>
                                        {showJson ? <><ChevronUp size={12} /> 收起</> : <><ChevronDown size={12} /> 展开</>}
                                    </button>
                                </div>
                                {showJson && (
                                    <pre style={{ padding: '10px', background: 'var(--color-bg-primary)', borderRadius: 'var(--radius-sm)', fontSize: '0.62rem', overflow: 'auto', maxHeight: '500px', lineHeight: 1.4, color: 'var(--color-text-secondary)' }}>
                                        {JSON.stringify(generatedJson, null, 2)}
                                    </pre>
                                )}
                                {!showJson && (
                                    <p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                                        📂 {matchedCategory?.label?.split(' → ').pop()} | 🏷️ {matchedAttrs.length} 属性 | SKU: {skuCode}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

