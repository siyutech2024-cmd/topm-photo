/**
 * 正式环境 API 服务
 *
 * 核心流程：
 * 1. 将生成的 SHEIN JSON 提交到正式 API (demo7.php) 进行预校验
 * 2. 解析 pre_valid_result 中的验证错误
 * 3. 提取缺失的必填属性、销售属性问题、图片/SKU 问题
 * 4. 供 UI 层展示并让用户人工修复
 */

// ===== 类型定义 =====

/** 单条验证消息 */
export interface ValidationMessage {
    module: string;       // 模块：category_attribute, specification_info
    form: string;         // 表单：product_attribute, main_specification, ...
    form_name: string;    // 中文名：商品属性, 主规格, ...
    messages: string[];   // 错误消息列表
}

/** 从验证消息中提取的结构化错误 */
export interface ValidationError {
    type: 'missing_attribute' | 'sale_attribute' | 'image' | 'sku' | 'other';
    module: string;
    form_name: string;
    message: string;
    /** 提取的属性名（如有） */
    attributeName?: string;
    /** 是否可通过人工干预修复 */
    fixable: boolean;
}

/** 需要人工填写的属性项 */
export interface ManualAttributeItem {
    /** 从错误消息中提取的属性名 */
    name: string;
    /** 用户输入的值 */
    value: string;
    /** 原始错误消息 */
    errorMessage: string;
}

/** 正式 API 完整响应 */
export interface ProductionApiResponse {
    success: boolean;
    errors: ValidationError[];
    manualAttributes: ManualAttributeItem[];
    /** 原始响应 */
    raw: Record<string, unknown>;
}

// ===== 配置 =====

const PRODUCTION_API_URL = import.meta.env.DEV
    ? '/api/production'
    : 'https://topm.tech/demo7.php';

const REQUEST_TIMEOUT = 15000; // 15秒超时

// ===== 核心方法 =====

/**
 * 提交 SHEIN JSON 到正式 API 进行预校验
 */
export async function submitForValidation(
    sheinJson: Record<string, unknown>
): Promise<ProductionApiResponse> {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

        const res = await fetch(PRODUCTION_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json;charset=UTF-8' },
            body: JSON.stringify(sheinJson),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
            return {
                success: false,
                errors: [{ type: 'other', module: 'network', form_name: '网络', message: `HTTP ${res.status}: ${res.statusText}`, fixable: false }],
                manualAttributes: [],
                raw: {},
            };
        }

        const data = await res.json();
        return parseValidationResponse(data);
    } catch (err) {
        const msg = err instanceof Error
            ? (err.name === 'AbortError' ? `请求超时 (${REQUEST_TIMEOUT / 1000}秒)` : err.message)
            : '未知错误';
        return {
            success: false,
            errors: [{ type: 'other', module: 'network', form_name: '网络', message: msg, fixable: false }],
            manualAttributes: [],
            raw: {},
        };
    }
}

/**
 * 解析 SHEIN API 的验证响应
 *
 * 响应格式形如：
 * {
 *   "code": "0", "msg": "OK",
 *   "info": {
 *     "success": true/false,
 *     "pre_valid_result": [
 *       { "module": "...", "form": "...", "form_name": "...", "messages": ["..."] }
 *     ]
 *   }
 * }
 */
function parseValidationResponse(data: Record<string, unknown>): ProductionApiResponse {
    const info = data.info as Record<string, unknown> | undefined;
    const isSuccess = info?.success === true;
    const preValid = (info?.pre_valid_result || []) as ValidationMessage[];

    const errors: ValidationError[] = [];
    const manualAttributes: ManualAttributeItem[] = [];
    const seenAttrNames = new Set<string>();

    for (const item of preValid) {
        for (const msg of (item.messages || [])) {
            const error = classifyError(item, msg);
            errors.push(error);

            // 提取需要人工填写的属性
            if (error.type === 'missing_attribute' && error.attributeName && !seenAttrNames.has(error.attributeName)) {
                seenAttrNames.add(error.attributeName);
                manualAttributes.push({
                    name: error.attributeName,
                    value: '',
                    errorMessage: msg,
                });
            }
        }
    }

    return {
        success: isSuccess && errors.length === 0,
        errors,
        manualAttributes,
        raw: data,
    };
}

/**
 * 分类单条错误消息
 */
function classifyError(item: ValidationMessage, msg: string): ValidationError {
    // 缺失必填属性：「XXX: 类型下模板属性为必填项」
    const attrMatch = msg.match(/^(.+?)[:：]\s*类型下模板属性为必填项/);
    if (attrMatch) {
        return {
            type: 'missing_attribute',
            module: item.module,
            form_name: item.form_name,
            message: msg,
            attributeName: attrMatch[1].trim(),
            fixable: true,
        };
    }

    // 销售属性问题
    if (msg.includes('销售属性') || msg.includes('主规格') || msg.includes('不可以作为')) {
        return {
            type: 'sale_attribute',
            module: item.module,
            form_name: item.form_name,
            message: msg,
            fixable: true,
        };
    }

    // 图片问题
    if (msg.includes('图') || msg.includes('方形图') || msg.includes('picture')) {
        return {
            type: 'image',
            module: item.module,
            form_name: item.form_name,
            message: msg,
            fixable: false,
        };
    }

    // SKU 问题
    if (msg.includes('SKU') || msg.includes('卖家SKU')) {
        return {
            type: 'sku',
            module: item.module,
            form_name: item.form_name,
            message: msg,
            fixable: true,
        };
    }

    return {
        type: 'other',
        module: item.module,
        form_name: item.form_name,
        message: msg,
        fixable: false,
    };
}

/**
 * 将人工填写的属性注入到 SHEIN JSON 的 product_attribute_list 中
 */
export function injectManualAttributes(
    sheinJson: Record<string, unknown>,
    manualAttrs: ManualAttributeItem[]
): Record<string, unknown> {
    const result = JSON.parse(JSON.stringify(sheinJson)); // deep clone

    // 获取现有属性列表
    const existingAttrs = (result.product_attribute_list || []) as Array<Record<string, string>>;

    for (const attr of manualAttrs) {
        if (!attr.value.trim()) continue;

        // 查找是否已存在该属性（按名称匹配 — 因为缺失属性在本地没有 ID）
        // 由于我们不知道正式 API 的属性 ID，只能用 extra_value 方式提交
        // 实际上这些属性需要用正确的 attribute_id，但本地缓存没有
        // 所以我们把它们添加到 JSON 中，让用户可以在 JSON 预览中手动调整 ID

        existingAttrs.push({
            attribute_id: '0', // 需要人工确认正确的 ID
            attribute_extra_value: attr.value,
            _manual_name: attr.name, // 标记为手动添加（最终提交前需要用正确 ID 替换）
        });
    }

    result.product_attribute_list = existingAttrs;
    return result;
}
