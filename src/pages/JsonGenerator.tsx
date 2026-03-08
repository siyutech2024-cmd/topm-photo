import { useState, useCallback } from 'react';
import { Upload, FileJson, Download, Copy, Check, Loader, AlertTriangle, CheckCircle, Search, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
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

    // JSON 输出
    const [generatedJson, setGeneratedJson] = useState<Record<string, unknown> | null>(null);
    const [showJson, setShowJson] = useState(false);
    const [copied, setCopied] = useState(false);

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
                    sheinBlock = `\n\nAdemás, tienes acceso a las siguientes categorías reales de SHEIN (formato: categoryId|productTypeId|ruta):
---SHEIN_CATEGORIES_START---
${catList}
---SHEIN_CATEGORIES_END---

Debes elegir la categoría SHEIN que MEJOR coincida con este producto y devolver los campos adicionales:
  "shein_category_id": número (el categoryId de la lista anterior),
  "shein_product_type_id": número (el productTypeId de la lista anterior),
Si ninguna categoría coincide, pon 0 en ambos campos.`;
                }
            } catch { /* no cache */ }

            setProgress('🤖 AI 正在分析产品图片...');
            const data = await callGeminiForProductInfo(images, sheinBlock);
            setProductData(data);

            // 匹配 SHEIN 类目
            setProgress('匹配 SHEIN 类目和属性...');
            let cats = await getLocalCategories();

            // 缓存为空 → 自动从本地打包数据加载
            if (cats.length === 0) {
                setProgress('📦 首次使用，正在加载 SHEIN 类目数据...');
                await loadBundledCategories((msg) => setProgress(msg));
                cats = await getLocalCategories();
            }

            if (cats.length > 0 && data.shein_category_id) {
                const matched = cats.find(c => c.categoryId === data.shein_category_id);
                if (matched) {
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

            // Fallback: 关键词匹配
            if (!matchedCategory && cats.length > 0) {
                const searched = searchLocalCategories(cats, `${data.title} ${data.category}`);
                if (searched.length > 0) {
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

    // 生成 SHEIN JSON
    const handleGenerateJson = () => {
        if (!productData || !matchedCategory) return;

        const product = {
            title: productData.title,
            description: productData.description,
            price: productData.price,
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

        setGeneratedJson(json as unknown as Record<string, unknown>);
        setShowJson(false);
        setCopied(false);
    };

    const handleDownload = () => {
        if (!generatedJson) return;
        const name = productData?.title?.replace(/\s+/g, '_').slice(0, 30) || 'product';
        downloadJsonFile(generatedJson, `shein_${name}_${Date.now()}.json`);
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
                <p>上传产品图片 → AI 自动生成 SHEIN 上架 JSON 文件（无需生图）</p>
            </div>

            <div style={{ maxWidth: 800, position: 'relative', zIndex: 1 }}>
                {/* Step 1: 上传图片 */}
                <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ background: 'var(--color-accent)', color: '#fff', width: 24, height: 24, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700 }}>1</span>
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
                            borderRadius: 'var(--radius-lg)',
                            padding: 'var(--space-xl)',
                            textAlign: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            background: dragOver ? 'var(--color-accent-light)' : 'transparent',
                        }}
                    >
                        <Upload size={32} style={{ color: 'var(--color-text-muted)', marginBottom: '8px' }} />
                        <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>拖拽或点击上传产品图片</p>
                        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>支持 JPG / PNG / WebP</p>
                        <input id="json-gen-file-input" type="file" accept="image/*" multiple onChange={handleFileInput} style={{ display: 'none' }} />
                    </div>

                    {images.length > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '8px', marginTop: 'var(--space-md)' }}>
                            {images.map((img, i) => (
                                <div key={i} style={{ position: 'relative', borderRadius: 'var(--radius-md)', overflow: 'hidden', aspectRatio: '1', background: 'var(--color-bg-input)' }}>
                                    <img src={img} alt={`产品图 ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    <button
                                        onClick={(e) => { e.stopPropagation(); removeImage(i); }}
                                        style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem' }}
                                    >
                                        <Trash2 size={10} />
                                    </button>
                                    {i === 0 && (
                                        <span style={{ position: 'absolute', bottom: 4, left: 4, background: 'var(--color-accent)', color: '#fff', fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px' }}>
                                            主图
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Step 2: AI 分析 */}
                <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ background: 'var(--color-secondary)', color: '#fff', width: 24, height: 24, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700 }}>2</span>
                        AI 产品分析
                    </h3>

                    {!hasGemini && (
                        <div style={{ padding: '12px', background: 'rgba(251,191,36,0.08)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-md)', fontSize: '0.8rem', color: '#b45309' }}>
                            <AlertTriangle size={14} style={{ verticalAlign: 'middle' }} /> 需要配置 Gemini API 才能使用 AI 分析
                        </div>
                    )}

                    <button
                        className="btn btn-primary"
                        onClick={handleAnalyze}
                        disabled={images.length === 0 || analyzing || !hasGemini}
                        style={{ width: '100%', marginBottom: 'var(--space-md)' }}
                    >
                        {analyzing ? (
                            <><Loader size={16} className="spin" /> {progress}</>
                        ) : (
                            <><FileJson size={16} /> 🤖 AI 分析产品 → 生成数据</>
                        )}
                    </button>

                    {progress && !analyzing && (
                        <p style={{ fontSize: '0.78rem', color: progress.startsWith('❌') ? 'var(--color-danger)' : 'var(--color-success)', marginBottom: 'var(--space-md)' }}>
                            {progress}
                        </p>
                    )}

                    {/* 产品数据表格清单 */}
                    {productData && (
                        <div style={{ background: 'var(--color-bg-input)', borderRadius: 'var(--radius-md)', padding: 'var(--space-md)', overflow: 'auto' }}>
                            <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                📊 产品数据清单
                            </h4>

                            {/* 基本信息表 */}
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', marginBottom: '16px' }}>
                                <thead>
                                    <tr>
                                        <th colSpan={2} style={{ textAlign: 'left', padding: '8px 12px', background: 'var(--color-accent-light)', color: 'var(--color-accent)', fontWeight: 600, borderRadius: '6px 6px 0 0', fontSize: '0.8rem' }}>
                                            基本信息
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[
                                        ['产品标题', productData.title],
                                        ['产品描述', productData.description],
                                        ['售价 (USD)', `$${productData.price.toFixed(2)}`],
                                        ['产品类目', productData.category],
                                        ['图片数量', `${images.length} 张`],
                                    ].map(([label, value], i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                            <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--color-text-secondary)', width: '120px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{label}</td>
                                            <td style={{ padding: '8px 12px', color: 'var(--color-text-primary)', lineHeight: 1.6 }}>{value}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {/* 属性表 */}
                            {productData.attributes.length > 0 && (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', marginBottom: '16px' }}>
                                    <thead>
                                        <tr>
                                            <th colSpan={3} style={{ textAlign: 'left', padding: '8px 12px', background: 'rgba(139,92,246,0.1)', color: 'var(--color-secondary)', fontWeight: 600, borderRadius: '6px 6px 0 0', fontSize: '0.8rem' }}>
                                                🏷️ 产品属性 ({productData.attributes.length})
                                            </th>
                                        </tr>
                                        <tr style={{ background: 'var(--color-bg-secondary)' }}>
                                            <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.72rem' }}>#</th>
                                            <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.72rem' }}>属性名</th>
                                            <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.72rem' }}>属性值</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {productData.attributes.map((a, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                <td style={{ padding: '6px 12px', color: 'var(--color-text-muted)', width: '30px' }}>{i + 1}</td>
                                                <td style={{ padding: '6px 12px', fontWeight: 600, color: 'var(--color-text-secondary)', width: '120px' }}>{a.key}</td>
                                                <td style={{ padding: '6px 12px', color: 'var(--color-text-primary)' }}>{a.value}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}

                            {/* SHEIN 匹配信息 */}
                            {(productData.shein_category_id || matchedCategory) && (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                    <thead>
                                        <tr>
                                            <th colSpan={2} style={{ textAlign: 'left', padding: '8px 12px', background: 'rgba(16,185,129,0.1)', color: '#10b981', fontWeight: 600, borderRadius: '6px 6px 0 0', fontSize: '0.8rem' }}>
                                                🛍️ SHEIN 匹配
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {matchedCategory && (
                                            <>
                                                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                    <td style={{ padding: '6px 12px', fontWeight: 600, color: 'var(--color-text-secondary)', width: '120px' }}>类目路径</td>
                                                    <td style={{ padding: '6px 12px', color: 'var(--color-text-primary)' }}>{matchedCategory.label}</td>
                                                </tr>
                                                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                    <td style={{ padding: '6px 12px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Category ID</td>
                                                    <td style={{ padding: '6px 12px', color: 'var(--color-text-primary)' }}>{matchedCategory.categoryId}</td>
                                                </tr>
                                                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                    <td style={{ padding: '6px 12px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Product Type</td>
                                                    <td style={{ padding: '6px 12px', color: 'var(--color-text-primary)' }}>{matchedCategory.productTypeId}</td>
                                                </tr>
                                            </>
                                        )}
                                        <tr>
                                            <td style={{ padding: '6px 12px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>匹配属性</td>
                                            <td style={{ padding: '6px 12px', color: 'var(--color-text-primary)' }}>{matchedAttrs.length} 个</td>
                                        </tr>
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}
                </div>

                {/* Step 3: SHEIN 类目匹配 + JSON 生成 */}
                {productData && (
                    <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ background: '#10b981', color: '#fff', width: 24, height: 24, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700 }}>3</span>
                            SHEIN 类目匹配
                        </h3>

                        {matchedCategory ? (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'rgba(16,185,129,0.08)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-md)' }}>
                                <div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                                        <CheckCircle size={14} style={{ color: '#10b981', verticalAlign: 'middle' }} /> {matchedCategory.label}
                                    </div>
                                    <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                                        🤖 AI 自动匹配 | ID: {matchedCategory.categoryId} | Type: {matchedCategory.productTypeId}
                                    </div>
                                </div>
                                <button className="btn btn-secondary btn-sm" onClick={() => setShowCategoryPicker(!showCategoryPicker)}>
                                    更换
                                </button>
                            </div>
                        ) : (
                            <div style={{ padding: '12px', background: 'rgba(251,191,36,0.08)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-md)', fontSize: '0.8rem', color: '#b45309' }}>
                                <AlertTriangle size={14} style={{ verticalAlign: 'middle' }} /> 未找到匹配类目。请前往设置同步 SHEIN 数据，或手动搜索。
                                <button className="btn btn-secondary btn-sm" onClick={() => setShowCategoryPicker(true)} style={{ marginLeft: '8px' }}>
                                    <Search size={12} /> 搜索类目
                                </button>
                            </div>
                        )}

                        {showCategoryPicker && (
                            <div style={{ marginBottom: 'var(--space-md)' }}>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="搜索 SHEIN 类目..."
                                    value={catSearch}
                                    onChange={e => handleCatSearch(e.target.value)}
                                    style={{ width: '100%', marginBottom: '8px' }}
                                />
                                {catResults.map((cat, i) => (
                                    <button
                                        key={i}
                                        className="cat-item"
                                        onClick={() => selectCategory(cat)}
                                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', marginBottom: '2px', background: 'var(--color-bg-input)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--color-text-primary)' }}
                                    >
                                        {cat.label}
                                    </button>
                                ))}
                            </div>
                        )}

                        {matchedAttrs.length > 0 && (
                            <div style={{ marginBottom: 'var(--space-md)' }}>
                                <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: '6px' }}>
                                    🏷️ {matchedAttrs.length} 个属性已自动匹配
                                </p>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                    {matchedAttrs.slice(0, 8).map((a, i) => (
                                        <span key={i} style={{ fontSize: '0.68rem', padding: '2px 8px', background: 'rgba(16,185,129,0.1)', borderRadius: '12px', color: '#10b981' }}>
                                            {a._display_name}: {a._display_value}
                                        </span>
                                    ))}
                                    {matchedAttrs.length > 8 && (
                                        <span style={{ fontSize: '0.68rem', padding: '2px 8px', color: 'var(--color-text-muted)' }}>
                                            +{matchedAttrs.length - 8} más
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}

                        <button
                            className="btn btn-primary"
                            onClick={handleGenerateJson}
                            disabled={!matchedCategory}
                            style={{ width: '100%', marginBottom: 'var(--space-md)' }}
                        >
                            <FileJson size={16} /> 生成 SHEIN JSON
                        </button>

                        {generatedJson && (
                            <>
                                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                    <button className="btn btn-primary btn-sm" onClick={handleDownload} style={{ flex: 1 }}>
                                        <Download size={14} /> 下载 .json
                                    </button>
                                    <button className="btn btn-secondary btn-sm" onClick={handleCopy} style={{ flex: 1 }}>
                                        {copied ? <><Check size={14} /> 已复制</> : <><Copy size={14} /> 复制 JSON</>}
                                    </button>
                                </div>

                                <button className="btn btn-secondary btn-sm" onClick={() => setShowJson(!showJson)} style={{ width: '100%' }}>
                                    {showJson ? <><ChevronUp size={14} /> 收起</> : <><ChevronDown size={14} /> 预览 JSON</>}
                                </button>

                                {showJson && (
                                    <pre style={{ marginTop: '8px', padding: '12px', background: 'var(--color-bg-primary)', borderRadius: 'var(--radius-md)', fontSize: '0.68rem', overflow: 'auto', maxHeight: '400px', lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>
                                        {JSON.stringify(generatedJson, null, 2)}
                                    </pre>
                                )}

                                <p style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: '8px' }}>
                                    📂 {matchedCategory?.label} | 🖼️ {images.length} 张图片 | 🏷️ {matchedAttrs.length} 个属性
                                </p>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
