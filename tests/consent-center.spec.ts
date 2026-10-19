import { describe, expect, it } from "vitest";
import {
    CONSENT_CAPABILITIES,
    createDefaultConsentState,
    normalizeConsentState,
    isConsentGranted,
    grantConsent,
    revokeConsent,
    recordCapabilityUsage,
    listConsentRecords,
} from "../src/core/consent-center";
import type { ConsentCenterState } from "../src/core/consent-center";

describe("consent-center (BL-5 自动化与功能权限同意中心)", () => {
    it("包含 7 大能力且默认权限矩阵符合本地优先原则", () => {
        expect(CONSENT_CAPABILITIES).toEqual([
            "ai-generation",
            "media-processing",
            "system-notification",
            "ecosystem-bridge",
            "content-sharing",
            "cloud-sync",
            "contact-integration",
        ]);

        const state = createDefaultConsentState(1000);
        expect(state.version).toBe(1);
        expect(state.updatedAt).toBe(1000);

        // 本地功能默认开放，外部/敏感功能默认需确认
        expect(state.records["media-processing"].status).toBe("granted");
        expect(state.records["ecosystem-bridge"].status).toBe("granted");
        expect(state.records["content-sharing"].status).toBe("granted");

        expect(state.records["ai-generation"].status).toBe("unprompted");
        expect(state.records["cloud-sync"].status).toBe("unprompted");
        expect(state.records["system-notification"].status).toBe("unprompted");
        expect(state.records["contact-integration"].status).toBe("unprompted");
    });

    it("每个能力均声明了名称、描述与数据范围 i18n 键", () => {
        const state = createDefaultConsentState();
        for (const cap of CONSENT_CAPABILITIES) {
            const rec = state.records[cap];
            expect(rec.nameKey).toMatch(/^consentCenter\.cap\./);
            expect(rec.descKey).toMatch(/^consentCenter\.cap\./);
            expect(rec.dataScopeKey).toMatch(/^consentCenter\.cap\./);
            expect(rec.usageCount).toBe(0);
            expect(rec.lastUsedAt).toBeNull();
        }
    });

    it("逐能力授权：grantConsent 转换状态为 granted，记录 grantedAt 并清空 revokedAt", () => {
        let state = createDefaultConsentState(1000);
        expect(isConsentGranted(state, "ai-generation")).toBe(false);

        state = grantConsent(state, "ai-generation", 2000);
        expect(isConsentGranted(state, "ai-generation")).toBe(true);
        expect(state.records["ai-generation"].status).toBe("granted");
        expect(state.records["ai-generation"].grantedAt).toBe(2000);
        expect(state.records["ai-generation"].revokedAt).toBeNull();
        expect(state.updatedAt).toBe(2000);
    });

    it("一键撤销：revokeConsent 转换状态为 revoked，记录 revokedAt，门禁严格阻断", () => {
        let state = createDefaultConsentState(1000);
        state = grantConsent(state, "ai-generation", 2000);
        expect(isConsentGranted(state, "ai-generation")).toBe(true);

        state = revokeConsent(state, "ai-generation", 3000);
        expect(isConsentGranted(state, "ai-generation")).toBe(false);
        expect(state.records["ai-generation"].status).toBe("revoked");
        expect(state.records["ai-generation"].revokedAt).toBe(3000);
    });

    it("调用使用追踪：recordCapabilityUsage 仅在已授权时递增，未授权时保持原状", () => {
        let state = createDefaultConsentState(1000);

        // 未授权尝试记录：静默拒绝递增
        const ungrantedState = recordCapabilityUsage(state, "ai-generation", 1500);
        expect(ungrantedState.records["ai-generation"].usageCount).toBe(0);
        expect(ungrantedState.records["ai-generation"].lastUsedAt).toBeNull();

        // 授权后调用：正常记录时间与计数
        state = grantConsent(state, "ai-generation", 2000);
        state = recordCapabilityUsage(state, "ai-generation", 2500);
        expect(state.records["ai-generation"].usageCount).toBe(1);
        expect(state.records["ai-generation"].lastUsedAt).toBe(2500);

        state = recordCapabilityUsage(state, "ai-generation", 3000);
        expect(state.records["ai-generation"].usageCount).toBe(2);
        expect(state.records["ai-generation"].lastUsedAt).toBe(3000);
    });

    it("normalizeConsentState 容错清洗：修复非法状态与畸变数据", () => {
        const corruptData = {
            updatedAt: "invalid",
            records: {
                "ai-generation": {
                    status: "invalid-status-xyz", // 非法状态回退为默认
                    usageCount: -5, // 负数修正为 0
                    grantedAt: "nan",
                },
                "media-processing": {
                    status: "revoked",
                    revokedAt: 5000,
                    usageCount: 12,
                },
            },
        };

        const normalized = normalizeConsentState(corruptData, 10000);
        expect(normalized.version).toBe(1);
        expect(normalized.updatedAt).toBe(10000);

        // 默认状态保留
        expect(normalized.records["ai-generation"].status).toBe("unprompted");
        expect(normalized.records["ai-generation"].usageCount).toBe(0);

        // 有效撤销状态保留
        expect(normalized.records["media-processing"].status).toBe("revoked");
        expect(normalized.records["media-processing"].revokedAt).toBe(5000);
        expect(normalized.records["media-processing"].usageCount).toBe(12);

        // 缺失项自动补齐默认
        expect(normalized.records["cloud-sync"]).toBeDefined();
        expect(normalized.records["cloud-sync"].status).toBe("unprompted");
    });

    it("listConsentRecords 输出全量 7 项且顺序稳定", () => {
        const state = createDefaultConsentState();
        const list = listConsentRecords(state);
        expect(list).toHaveLength(7);
        expect(list.map(r => r.capability)).toEqual(CONSENT_CAPABILITIES);
    });
});
