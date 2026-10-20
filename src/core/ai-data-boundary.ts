/**
 * BU-9 AI 数据边界与隐私保留策略登记契约引擎（纯逻辑，Node 可单测）。
 * 
 * 核心契约与安全原则：
 * 1. 严格登记每种 AI 请求类型（提炼 extract、挖空 cloze、问答 qa、诊断 diagnosis、向量检索 embedding）
 *    发送的数据类型、目的地、保留期限与退出选项；
 * 2. 逐项开关控制：用户可在隐私设置中逐项关闭，关闭后坚决阻断对应 AI 请求，平滑回退到手工或本地规则（对齐 BU-40）；
 * 3. 敏感数据脱敏与最小化：杜绝静默收集与非必要数据外发；
 * 4. 零内核篡改：无论何种策略，均严格禁止改变 FSRS 核心调度。
 */

import type { ConsentCenterState } from "./consent-center";
import { isConsentGranted } from "./consent-center";
import { sanitizeSensitiveText } from "./audit-log";

export const AI_REQUEST_KINDS = [
    "extract",
    "cloze",
    "qa",
    "diagnosis",
    "embedding",
] as const;
export type AiRequestKind = (typeof AI_REQUEST_KINDS)[number];

export const DATA_PAYLOAD_TYPES = [
    "question-content",
    "context-block",
    "review-history",
    "user-annotations",
] as const;
export type DataPayloadType = (typeof DATA_PAYLOAD_TYPES)[number];

export type DataDestination = "local-only" | "self-hosted-llm" | "third-party-cloud";

export interface AiPrivacyRetentionPolicy {
    kind: AiRequestKind;
    nameKey: string;
    descKey: string;
    allowedPayloadTypes: readonly DataPayloadType[];
    destination: DataDestination;
    /** 承诺保留天数，0 代表会话瞬态不留存 (ephemeral) */
    retentionDays: number;
    optOutSupported: boolean;
    /** 退出或关闭时的无 AI 替代流程键（对齐 BU-40） */
    fallbackAltKey: string;
    /** 契约断言：严禁直接改变内核调度 */
    effectsKernel: false;
}

export interface AiPrivacySettings {
    version: 1;
    /** 用户逐项关闭的请求类型 (true 表示已关闭/退出) */
    optedOutKinds: Record<AiRequestKind, boolean>;
    /** 强制本地脱敏脱除所有文档块高亮标注 */
    stripUserAnnotations: boolean;
}

/** 全局 AI 请求数据边界与保留策略清单（单一事实源） */
export const AI_PRIVACY_POLICIES: readonly AiPrivacyRetentionPolicy[] = [
    // 1. 材料提炼 (extract)
    {
        kind: "extract",
        nameKey: "aiPrivacy.extract.name",
        descKey: "aiPrivacy.extract.desc",
        allowedPayloadTypes: ["context-block", "user-annotations"],
        destination: "third-party-cloud",
        retentionDays: 0,
        optOutSupported: true,
        fallbackAltKey: "aiEquiv.alt.cards-generate.1",
        effectsKernel: false,
    },
    // 2. 挖空生成 (cloze)
    {
        kind: "cloze",
        nameKey: "aiPrivacy.cloze.name",
        descKey: "aiPrivacy.cloze.desc",
        allowedPayloadTypes: ["question-content", "context-block"],
        destination: "third-party-cloud",
        retentionDays: 0,
        optOutSupported: true,
        fallbackAltKey: "aiEquiv.alt.cards-generate.2",
        effectsKernel: false,
    },
    // 3. 问答建卡 (qa)
    {
        kind: "qa",
        nameKey: "aiPrivacy.qa.name",
        descKey: "aiPrivacy.qa.desc",
        allowedPayloadTypes: ["question-content", "context-block", "user-annotations"],
        destination: "third-party-cloud",
        retentionDays: 0,
        optOutSupported: true,
        fallbackAltKey: "aiEquiv.alt.cards-generate.1",
        effectsKernel: false,
    },
    // 4. 误解诊断 (diagnosis)
    {
        kind: "diagnosis",
        nameKey: "aiPrivacy.diagnosis.name",
        descKey: "aiPrivacy.diagnosis.desc",
        allowedPayloadTypes: ["question-content", "review-history"],
        destination: "third-party-cloud",
        retentionDays: 0,
        optOutSupported: true,
        fallbackAltKey: "aiEquiv.alt.repair-drill",
        effectsKernel: false,
    },
    // 5. 向量检索 (embedding)
    {
        kind: "embedding",
        nameKey: "aiPrivacy.embedding.name",
        descKey: "aiPrivacy.embedding.desc",
        allowedPayloadTypes: ["question-content"],
        destination: "local-only",
        retentionDays: 0,
        optOutSupported: true,
        fallbackAltKey: "aiEquiv.loss.no-ai",
        effectsKernel: false,
    },
];

