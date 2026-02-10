export function formatDate(date: Date): string {
    return new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    }).format(new Date(date));
}

export function formatPrice(price: number, currency: string = 'CNY'): string {
    return new Intl.NumberFormat('zh-CN', {
        style: 'currency',
        currency,
    }).format(price);
}

export function generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

export function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

export function base64ToBlob(base64: string): Blob {
    const parts = base64.split(',');
    const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
    const bstr = atob(parts[1]);
    const n = bstr.length;
    const u8arr = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
        u8arr[i] = bstr.charCodeAt(i);
    }
    return new Blob([u8arr], { type: mime });
}

export function truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

export function getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
        draft: '草稿',
        generated: '已生成',
        published: '已发布'
    };
    return labels[status] || status;
}

export function getStatusColor(status: string): string {
    const colors: Record<string, string> = {
        draft: 'var(--color-warning)',
        generated: 'var(--color-info)',
        published: 'var(--color-success)'
    };
    return colors[status] || 'var(--color-text-secondary)';
}
