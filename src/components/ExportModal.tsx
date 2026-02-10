import { useState } from 'react';
import { X, FileSpreadsheet, FolderArchive } from 'lucide-react';
import type { Product } from '../types';
import { exportProductsToExcel, exportProductsWithImages } from '../services/exportService';

interface ExportModalProps {
    products: Product[];
    onClose: () => void;
}

export default function ExportModal({ products, onClose }: ExportModalProps) {
    const [exporting, setExporting] = useState(false);
    const [exportType, setExportType] = useState<'excel' | 'zip'>('zip');

    const handleExport = async () => {
        setExporting(true);
        try {
            if (exportType === 'excel') {
                await exportProductsToExcel(products);
            } else {
                await exportProductsWithImages(products);
            }
            onClose();
        } catch (err) {
            console.error('Export failed:', err);
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>导出数据</h2>
                    <button className="btn btn-icon btn-ghost" onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginBottom: 'var(--space-lg)' }}>
                    已选择 <strong style={{ color: 'var(--color-accent)' }}>{products.length}</strong> 个产品进行导出
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                    <label
                        className="card"
                        style={{
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--space-md)',
                            borderColor: exportType === 'excel' ? 'var(--color-accent)' : undefined,
                            padding: 'var(--space-md)',
                        }}
                    >
                        <input
                            type="radio"
                            name="exportType"
                            checked={exportType === 'excel'}
                            onChange={() => setExportType('excel')}
                            style={{ display: 'none' }}
                        />
                        <div style={{
                            width: 40, height: 40, borderRadius: 'var(--radius-md)',
                            background: 'rgba(52, 211, 153, 0.12)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'var(--color-success)'
                        }}>
                            <FileSpreadsheet size={20} />
                        </div>
                        <div>
                            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>仅导出 Excel</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                                包含产品标题、描述、价格、属性等数据
                            </div>
                        </div>
                    </label>

                    <label
                        className="card"
                        style={{
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--space-md)',
                            borderColor: exportType === 'zip' ? 'var(--color-accent)' : undefined,
                            padding: 'var(--space-md)',
                        }}
                    >
                        <input
                            type="radio"
                            name="exportType"
                            checked={exportType === 'zip'}
                            onChange={() => setExportType('zip')}
                            style={{ display: 'none' }}
                        />
                        <div style={{
                            width: 40, height: 40, borderRadius: 'var(--radius-md)',
                            background: 'var(--color-accent-light)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'var(--color-accent)'
                        }}>
                            <FolderArchive size={20} />
                        </div>
                        <div>
                            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>导出 Excel + 图片</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                                包含数据表格和所有产品图、效果图 ZIP 包
                            </div>
                        </div>
                    </label>
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>取消</button>
                    <button className="btn btn-primary" onClick={handleExport} disabled={exporting}>
                        {exporting ? '导出中...' : '开始导出'}
                    </button>
                </div>
            </div>
        </div>
    );
}
