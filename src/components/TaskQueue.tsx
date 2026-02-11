import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader, Check, AlertCircle, X, ChevronDown, ChevronUp } from 'lucide-react';
import { taskManager, type BackgroundTask } from '../services/taskManager';

export default function TaskQueue() {
    const navigate = useNavigate();
    const [tasks, setTasks] = useState<BackgroundTask[]>([]);
    const [collapsed, setCollapsed] = useState(false);

    useEffect(() => {
        return taskManager.subscribe(setTasks);
    }, []);

    const activeTasks = tasks.filter(t => t.status === 'queued' || t.status === 'running');
    const doneTasks = tasks.filter(t => t.status === 'completed' || t.status === 'failed');
    const allTasks = [...activeTasks, ...doneTasks];

    if (allTasks.length === 0) return null;

    return (
        <div style={{
            position: 'fixed',
            bottom: 20,
            right: 20,
            zIndex: 9999,
            width: 340,
            maxHeight: collapsed ? 48 : 400,
            overflow: 'hidden',
            borderRadius: 'var(--radius-xl)',
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.25), 0 2px 8px rgba(0,0,0,0.15)',
            transition: 'max-height 0.3s ease',
        }}>
            {/* Header */}
            <div
                onClick={() => setCollapsed(!collapsed)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    cursor: 'pointer',
                    borderBottom: collapsed ? 'none' : '1px solid var(--color-border)',
                    background: activeTasks.length > 0 ? 'rgba(99,102,241,0.08)' : 'transparent',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', fontWeight: 600 }}>
                    {activeTasks.length > 0 ? (
                        <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} color="var(--color-accent)" />
                    ) : (
                        <Check size={16} color="var(--color-success)" />
                    )}
                    <span>
                        {activeTasks.length > 0
                            ? `${activeTasks.length} 个任务生成中...`
                            : '任务已完成'}
                    </span>
                </div>
                {collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>

            {/* Task list */}
            {!collapsed && (
                <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                    {allTasks.map(task => (
                        <div
                            key={task.id}
                            style={{
                                padding: '12px 16px',
                                borderBottom: '1px solid var(--color-border)',
                                cursor: task.status === 'completed' ? 'pointer' : 'default',
                            }}
                            onClick={() => {
                                if (task.status === 'completed') {
                                    navigate(`/products/${task.productId}`);
                                    taskManager.dismissTask(task.id);
                                }
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {task.status === 'running' && (
                                        <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} color="var(--color-accent)" />
                                    )}
                                    {task.status === 'queued' && (
                                        <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--color-text-muted)' }} />
                                    )}
                                    {task.status === 'completed' && <Check size={12} color="var(--color-success)" />}
                                    {task.status === 'failed' && <AlertCircle size={12} color="var(--color-danger)" />}
                                    <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>
                                        产品 #{task.productId}
                                    </span>
                                </div>
                                {(task.status === 'completed' || task.status === 'failed') && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); taskManager.dismissTask(task.id); }}
                                        style={{
                                            background: 'none', border: 'none', cursor: 'pointer',
                                            color: 'var(--color-text-muted)', padding: 2,
                                        }}
                                    >
                                        <X size={12} />
                                    </button>
                                )}
                            </div>

                            {/* Progress bar */}
                            {(task.status === 'running' || task.status === 'queued') && (
                                <div style={{
                                    width: '100%', height: 4, background: 'var(--color-bg-input)',
                                    borderRadius: 2, marginBottom: 4, overflow: 'hidden',
                                }}>
                                    <div style={{
                                        width: `${task.progress}%`,
                                        height: '100%',
                                        background: 'var(--color-accent)',
                                        borderRadius: 2,
                                        transition: 'width 0.3s ease',
                                    }} />
                                </div>
                            )}

                            <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                                {task.status === 'completed' ? (
                                    <span style={{ color: 'var(--color-success)' }}>✓ 点击查看产品</span>
                                ) : task.status === 'failed' ? (
                                    <span style={{ color: 'var(--color-danger)' }}>{task.error || '生成失败'}</span>
                                ) : (
                                    <span>{task.message} {task.progress > 0 && `${task.progress}%`}</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
