/**
 * BU-4 Agent 工具调用循环闸门与安全状态机（纯逻辑，Node 可单测）。
 * 
 * 核心设计原则：
 * 1. 失控循环截断：硬性限制调用深度、调用总次数、执行时长与连续重复入参死锁检测；
 * 2. 写入实体配额：控制单次 Agent 任务写入实体的上限，杜绝批量失控注入；
 * 3. 越权参数拦截：阻断携带注入字段（如 rawSql、system_admin 等）的越权尝试；
 * 4. 真实结果保真：工具调用失败绝不伪报为完成，提供精确的熔断分类与审计追踪。
 */

import { sanitizeSensitiveText } from "./audit-log";

export type AgentGuardViolationCategory =
    | "max-calls-exceeded"
    | "recursion-depth-exceeded"
    | "execution-timeout"
    | "write-quota-exceeded"
    | "repetitive-loop-detected"
    | "unauthorized-parameter";

export interface AgentGuardConfig {
    /** 单次任务工具调用总次数上限，默认 8 */
    maxTotalCalls: number;
    /** 嵌套/递归调用深度上限，默认 3 */
    maxRecursionDepth: number;
    /** 单次任务执行累计最大时间（毫秒），默认 25000 (25s) */
    maxExecutionMs: number;
    /** 单次任务允许写入的最大实体总数，默认 20 */
    maxEntitiesWritten: number;
    /** 判定死循环的连续相同参数调用次数阈值，默认 3 */
    repetitiveCallThreshold: number;
}

export const DEFAULT_AGENT_GUARD_CONFIG: Readonly<AgentGuardConfig> = {
    maxTotalCalls: 8,
    maxRecursionDepth: 3,
    maxExecutionMs: 25000,
    maxEntitiesWritten: 20,
    repetitiveCallThreshold: 3,
};

export interface ToolCallLogItem {
    toolName: string;
    paramsHash: string;
    timestamp: number;
    success: boolean;
    entitiesWritten: number;
}

export interface AgentGuardCheckResult {
    allowed: boolean;
    blockCategory?: AgentGuardViolationCategory;
    reasonKey?: string;
    errorMessage?: string;
}

export interface AgentGuardExecutionSummary {
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
    totalEntitiesWritten: number;
    elapsedMs: number;
    isTerminated: boolean;
    terminationCategory?: AgentGuardViolationCategory;
}

const FORBIDDEN_PARAM_KEYS = new Set([
    "__proto__",
    "constructor",
    "prototype",
    "rawSql",
    "system_admin",
    "kernel_root",
    "override_fsrs",
]);

/**
 * 快速生成参数签名摘要用于死循环检测（脱敏纯指纹）
 */
function hashParams(params: Record<string, unknown>): string {
    try {
        const sortedKeys = Object.keys(params).sort();
        const simplified = sortedKeys.map(k => `${k}:${String(params[k])}`).join("|");
        return simplified;
    } catch {
        return "invalid-params";
    }
}

/**
 * 创建单次 Agent 任务执行闸门状态机
 */
