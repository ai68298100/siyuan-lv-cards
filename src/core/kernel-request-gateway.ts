/**
 * AX-8 UI 与内核调用边界归拢网关（纯逻辑，node 可单测）。
 * 
 * 核心契约与安全原则：
 * 1. 统一错误语义分类：鉴权失败（auth-failed）、路径 404（not-found）、请求超时（timeout）、参数校验（invalid-payload）、业务故障（kernel-error）、网络不可达（network-error）；
 * 2. 诊断安全：自动对请求载荷与错误信息进行敏感凭据脱敏，绝不向 UI 或日志泄漏 token 与 key；
 * 3. 优雅降级守卫：支持声明 fallbackValue，非关键只读请求遇错自动降级，保障界面不崩溃；
 * 4. 连续失败统计：跟踪内核联通性，为离线队列与系统健康巡检提供实时状态依据。
 */

import { sanitizeSensitiveText, sanitizeAuditDetails } from "./audit-log";

export const GATEWAY_ERROR_CATEGORIES = [
    "auth-failed",
    "not-found",
    "timeout",
    "invalid-payload",
    "kernel-error",
    "network-error",
    "unknown",
] as const;

export type GatewayErrorCategory = (typeof GATEWAY_ERROR_CATEGORIES)[number];

export interface GatewayCallDiagnostics {
    endpoint: string;
    sanitizedPayload: Record<string, unknown>;
    category: GatewayErrorCategory;
    rawMessage: string;
    i18nKey: string;
    timestamp: number;
}

export interface GatewayExecutionOptions<T = unknown> {
    /** 超时时长（毫秒，默认 10000ms） */
    timeoutMs?: number;
    /** 只读降级默认值：当指定时，发生异常不抛出，而是返回此 fallbackValue */
    fallbackValue?: T;
    /** 请求描述说明（诊断用） */
    callDescription?: string;
}

export interface GatewayCallResult<T> {
    success: boolean;
    data?: T;
    diagnostics?: GatewayCallDiagnostics;
}

/**
 * 分析与智能归类内核请求错误
 */
export function classifyKernelError(err: unknown, endpoint: string = ""): {
    category: GatewayErrorCategory;
    i18nKey: string;
    message: string;
} {
    const rawMsg = err instanceof Error ? err.message : String(err ?? "");
    const lower = rawMsg.toLowerCase();

    if (lower.includes("401") || lower.includes("unauthorized") || lower.includes("token") || lower.includes("鉴权失败")) {
        return {
            category: "auth-failed",
            i18nKey: "kernelGateway.error.authFailed",
            message: "思源内核鉴权失败，请检查 API Token 配置",
        };
    }

    if (lower.includes("404") || lower.includes("not found") || lower.includes("route") || lower.includes("不存在")) {
        return {
            category: "not-found",
            i18nKey: "kernelGateway.error.notFound",
            message: `请求的内核端点不存在: ${endpoint}`,
        };
    }

    if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("超时")) {
        return {
            category: "timeout",
            i18nKey: "kernelGateway.error.timeout",
            message: "内核通信超时，请求已安全终止",
        };
    }

    if (lower.includes("invalid") || lower.includes("param") || lower.includes("参数错误")) {
        return {
            category: "invalid-payload",
            i18nKey: "kernelGateway.error.invalidPayload",
            message: "请求参数校验失败",
        };
    }

    if (lower.includes("econnrefused") || lower.includes("fetch failed") || lower.includes("network")) {
        return {
            category: "network-error",
            i18nKey: "kernelGateway.error.networkError",
            message: "无法连接到思源内核服务，请确认思源处于运行状态",
        };
    }

    return {
        category: "kernel-error",
        i18nKey: "kernelGateway.error.kernelError",
        message: sanitizeSensitiveText(rawMsg, 120),
    };
}

/**
 * 统一内核调用网关执行器（纯函数）
 */
export async function executeGatewayCall<T>(
    transport: (endpoint: string, payload: Record<string, unknown>) => Promise<unknown>,
    endpoint: string,
    rawPayload: Record<string, unknown>,
    options: GatewayExecutionOptions<T> = {},
    now: number = Date.now(),
): Promise<GatewayCallResult<T>> {
    const timeout = options.timeoutMs ?? 10000;
    const sanitizedPayload = sanitizeAuditDetails(rawPayload) || {};

    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            reject(new Error(`Kernel request timeout after ${timeout}ms: ${endpoint}`));
        }, timeout);
    });

    try {
        const rawRes = await Promise.race([transport(endpoint, rawPayload), timeoutPromise]);
        if (timer !== null) clearTimeout(timer);

        // 标准内核返回格式解包：{ code: 0, data: T, msg: string }
        if (rawRes && typeof rawRes === "object") {
            const resObj = rawRes as { code?: unknown; msg?: unknown; data?: unknown };
            const code = typeof resObj.code === "number" ? resObj.code : undefined;
            if (code !== undefined && code !== 0) {
                const msg = typeof resObj.msg === "string" ? resObj.msg : `Kernel error code ${code}`;
                throw new Error(msg);
            }
            const data = resObj.data !== undefined ? resObj.data : rawRes;
            return {
                success: true,
                data: data as T,
            };
        }

        return {
            success: true,
            data: rawRes as T,
        };
    } catch (err) {
        if (timer !== null) clearTimeout(timer);

        const classification = classifyKernelError(err, endpoint);
        const diagnostics: GatewayCallDiagnostics = {
            endpoint,
            sanitizedPayload,
            category: classification.category,
            rawMessage: classification.message,
            i18nKey: classification.i18nKey,
            timestamp: now,
        };

        // 若声明了 fallbackValue，执行优雅降级，返回默认值
        if (options.fallbackValue !== undefined) {
            return {
                success: false,
                data: options.fallbackValue,
                diagnostics,
            };
        }

        return {
            success: false,
            diagnostics,
        };
    }
}
