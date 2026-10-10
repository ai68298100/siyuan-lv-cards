/**
 * BU-28 分层降级阶梯（纯逻辑，node 可单测；与 api/ai-errors 的 AQ-15 口径对齐并细化）。
 * 分类失败 → 阶梯决策：网络/5xx/限流可重试或转已授权备用端点；
 * 隐私拒绝、401/403、配额耗尽、解析失败、风险命中、取消一律中止——绝不静默回退。
 * 验收硬性要求：决策携带实际路径（是否转备用）、原因和是否可能产生费用（mayCost），
 * 界面必须呈现，不做无说明的自动 fallback。
 */

export const AI_FAILURE_CLASSES = [
    "network",     // 断网/DNS/超时——可重试/转备用
    "server",      // 5xx——可重试/转备用
    "rate-limit",  // 429 限流——可重试（建议等待）/转备用
    "auth",        // 401/403 密钥或权限——中止（换端点同样失败）
    "quota",       // 402 / insufficient_quota 配额耗尽——中止
    "privacy",     // 内容策略拒绝——中止（自动换端点重发=绕过审查，禁止）
    "parse",       // 响应不可解析——中止（换端点同样非法）
    "risk",        // 注入围栏/紧急停用等风险命中——中止
    "canceled",    // 用户取消——中止（调用方静默处理）
    "unknown",     // 其余（4xx 等）——中止并给原因
] as const;
export type AiFailureClass = (typeof AI_FAILURE_CLASSES)[number];

export const AI_LADDER_ACTIONS = ["retry-primary", "try-fallback", "abort"] as const;
export type AiLadderAction = (typeof AI_LADDER_ACTIONS)[number];

export interface FailureVerdict {
    cls: AiFailureClass;
    /** 错误摘要（已截断，供界面/日志；不含材料明文） */
    detail: string;
    /** 限流等服务端建议的等待毫秒（可得时） */
    retryAfterMs?: number;
}

export interface LadderPolicy {
    /** 主端点最大尝试次数（1=主端点不重试，失败即转备用/中止；默认 1——维持既有 ai.ts 行为） */
    maxPrimaryAttempts: number;
    /** 是否有已授权备用端点（仅 custom 模式可配） */
    hasFallback: boolean;
    /** 限流重试建议等待毫秒（服务端未给 Retry-After 时的保守默认） */
    retryBaseMs?: number;
}

export interface LadderStep {
    action: AiLadderAction;
    cls: AiFailureClass;
    /** 失败类别说明 i18n 键（aiDegrad.class.<cls>） */
    reasonKey: string;
    /** 动作说明 i18n 键（aiDegrad.action.<action>）——界面呈现实际路径的验收点 */
    actionKey: string;
    /** 本步是否可能产生费用（重试/转备用=可能；中止=否） */
    mayCost: boolean;
    /** 是否发生自动转备用（true 时界面必须说明，不做静默 fallback） */
    usedFallback: boolean;
    /** retry-primary 建议等待毫秒 */
    retryAfterMs?: number;
    /** 已用尝试次数（含本次失败） */
    attemptsUsed: number;
}

const RETRYABLE: ReadonlySet<AiFailureClass> = new Set(["network", "server", "rate-limit"]);
/** 直接中止、绝不自动换端点重发的类别（AQ-15 细化） */
const TERMINAL: ReadonlySet<AiFailureClass> = new Set(["auth", "quota", "privacy", "parse", "risk", "canceled", "unknown"]);

const excerpt = (e: unknown): string => (e instanceof Error ? e.message : String(e ?? "")).slice(0, 200);

/**
 * 错误分类（顺序敏感）：取消 → 隐私拒绝 → 配额 → HTTP 状态码 → 网络层 → 解析 → 未知。
 * 配额先于状态码：OpenAI 用 429 表 insufficient_quota，与瞬时限流处理路径不同（重试有害）。
 */
