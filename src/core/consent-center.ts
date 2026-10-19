/**
 * BL-5 自动化同意中心与权限注册表（纯逻辑，node 可单测）。
 * 
 * 核心契约与安全原则：
 * 1. 集中管理 7 大能力权限：AI生成、媒体处理、通知提醒、生态联动、内容分享、云端同步、联系人联动；
 * 2. 状态机：unprompted（未决）、granted（已授权）、revoked（已撤销）；
 * 3. 逐能力开关与一键撤销（一经撤销严格阻断，绝不静默提权）；
 * 4. 显式公开每个能力的数据范围（Data Scope）与最近使用记录。
 */

export const CONSENT_CAPABILITIES = [
    "ai-generation",
    "media-processing",
    "system-notification",
    "ecosystem-bridge",
    "content-sharing",
    "cloud-sync",
    "contact-integration",
] as const;

export type ConsentCapability = (typeof CONSENT_CAPABILITIES)[number];

export type ConsentStatus = "unprompted" | "granted" | "revoked";

/** 单项能力权限定义与状态 */
export interface CapabilityConsentRecord {
    capability: ConsentCapability;
    status: ConsentStatus;
    /** 名称多语言键 */
    nameKey: string;
    /** 描述多语言键 */
    descKey: string;
    /** 数据范围与隐私边界多语言键 */
    dataScopeKey: string;
    /** 首次授权时间戳（未授权为 null） */
    grantedAt: number | null;
    /** 撤销授权时间戳（未撤销为 null） */
    revokedAt: number | null;
    /** 最近一次被调用/使用的时间戳 */
    lastUsedAt: number | null;
    /** 累计调用次数 */
    usageCount: number;
}

/** 同意中心数据存储形态 */
export interface ConsentCenterState {
    version: 1;
    updatedAt: number;
    records: Record<ConsentCapability, CapabilityConsentRecord>;
}

export function createDefaultConsentState(now: number = Date.now()): ConsentCenterState {
    const makeRecord = (
        cap: ConsentCapability,
        nameKey: string,
        descKey: string,
        dataScopeKey: string,
        initialStatus: ConsentStatus = "unprompted",
    ): CapabilityConsentRecord => ({
        capability: cap,
        status: initialStatus,
        nameKey,
        descKey,
        dataScopeKey,
        grantedAt: initialStatus === "granted" ? now : null,
        revokedAt: null,
        lastUsedAt: null,
        usageCount: 0,
    });

    return {
        version: 1,
        updatedAt: now,
        records: {
            "ai-generation": makeRecord(
                "ai-generation",
                "consentCenter.cap.aiGeneration.name",
                "consentCenter.cap.aiGeneration.desc",
                "consentCenter.cap.aiGeneration.scope",
                "unprompted",
            ),
            "media-processing": makeRecord(
                "media-processing",
                "consentCenter.cap.mediaProcessing.name",
                "consentCenter.cap.mediaProcessing.desc",
                "consentCenter.cap.mediaProcessing.scope",
                "granted", // 本地媒体处理（音频/TTS/遮挡）默认作为本地功能开放
            ),
            "system-notification": makeRecord(
                "system-notification",
                "consentCenter.cap.systemNotification.name",
                "consentCenter.cap.systemNotification.desc",
                "consentCenter.cap.systemNotification.scope",
                "unprompted",
            ),
            "ecosystem-bridge": makeRecord(
                "ecosystem-bridge",
                "consentCenter.cap.ecosystemBridge.name",
                "consentCenter.cap.ecosystemBridge.desc",
                "consentCenter.cap.ecosystemBridge.scope",
                "granted", // 跨插件窗口桥默认提供只读查询
            ),
            "content-sharing": makeRecord(
                "content-sharing",
                "consentCenter.cap.contentSharing.name",
                "consentCenter.cap.contentSharing.desc",
                "consentCenter.cap.contentSharing.scope",
                "granted", // 分享包导入导出本地数据
            ),
            "cloud-sync": makeRecord(
                "cloud-sync",
                "consentCenter.cap.cloudSync.name",
                "consentCenter.cap.cloudSync.desc",
                "consentCenter.cap.cloudSync.scope",
                "unprompted",
            ),
            "contact-integration": makeRecord(
                "contact-integration",
                "consentCenter.cap.contactIntegration.name",
                "consentCenter.cap.contactIntegration.desc",
                "consentCenter.cap.contactIntegration.scope",
                "unprompted",
            ),
        },
    };
}

