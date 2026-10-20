import { describe, expect, it } from "vitest";
import {
    AI_CAPABILITY_REGISTRY,
    AI_LEARNING_MODES,
    AI_RISK_LEVELS,
    evaluateAiActionRisk,
    getAiCapabilitiesByMode,
    getAiCapabilitySpec,
} from "../src/core/ai-capability-map";
import enJson from "../public/i18n/en.json";
import zhJson from "../public/i18n/zh-CN.json";

function resolveKey(obj: any, path: string): string | undefined {
    const parts = path.split(".");
    let curr = obj;
    for (const p of parts) {
        if (!curr || typeof curr !== "object") return undefined;
        curr = curr[p];
    }
    return typeof curr === "string" ? curr : undefined;
}

describe("BU-1 & BU-2: AI Capability Map & Risk Classification Matrix", () => {
    it("登记表覆盖全部六大学习模式，且模式定义完备", () => {
        expect(AI_LEARNING_MODES).toHaveLength(6);
        for (const mode of AI_LEARNING_MODES) {
            const list = getAiCapabilitiesByMode(mode);
            expect(list.length).toBeGreaterThanOrEqual(1);
            for (const item of list) {
                expect(item.mode).toBe(mode);
            }
        }
    });

    it("所有登记能力项均满足不可篡改内核调度核心契约 (effectsKernel: false)", () => {
        expect(AI_CAPABILITY_REGISTRY.length).toBeGreaterThanOrEqual(6);
        for (const item of AI_CAPABILITY_REGISTRY) {
            expect(item.effectsKernel).toBe(false);
            expect(item.prohibitedActions.length).toBeGreaterThan(0);
            expect(item.fallbackAltKey).toBeTruthy();
        }
    });

    it("按 ID 查询能力规范 (getAiCapabilitySpec)", () => {
        const gen = getAiCapabilitySpec("aut-cards-generate");
        expect(gen).not.toBeNull();
        expect(gen?.mode).toBe("author");
        expect(gen?.riskLevel).toBe("content-write");
        expect(gen?.aiRole).toBe("ai-assisted");

        const unknown = getAiCapabilitySpec("unknown-capability-xyz");
        expect(unknown).toBeNull();
    });

    it("BU-2 风险分级矩阵评估规范: read-only 无感执行", () => {
        const evalRes = evaluateAiActionRisk("read-only");
        expect(evalRes.riskLevel).toBe("read-only");
        expect(evalRes.isBlocked).toBe(false);
        expect(evalRes.requiresConfirmation).toBe(false);
        expect(evalRes.requiresPreview).toBe(false);
        expect(evalRes.supportsUndo).toBe(false);
        expect(evalRes.neverDirectlyModifiesKernel).toBe(true);
        expect(evalRes.verdictKey).toBe("aiRisk.verdict.readOnlyAllowed");
    });

    it("BU-2 风险分级矩阵评估规范: candidate 需审阅与预览", () => {
        const evalRes = evaluateAiActionRisk("candidate");
        expect(evalRes.riskLevel).toBe("candidate");
        expect(evalRes.isBlocked).toBe(false);
        expect(evalRes.requiresConfirmation).toBe(true);
        expect(evalRes.requiresPreview).toBe(true);
        expect(evalRes.supportsUndo).toBe(true);
        expect(evalRes.neverDirectlyModifiesKernel).toBe(true);
        expect(evalRes.verdictKey).toBe("aiRisk.verdict.candidateReviewRequired");
    });

    it("BU-2 风险分级矩阵评估规范: content-write 显式同意与撤销", () => {
        const evalRes = evaluateAiActionRisk("content-write");
        expect(evalRes.riskLevel).toBe("content-write");
        expect(evalRes.isBlocked).toBe(false);
        expect(evalRes.requiresConfirmation).toBe(true);
        expect(evalRes.requiresPreview).toBe(true);
        expect(evalRes.supportsUndo).toBe(true);
        expect(evalRes.neverDirectlyModifiesKernel).toBe(true);
        expect(evalRes.verdictKey).toBe("aiRisk.verdict.writeExplicitConsentRequired");
    });

    it("BU-2 风险分级矩阵评估规范: batch-modify 差异对照与安全回滚", () => {
        const evalRes = evaluateAiActionRisk("batch-modify");
        expect(evalRes.riskLevel).toBe("batch-modify");
        expect(evalRes.isBlocked).toBe(false);
        expect(evalRes.requiresConfirmation).toBe(true);
        expect(evalRes.requiresPreview).toBe(true);
        expect(evalRes.supportsUndo).toBe(true);
        expect(evalRes.neverDirectlyModifiesKernel).toBe(true);
        expect(evalRes.verdictKey).toBe("aiRisk.verdict.batchDiffAndRollbackRequired");
    });

    it("BU-2 风险分级矩阵评估规范: kernel-scheduling 严禁越权必须强行阻断", () => {
        const evalRes = evaluateAiActionRisk("kernel-scheduling");
        expect(evalRes.riskLevel).toBe("kernel-scheduling");
        expect(evalRes.isBlocked).toBe(true);
        expect(evalRes.requiresConfirmation).toBe(false);
        expect(evalRes.requiresPreview).toBe(false);
        expect(evalRes.neverDirectlyModifiesKernel).toBe(true);
        expect(evalRes.verdictKey).toBe("aiRisk.verdict.schedulingTamperStrictlyBlocked");
    });

    it("多语言词汇对齐: 登记表引用的全部键在双语 i18n 中均存在且有效", () => {
        for (const cap of AI_CAPABILITY_REGISTRY) {
            // nameKey
            const zhName = resolveKey(zhJson, cap.nameKey);
            const enName = resolveKey(enJson, cap.nameKey);
            expect(zhName, `zh-CN missing ${cap.nameKey}`).toBeTruthy();
            expect(enName, `en missing ${cap.nameKey}`).toBeTruthy();

            // descriptionKey
            const zhDesc = resolveKey(zhJson, cap.descriptionKey);
            const enDesc = resolveKey(enJson, cap.descriptionKey);
            expect(zhDesc, `zh-CN missing ${cap.descriptionKey}`).toBeTruthy();
            expect(enDesc, `en missing ${cap.descriptionKey}`).toBeTruthy();

            // humanRoleKey
            const zhRole = resolveKey(zhJson, cap.humanRoleKey);
            const enRole = resolveKey(enJson, cap.humanRoleKey);
            expect(zhRole, `zh-CN missing ${cap.humanRoleKey}`).toBeTruthy();
            expect(enRole, `en missing ${cap.humanRoleKey}`).toBeTruthy();
        }

        for (const risk of AI_RISK_LEVELS) {
            const res = evaluateAiActionRisk(risk);
            const zhVerdict = resolveKey(zhJson, res.verdictKey);
            const enVerdict = resolveKey(enJson, res.verdictKey);
            expect(zhVerdict, `zh-CN missing ${res.verdictKey}`).toBeTruthy();
            expect(enVerdict, `en missing ${res.verdictKey}`).toBeTruthy();
        }
    });
});