export function classifyAiFailure(e: unknown): FailureVerdict {
    const msg = excerpt(e);
    const retryAfterMs = typeof e === "object" && e !== null && "retryAfterMs" in e
        && typeof (e as { retryAfterMs?: unknown }).retryAfterMs === "number"
        ? Math.max(0, (e as { retryAfterMs: number }).retryAfterMs)
        : undefined;
    if (isCancelLike(e, msg)) {
        return { cls: "canceled", detail: msg };
    }
    if (/content[_ ]?polic|content filter|内容政策|内容审查/i.test(msg)) {
        return { cls: "privacy", detail: msg };
    }
    if (/insufficient[_ ]?quota|配额|quota exceeded|billing/i.test(msg)) {
        return { cls: "quota", detail: msg };
    }
    const m = msg.match(/HTTP (\d{3})/);
    if (m) {
        const code = Number(m[1]);
        if (code === 401 || code === 403) {
            return { cls: "auth", detail: msg };
        }
        if (code === 402) {
            return { cls: "quota", detail: msg };
        }
        if (code === 429) {
            return { cls: "rate-limit", detail: msg, retryAfterMs };
        }
        if (code >= 500) {
            return { cls: "server", detail: msg };
        }
        return { cls: "unknown", detail: msg };
    }
    const ra = msg.match(/retry[- ]after[: ]*(\d+)/i);
    if (/too many requests|rate[- ]?limit/i.test(msg)) {
        return { cls: "rate-limit", detail: msg, retryAfterMs: retryAfterMs ?? (ra ? Number(ra[1]) * 1000 : undefined) };
    }
    if (/failed to fetch|networkerror|timeout|fetch failed|econn|enotfound/i.test(msg)) {
        return { cls: "network", detail: msg, retryAfterMs: retryAfterMs ?? (ra ? Number(ra[1]) * 1000 : undefined) };
    }
    if (/parse|not an array|unexpected (token|end of json)/i.test(msg)) {
        return { cls: "parse", detail: msg };
    }
    return { cls: "unknown", detail: msg };
}

function isCancelLike(e: unknown, msg: string): boolean {
    return e instanceof Error && (e.name === "AICanceledError" || e.name === "AbortError")
        || /ai canceled/i.test(msg);
}

/**
 * 阶梯决策：可重试类先按预算重试主端点，预算用尽转备用（若有），否则中止；
 * 终止类无论尝试次数与备用可用性一律中止（无静默回退）。
 */
export function nextLadderStep(verdict: FailureVerdict, policy: LadderPolicy, attemptsUsed: number): LadderStep {
    const base = { cls: verdict.cls, reasonKey: `aiDegrad.class.${verdict.cls}`, attemptsUsed };
    if (TERMINAL.has(verdict.cls)) {
        return { ...base, action: "abort", actionKey: "aiDegrad.action.abort", mayCost: false, usedFallback: false };
    }
    // 可重试类（network/server/rate-limit）
    if (attemptsUsed < Math.max(1, policy.maxPrimaryAttempts)) {
        return {
            ...base,
            action: "retry-primary",
            actionKey: "aiDegrad.action.retry-primary",
            mayCost: true,
            usedFallback: false,
            retryAfterMs: verdict.cls === "rate-limit"
                ? (verdict.retryAfterMs ?? policy.retryBaseMs ?? 2000)
                : undefined,
        };
    }
    if (policy.hasFallback) {
        return { ...base, action: "try-fallback", actionKey: "aiDegrad.action.try-fallback", mayCost: true, usedFallback: true };
    }
    return { ...base, action: "abort", actionKey: "aiDegrad.action.abort", mayCost: false, usedFallback: false };
}

/** AQ-15 兼容口径：可重试=阶梯里的可重试类（ai-errors.isRecoverableAIError 的判定事实源） */
export function isRetryableClass(cls: AiFailureClass): boolean {
    return RETRYABLE.has(cls);
}
