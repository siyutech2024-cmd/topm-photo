import { Sparkles } from 'lucide-react';

interface GeneratingAnimationProps {
    progress: number;
    message: string;
}

export default function GeneratingAnimation({ progress, message }: GeneratingAnimationProps) {
    return (
        <div className="generating-container">
            <div className="generating-spinner">
                <div className="generating-spinner-inner">
                    <Sparkles />
                </div>
            </div>

            <p className="generating-message">{message}</p>
            <p className="generating-sub">AI 正在为您的产品创作精美图片</p>

            <div className="generating-progress">
                <div className="generating-progress-bar">
                    <div
                        className="generating-progress-fill"
                        style={{ width: `${progress}%` }}
                    />
                </div>
                <div className="generating-progress-text">
                    <span>{message}</span>
                    <span>{progress}%</span>
                </div>
            </div>
        </div>
    );
}
