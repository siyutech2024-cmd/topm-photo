import { useState } from 'react';
import { Download, X, ZoomIn } from 'lucide-react';

interface ImagePreviewProps {
    productImages: string[];
    effectImages: string[];
}

export default function ImagePreview({ productImages, effectImages }: ImagePreviewProps) {
    const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

    const handleDownload = (src: string, name: string) => {
        const a = document.createElement('a');
        a.href = src;
        a.download = name;
        a.click();
    };

    return (
        <div className="image-gallery">
            <div className="image-gallery-section">
                <h3>
                    产品展示图
                    <span className="badge">{productImages.length} 张</span>
                </h3>
                <div className="image-gallery-grid">
                    {productImages.map((img, i) => (
                        <div key={i} className="image-gallery-item" onClick={() => setLightboxSrc(img)}>
                            <img src={img} alt={`产品图 ${i + 1}`} />
                            <div className="image-gallery-item-overlay">
                                <span>产品图 {i + 1}</span>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <button
                                        className="btn btn-icon btn-ghost"
                                        style={{ width: 28, height: 28, background: 'rgba(255,255,255,0.2)' }}
                                        onClick={(e) => { e.stopPropagation(); setLightboxSrc(img); }}
                                    >
                                        <ZoomIn size={14} color="#fff" />
                                    </button>
                                    <button
                                        className="btn btn-icon btn-ghost"
                                        style={{ width: 28, height: 28, background: 'rgba(255,255,255,0.2)' }}
                                        onClick={(e) => { e.stopPropagation(); handleDownload(img, `产品图_${i + 1}.jpg`); }}
                                    >
                                        <Download size={14} color="#fff" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="image-gallery-section">
                <h3>
                    场景效果图
                    <span className="badge">{effectImages.length} 张</span>
                </h3>
                <div className="image-gallery-grid">
                    {effectImages.map((img, i) => (
                        <div key={i} className="image-gallery-item" onClick={() => setLightboxSrc(img)}>
                            <img src={img} alt={`效果图 ${i + 1}`} />
                            <div className="image-gallery-item-overlay">
                                <span>效果图 {i + 1}</span>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <button
                                        className="btn btn-icon btn-ghost"
                                        style={{ width: 28, height: 28, background: 'rgba(255,255,255,0.2)' }}
                                        onClick={(e) => { e.stopPropagation(); setLightboxSrc(img); }}
                                    >
                                        <ZoomIn size={14} color="#fff" />
                                    </button>
                                    <button
                                        className="btn btn-icon btn-ghost"
                                        style={{ width: 28, height: 28, background: 'rgba(255,255,255,0.2)' }}
                                        onClick={(e) => { e.stopPropagation(); handleDownload(img, `效果图_${i + 1}.jpg`); }}
                                    >
                                        <Download size={14} color="#fff" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {lightboxSrc && (
                <div className="lightbox" onClick={() => setLightboxSrc(null)}>
                    <img src={lightboxSrc} alt="预览" />
                    <button className="lightbox-close" onClick={() => setLightboxSrc(null)}>
                        <X size={20} />
                    </button>
                </div>
            )}
        </div>
    );
}
