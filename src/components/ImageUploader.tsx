import { useState, useRef, useCallback } from 'react';
import { Upload, X } from 'lucide-react';
import { fileToBase64 } from '../utils/helpers';

interface ImageUploaderProps {
    images: string[];
    onImagesChange: (images: string[]) => void;
    maxImages?: number;
}

export default function ImageUploader({ images, onImagesChange, maxImages = 4 }: ImageUploaderProps) {
    const [isDragOver, setIsDragOver] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleFiles = useCallback(async (files: FileList | File[]) => {
        const fileArr = Array.from(files).filter(f => f.type.startsWith('image/'));
        const remaining = maxImages - images.length;
        const toProcess = fileArr.slice(0, remaining);

        const newImages: string[] = [];
        for (const file of toProcess) {
            const base64 = await fileToBase64(file);
            newImages.push(base64);
        }

        onImagesChange([...images, ...newImages]);
    }, [images, maxImages, onImagesChange]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        handleFiles(e.dataTransfer.files);
    }, [handleFiles]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback(() => {
        setIsDragOver(false);
    }, []);

    const handleRemove = useCallback((index: number) => {
        onImagesChange(images.filter((_, i) => i !== index));
    }, [images, onImagesChange]);

    const handleClick = useCallback(() => {
        inputRef.current?.click();
    }, []);

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            handleFiles(e.target.files);
        }
        e.target.value = '';
    }, [handleFiles]);

    return (
        <div>
            {images.length < maxImages && (
                <div
                    className={`upload-zone ${isDragOver ? 'drag-over' : ''}`}
                    onClick={handleClick}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                >
                    <div className="upload-zone-icon">
                        <Upload />
                    </div>
                    <div className="upload-zone-text">
                        <h3>上传产品实拍图</h3>
                        <p>
                            拖拽图片到此处，或 <span className="highlight">点击选择</span>
                        </p>
                        <p style={{ marginTop: '8px', fontSize: '0.78rem' }}>
                            支持 JPG、PNG 格式 · 还可上传 {maxImages - images.length} 张
                        </p>
                    </div>
                    <input
                        ref={inputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        style={{ display: 'none' }}
                        onChange={handleInputChange}
                    />
                </div>
            )}

            {images.length > 0 && (
                <div className="upload-previews">
                    {images.map((img, i) => (
                        <div key={i} className="upload-preview-item">
                            <img src={img} alt={`预览 ${i + 1}`} />
                            <button
                                className="upload-preview-remove"
                                onClick={(e) => { e.stopPropagation(); handleRemove(i); }}
                            >
                                <X />
                            </button>
                            <div className="upload-preview-badge">图 {i + 1}</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