/** 创建默认隐私设置状态 */
export function createDefaultAiPrivacySettings(): AiPrivacySettings {
    return {
        version: 1,
        optedOutKinds: {
            extract: false,
            cloze: false,
            qa: false,
            diagnosis: false,
            embedding: false,
        },
        stripUserAnnotations: false,
    };
}

/** 获取特定请求类型的隐私保留策略 */
export function getAiRetentionPolicy(kind: AiRequestKind): AiPrivacyRetentionPolicy {
    const policy = AI_PRIVACY_POLICIES.find(p => p.kind === kind);
    if (!policy) {
        throw new Error(`Unregistered AI request kind: ${kind}`);
    }
    return policy;
}

export interface AiRequestPermissionCheck {
    allowed: boolean;
    reasonKey: string;
    fallbackAltKey?: string;
    policy: AiPrivacyRetentionPolicy;
}

/**
 * 校验特定 AI 请求是否被允许执行（纯函数）
 * 综合考虑用户同意中心 (Consent Center) 与 AI 隐私退出设置 (Privacy Settings)。
 */
export function checkAiRequestPermission(
    kind: AiRequestKind,
    settings: AiPrivacySettings,
    consentState?: ConsentCenterState,
): AiRequestPermissionCheck {
    const policy = getAiRetentionPolicy(kind);

    // 1. 同意中心宏观权限检查
    if (consentState && !isConsentGranted(consentState, "ai-generation")) {
        return {
            allowed: false,
            reasonKey: "aiPrivacy.blocked.consentRevoked",
            fallbackAltKey: policy.fallbackAltKey,
            policy,
        };
    }

    // 2. 逐项退出 (Opt-out) 检查
    if (settings.optedOutKinds[kind]) {
        return {
            allowed: false,
            reasonKey: "aiPrivacy.blocked.userOptedOut",
            fallbackAltKey: policy.fallbackAltKey,
            policy,
        };
    }

    return {
        allowed: true,
        reasonKey: "aiPrivacy.allowed.ready",
        policy,
    };
}

/**
 * 依据隐私策略与设置过滤外发数据 Payload
 */
export function sanitizePayloadByPrivacy(
    kind: AiRequestKind,
    payload: {
        questionContent?: string;
        contextBlock?: string;
        reviewHistory?: Record<string, unknown>;
        userAnnotations?: string[];
    },
    settings: AiPrivacySettings,
): {
    questionContent?: string;
    contextBlock?: string;
    reviewHistory?: Record<string, unknown>;
    userAnnotations?: string[];
} {
    const policy = getAiRetentionPolicy(kind);
    const result: typeof payload = {};

    if (policy.allowedPayloadTypes.includes("question-content") && payload.questionContent) {
        result.questionContent = sanitizeSensitiveText(payload.questionContent, 2000);
    }

    if (policy.allowedPayloadTypes.includes("context-block") && payload.contextBlock) {
        result.contextBlock = sanitizeSensitiveText(payload.contextBlock, 4000);
    }

    if (policy.allowedPayloadTypes.includes("review-history") && payload.reviewHistory) {
        // 脱敏复习历史，仅允许基本统计，过滤敏感私密笔记标识
        const safeHistory: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(payload.reviewHistory)) {
            if (["reps", "lapses", "lastRating", "state"].includes(k)) {
                safeHistory[k] = v;
            }
        }
        result.reviewHistory = safeHistory;
    }

    if (
        policy.allowedPayloadTypes.includes("user-annotations") &&
        payload.userAnnotations &&
        !settings.stripUserAnnotations
    ) {
        result.userAnnotations = payload.userAnnotations.map(a => sanitizeSensitiveText(a, 500));
    }

    return result;
}
