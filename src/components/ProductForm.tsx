import { Plus, Trash2 } from 'lucide-react';
import type { ProductAttribute } from '../types';

interface ProductFormProps {
    title: string;
    description: string;
    price: number;
    currency: string;
    category: string;
    attributes: ProductAttribute[];
    onTitleChange: (v: string) => void;
    onDescriptionChange: (v: string) => void;
    onPriceChange: (v: number) => void;
    onCurrencyChange: (v: string) => void;
    onCategoryChange: (v: string) => void;
    onAttributesChange: (v: ProductAttribute[]) => void;
}

const CATEGORIES = [
    '数码电子', '服装鞋帽', '家居家具', '美妆个护', '食品饮料',
    '运动户外', '母婴玩具', '图书文具', '珠宝配饰', '汽车用品', '其他'
];

const CURRENCIES = [
    { code: 'CNY', label: '¥ 人民币' },
    { code: 'USD', label: '$ 美元' },
    { code: 'EUR', label: '€ 欧元' },
    { code: 'MXN', label: '$ 墨西哥比索' },
];

export default function ProductForm({
    title, description, price, currency, category, attributes,
    onTitleChange, onDescriptionChange, onPriceChange, onCurrencyChange, onCategoryChange, onAttributesChange
}: ProductFormProps) {

    const addAttribute = () => {
        onAttributesChange([...attributes, { key: '', value: '' }]);
    };

    const removeAttribute = (index: number) => {
        onAttributesChange(attributes.filter((_, i) => i !== index));
    };

    const updateAttribute = (index: number, field: 'key' | 'value', value: string) => {
        const updated = attributes.map((attr, i) =>
            i === index ? { ...attr, [field]: value } : attr
        );
        onAttributesChange(updated);
    };

    return (
        <div>
            <div className="form-group">
                <label className="form-label">产品标题</label>
                <input
                    type="text"
                    className="form-input"
                    value={title}
                    onChange={e => onTitleChange(e.target.value)}
                    placeholder="输入产品标题..."
                />
            </div>

            <div className="form-group">
                <label className="form-label">产品描述</label>
                <textarea
                    className="form-textarea"
                    value={description}
                    onChange={e => onDescriptionChange(e.target.value)}
                    placeholder="输入产品描述..."
                    rows={4}
                />
            </div>

            <div className="form-row">
                <div className="form-group">
                    <label className="form-label">价格</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <select
                            className="form-select"
                            value={currency}
                            onChange={e => onCurrencyChange(e.target.value)}
                            style={{ width: '140px', flexShrink: 0 }}
                        >
                            {CURRENCIES.map(c => (
                                <option key={c.code} value={c.code}>{c.label}</option>
                            ))}
                        </select>
                        <input
                            type="number"
                            className="form-input"
                            value={price}
                            onChange={e => onPriceChange(parseFloat(e.target.value) || 0)}
                            placeholder="0.00"
                            min={0}
                            step={0.01}
                        />
                    </div>
                </div>
                <div className="form-group">
                    <label className="form-label">产品类目</label>
                    <select
                        className="form-select"
                        value={category}
                        onChange={e => onCategoryChange(e.target.value)}
                    >
                        {CATEGORIES.map(c => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    电商参数属性
                    <button className="btn btn-ghost btn-sm" onClick={addAttribute}>
                        <Plus size={14} /> 添加
                    </button>
                </label>
                <div className="attributes-list">
                    {attributes.map((attr, i) => (
                        <div key={i} className="attribute-row">
                            <input
                                type="text"
                                className="form-input"
                                value={attr.key}
                                onChange={e => updateAttribute(i, 'key', e.target.value)}
                                placeholder="属性名"
                            />
                            <input
                                type="text"
                                className="form-input"
                                value={attr.value}
                                onChange={e => updateAttribute(i, 'value', e.target.value)}
                                placeholder="属性值"
                            />
                            <button
                                className="btn btn-icon btn-ghost"
                                onClick={() => removeAttribute(i)}
                                style={{ color: 'var(--color-danger)' }}
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))}
                    {attributes.length === 0 && (
                        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '12px' }}>
                            暂无属性，点击"添加"按钮添加
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