export function createAgentExecutionGuard(customConfig?: Partial<AgentGuardConfig>) {
    const config: AgentGuardConfig = {
        ...DEFAULT_AGENT_GUARD_CONFIG,
        ...customConfig,
    };

    const startTime = Date.now();
    let totalCalls = 0;
    let successfulCalls = 0;
    let failedCalls = 0;
    let totalEntitiesWritten = 0;
    let isTerminated = false;
    let terminationCategory: AgentGuardViolationCategory | undefined;

    const callLogs: ToolCallLogItem[] = [];

    return {
        /**
         * 工具调用前置审查
         */
        checkBeforeToolCall(
            toolName: string,
            params: Record<string, unknown> = {},
            currentDepth: number = 1,
            now: number = Date.now(),
        ): AgentGuardCheckResult {
            if (isTerminated) {
                return {
                    allowed: false,
                    blockCategory: terminationCategory,
                    reasonKey: "agentGuard.error.alreadyTerminated",
                    errorMessage: "Task guard has already been tripped.",
                };
            }

            // 1. 检查越权参数
            for (const key of Object.keys(params)) {
                if (FORBIDDEN_PARAM_KEYS.has(key)) {
                    isTerminated = true;
                    terminationCategory = "unauthorized-parameter";
                    return {
                        allowed: false,
                        blockCategory: "unauthorized-parameter",
                        reasonKey: "agentGuard.error.unauthorizedParameter",
                        errorMessage: `Parameter '${sanitizeSensitiveText(key, 20)}' is strictly prohibited.`,
                    };
                }
            }

            // 2. 检查调用次数上限
            if (totalCalls >= config.maxTotalCalls) {
                isTerminated = true;
                terminationCategory = "max-calls-exceeded";
                return {
                    allowed: false,
                    blockCategory: "max-calls-exceeded",
                    reasonKey: "agentGuard.error.maxCallsExceeded",
                    errorMessage: `Tool call limit of ${config.maxTotalCalls} reached.`,
                };
            }

            // 3. 检查递归调用深度
            if (currentDepth > config.maxRecursionDepth) {
                isTerminated = true;
                terminationCategory = "recursion-depth-exceeded";
                return {
                    allowed: false,
                    blockCategory: "recursion-depth-exceeded",
                    reasonKey: "agentGuard.error.depthExceeded",
                    errorMessage: `Recursion depth ${currentDepth} exceeds maximum allowed (${config.maxRecursionDepth}).`,
                };
            }

            // 4. 检查总耗时是否超时
            if (now - startTime > config.maxExecutionMs) {
                isTerminated = true;
                terminationCategory = "execution-timeout";
                return {
                    allowed: false,
                    blockCategory: "execution-timeout",
                    reasonKey: "agentGuard.error.executionTimeout",
                    errorMessage: `Execution time exceeded limit of ${config.maxExecutionMs}ms.`,
                };
            }

            // 5. 检查重复调用死循环（相同工具且相同入参连续出现）
            const currentHash = hashParams(params);
            const recentSameCalls = callLogs
                .slice(-config.repetitiveCallThreshold)
                .filter(item => item.toolName === toolName && item.paramsHash === currentHash);

            if (recentSameCalls.length >= config.repetitiveCallThreshold) {
                isTerminated = true;
                terminationCategory = "repetitive-loop-detected";
                return {
                    allowed: false,
                    blockCategory: "repetitive-loop-detected",
                    reasonKey: "agentGuard.error.loopDetected",
                    errorMessage: `Repetitive identical calls to '${toolName}' detected. Execution halted.`,
                };
            }

            return { allowed: true };
        },

        /**
         * 记录工具执行结果与实体写入量
         */
        recordToolCallOutcome(
            toolName: string,
            params: Record<string, unknown> = {},
            success: boolean,
            entitiesWritten: number = 0,
            now: number = Date.now(),
        ): { quotaExceeded: boolean } {
            totalCalls++;
            if (success) {
                successfulCalls++;
            } else {
                failedCalls++;
            }

            totalEntitiesWritten += Math.max(0, entitiesWritten);

            callLogs.push({
                toolName,
                paramsHash: hashParams(params),
                timestamp: now,
                success,
                entitiesWritten,
            });

            // 检查写入实体配额
            if (totalEntitiesWritten > config.maxEntitiesWritten) {
                isTerminated = true;
                terminationCategory = "write-quota-exceeded";
                return { quotaExceeded: true };
            }

            return { quotaExceeded: false };
        },

        /**
         * 获取当前执行全貌摘要
         */
        getExecutionSummary(now: number = Date.now()): AgentGuardExecutionSummary {
            return {
                totalCalls,
                successfulCalls,
                failedCalls,
                totalEntitiesWritten,
                elapsedMs: now - startTime,
                isTerminated,
                terminationCategory,
            };
        },
    };
}
