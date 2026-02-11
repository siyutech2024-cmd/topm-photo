/**
 * 后台任务管理器
 * 管理 AI 产品生成的后台任务队列，用户可以继续操作不被阻塞
 */

import { generateProductContent } from './aiGenerator';
import { updateProduct } from './productService';
import type { GenerationResult } from '../types';

export interface BackgroundTask {
    id: string;            // task ID (same as product ID)
    productId: string;
    sourceImages: string[];
    status: 'queued' | 'running' | 'completed' | 'failed';
    progress: number;      // 0-100
    message: string;
    result?: GenerationResult;
    error?: string;
    createdAt: number;
}

type TaskListener = (tasks: BackgroundTask[]) => void;

class TaskManager {
    private tasks: Map<string, BackgroundTask> = new Map();
    private listeners: Set<TaskListener> = new Set();
    private processing = false;
    private queue: string[] = [];

    subscribe(listener: TaskListener): () => void {
        this.listeners.add(listener);
        listener(this.getAll());
        return () => this.listeners.delete(listener);
    }

    private notify() {
        const all = this.getAll();
        this.listeners.forEach(fn => fn(all));
    }

    getAll(): BackgroundTask[] {
        return Array.from(this.tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
    }

    /** Add a generation task to the queue */
    addTask(productId: string, sourceImages: string[]) {
        const task: BackgroundTask = {
            id: productId,
            productId,
            sourceImages,
            status: 'queued',
            progress: 0,
            message: '排队中...',
            createdAt: Date.now(),
        };
        this.tasks.set(productId, task);
        this.queue.push(productId);
        this.notify();
        this.processNext();
    }

    /** Remove a completed/failed task from the list */
    dismissTask(taskId: string) {
        this.tasks.delete(taskId);
        this.notify();
    }

    private async processNext() {
        if (this.processing || this.queue.length === 0) return;

        this.processing = true;
        const taskId = this.queue.shift()!;
        const task = this.tasks.get(taskId);

        if (!task) {
            this.processing = false;
            this.processNext();
            return;
        }

        // Update status to running
        task.status = 'running';
        task.message = '正在启动 AI 生成...';
        this.notify();

        try {
            const result = await generateProductContent(task.sourceImages, (p, msg) => {
                task.progress = Math.round(p * 100);
                task.message = msg;
                this.notify();
            });

            // Update product in DB with generated content
            await updateProduct(task.productId, {
                title: result.title,
                description: result.description,
                price: result.price,
                category: result.category,
                attributes: result.attributes,
                product_images: result.productImages,
                effect_images: result.effectImages,
                grid_images: result.gridImages,
                status: 'generated',
            });

            task.status = 'completed';
            task.progress = 100;
            task.message = '生成完成！';
            task.result = result;
        } catch (err) {
            task.status = 'failed';
            task.progress = 0;
            task.message = '生成失败';
            task.error = err instanceof Error ? err.message : '未知错误';
            console.error('Background task failed:', err);
        }

        this.notify();
        this.processing = false;

        // Auto-dismiss completed tasks after 30s
        if (task.status === 'completed') {
            setTimeout(() => this.dismissTask(taskId), 30000);
        }

        // Process next in queue
        this.processNext();
    }
}

// Global singleton
export const taskManager = new TaskManager();