/** 规范化外部传入的持久化数据，坏键补全，数据不可变隔离 */
export function normalizeConsentState(raw: unknown, now: number = Date.now()): ConsentCenterState {
    const defaultState = createDefaultConsentState(now);
    if (!raw || typeof raw !== "object") return defaultState;

    const rawRecords = (raw as any).records;
    if (!rawRecords || typeof rawRecords !== "object") return defaultState;

    const nextRecords = { ...defaultState.records };

    for (const cap of CONSENT_CAPABILITIES) {
        const item = rawRecords[cap];
        if (item && typeof item === "object") {
            const status: ConsentStatus =
                item.status === "granted" || item.status === "revoked" || item.status === "unprompted"
                    ? item.status
                    : nextRecords[cap].status;

            nextRecords[cap] = {
                ...nextRecords[cap],
                status,
                grantedAt: typeof item.grantedAt === "number" ? item.grantedAt : nextRecords[cap].grantedAt,
                revokedAt: typeof item.revokedAt === "number" ? item.revokedAt : nextRecords[cap].revokedAt,
                lastUsedAt: typeof item.lastUsedAt === "number" ? item.lastUsedAt : null,
                usageCount: typeof item.usageCount === "number" && item.usageCount >= 0 ? item.usageCount : 0,
            };
        }
    }

    return {
        version: 1,
        updatedAt: typeof (raw as any).updatedAt === "number" ? (raw as any).updatedAt : now,
        records: nextRecords,
    };
}

/** 检查某项能力是否被明确授权 */
export function isConsentGranted(state: ConsentCenterState, cap: ConsentCapability): boolean {
    const record = state.records[cap];
    return record?.status === "granted";
}

/** 授权某项能力（纯函数，返回新 state） */
export function grantConsent(
    state: ConsentCenterState,
    cap: ConsentCapability,
    now: number = Date.now(),
): ConsentCenterState {
    const existing = state.records[cap];
    if (!existing) return state;

    return {
        ...state,
        updatedAt: now,
        records: {
            ...state.records,
            [cap]: {
                ...existing,
                status: "granted",
                grantedAt: existing.grantedAt ?? now,
                revokedAt: null,
            },
        },
    };
}

/** 撤销某项能力（纯函数，返回新 state） */
export function revokeConsent(
    state: ConsentCenterState,
    cap: ConsentCapability,
    now: number = Date.now(),
): ConsentCenterState {
    const existing = state.records[cap];
    if (!existing) return state;

    return {
        ...state,
        updatedAt: now,
        records: {
            ...state.records,
            [cap]: {
                ...existing,
                status: "revoked",
                revokedAt: now,
            },
        },
    };
}

/** 记录能力的合法调用使用（必须已处于 granted 状态才记录，否则返回原状态） */
export function recordCapabilityUsage(
    state: ConsentCenterState,
    cap: ConsentCapability,
    now: number = Date.now(),
): ConsentCenterState {
    const existing = state.records[cap];
    if (!existing || existing.status !== "granted") {
        return state;
    }

    return {
        ...state,
        records: {
            ...state.records,
            [cap]: {
                ...existing,
                lastUsedAt: now,
                usageCount: existing.usageCount + 1,
            },
        },
    };
}

/** 获取全部能力的概览列表（按稳定顺序） */
export function listConsentRecords(state: ConsentCenterState): CapabilityConsentRecord[] {
    return CONSENT_CAPABILITIES.map(cap => state.records[cap]);
}
