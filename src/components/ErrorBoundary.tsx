import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    errorMessage: string;
}

export default class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, errorMessage: '' };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, errorMessage: error.message };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('ErrorBoundary caught:', error, info.componentStack);
    }

    render() {
        if (this.state.hasError) {
            return this.props.fallback || (
                <div style={{
                    padding: '40px 20px',
                    textAlign: 'center',
                }}>
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 48, height: 48,
                        borderRadius: '50%',
                        background: 'rgba(239,68,68,0.1)',
                        marginBottom: '12px',
                    }}>
                        ⚠️
                    </div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '8px' }}>
                        页面加载出错
                    </h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
                        {this.state.errorMessage || '发生了未知错误'}
                    </p>
                    <button
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                            this.setState({ hasError: false, errorMessage: '' });
                            window.location.reload();
                        }}
                    >
                        🔄 刷新页面
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
