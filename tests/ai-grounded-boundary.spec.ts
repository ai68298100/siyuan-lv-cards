import { describe, expect, it } from "vitest";
import {
    AI_PRIVACY_POLICIES,
    AI_REQUEST_KINDS,
    checkAiRequestPermission,
    createDefaultAiPrivacySettings,
    getAiRetentionPolicy,
    sanitizePayloadByPrivacy,
} from "../src/core/ai-data-boundary";
import {
    auditGroundedContract,
    bindAssertionsToSourceBlocks,
} from "../src/core/ai-grounded-contract";
import { createDefaultConsentState } from "../src/core/consent-center";
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

describe("BU-9: AI Data Boundary & Privacy Retention Policy", () => {
    it("登记表覆盖全部 5 种请求类型，且 effectsKernel 恒为 false", () => {
        expect(AI_REQUEST_KINDS).toHaveLength(5);
        for (const kind of AI_REQUEST_KINDS) {
            const policy = getAiRetentionPolicy(kind);
            expect(policy.kind).toBe(kind);
            expect(policy.effectsKernel).toBe(false);
            expect(policy.optOutSupported).toBe(true);
            expect(policy.fallbackAltKey).toBeTruthy();
        }
    });

    it("默认设置与授权完整时允许正常执行", () => {
        const settings = createDefaultAiPrivacySettings();
        const consent = createDefaultConsentState();
        consent.records["ai-generation"].status = "granted";

        const res = checkAiRequestPermission("qa", settings, consent);
        expect(res.allowed).toBe(true);
        expect(res.reasonKey).toBe("aiPrivacy.allowed.ready");
    });

    it("同意中心权限被撤销时立即阻断并给出回退替代流程", () => {
        const settings = createDefaultAiPrivacySettings();
        const consent = createDefaultConsentState();
        consent.records["ai-generation"].status = "revoked"; // 撤销 AI 权限

        const res = checkAiRequestPermission("extract", settings, consent);
        expect(res.allowed).toBe(false);
        expect(res.reasonKey).toBe("aiPrivacy.blocked.consentRevoked");
        expect(res.fallbackAltKey).toBe("aiEquiv.alt.cards-generate.1");
    });

    it("用户在隐私设置中逐项关闭某类请求时阻断并平滑回退", () => {
        const settings = createDefaultAiPrivacySettings();
        settings.optedOutKinds.diagnosis = true; // 用户退出诊断类 AI 发送

        const res = checkAiRequestPermission("diagnosis", settings);
        expect(res.allowed).toBe(false);
        expect(res.reasonKey).toBe("aiPrivacy.blocked.userOptedOut");
        expect(res.fallbackAltKey).toBe("aiEquiv.alt.repair-drill");
    });

    it("外发 Payload 脱敏与隐私最小化过滤", () => {
        const settings = createDefaultAiPrivacySettings();
        settings.stripUserAnnotations = true;

        const filtered = sanitizePayloadByPrivacy(
            "diagnosis",
            {
                questionContent: "什么是光合作用？",
                contextBlock: "这是包含机密密钥 123456 的长文本...",
                reviewHistory: { reps: 5, lapses: 2, secretNote: "private-deck-data" },
                userAnnotations: ["用户批注1"],
            },
            settings,
        );

        expect(filtered.questionContent).toBe("什么是光合作用？");
        // diagnosis 不允许 contextBlock
        expect(filtered.contextBlock).toBeUndefined();
        // reviewHistory 中的敏感私密字段被剥离，仅留安全统计
        expect(filtered.reviewHistory).toEqual({ reps: 5, lapses: 2 });
        // 用户标注因 stripUserAnnotations 被剥离
        expect(filtered.userAnnotations).toBeUndefined();
    });
});

describe("BU-10: Grounded Output Contract & Assertion Provenance Binding", () => {
    const mockBlocks = [
        {
            blockId: "20261020-block-1",
            content: "光合作用是植物利用叶绿素和光能将二氧化碳和水转化为有机物的过程。",
            anchorName: "光合作用定义",
        },
        {
            blockId: "20261020-block-2",
            content: "细胞呼吸在线粒体中进行，释放 ATP 供生命活动使用。",
            anchorName: "细胞呼吸",
        },
    ];

    it("有据断言精准绑定来源块 ID、锚点与置信度", () => {
        const aiOutput = "光合作用是植物利用叶绿素将二氧化碳转化为有机物的过程。";
        const bundle = bindAssertionsToSourceBlocks({
            content: aiOutput,
            outputType: "flashcard",
            sourceBlocks: mockBlocks,
        });

        expect(bundle.hasSpeculativeClaims).toBe(false);
        expect(bundle.overallGroundedScore).toBeGreaterThan(0.7);
        expect(bundle.assertions.length).toBeGreaterThan(0);
        expect(bundle.neverMasqueradeAsFacts).toBe(true);

        const first = bundle.assertions[0];
        expect(first.status === "fully-grounded" || first.status === "partially-grounded").toBe(true);
        expect(first.sourceBlockId).toBe("20261020-block-1");
        expect(first.inferredTag).toBe(false);
    });

    it("无原文支撑的断言强制打上 inferredTag 推测标签与警示说明", () => {
        const aiOutput = "植物在月球微重力环境下具有极高生长潜能，其基因表达率提高十倍。";
        const bundle = bindAssertionsToSourceBlocks({
            content: aiOutput,
            outputType: "explanation",
            sourceBlocks: mockBlocks,
        });

        expect(bundle.hasSpeculativeClaims).toBe(true);
        expect(bundle.warningKey).toBe("aiGrounded.warning.containsSpeculativeClaims");
        expect(bundle.assertions.length).toBeGreaterThan(0);

        const spec = bundle.assertions[0];
        expect(spec.status).toBe("inferred-speculation");
        expect(spec.inferredTag).toBe(true);
    });

    it("Grounded 契约合规审查门禁：无来源断言未标 inferredTag 时判定违背契约", () => {
        // 合规样例
        const validBundle = bindAssertionsToSourceBlocks({
            content: "细胞呼吸在线粒体中进行并释放 ATP。",
            outputType: "flashcard",
            sourceBlocks: mockBlocks,
        });
        const auditValid = auditGroundedContract(validBundle);
        expect(auditValid.compliant).toBe(true);
        expect(auditValid.violations).toHaveLength(0);

        // 违规伪装样例（手工模拟违规 payload）
        const fraudBundle = {
            ...validBundle,
            assertions: [
                {
                    id: "fraud-1",
                    statement: "完全凭空捏造的伪科学结论",
                    status: "inferred-speculation" as const,
                    confidence: 0,
                    inferredTag: false, // 违规：未标记推断标签试图冒充事实！
                },
            ],
        };
        const auditFraud = auditGroundedContract(fraudBundle);
        expect(auditFraud.compliant).toBe(false);
        expect(auditFraud.violations.length).toBeGreaterThan(0);
        expect(auditFraud.violations[0]).toContain("wasn't tagged as inferred speculation");
    });

    it("多语言词汇对齐：所有引用的 i18n 键在双语中完整可解析", () => {
        const keys = [
            "aiPrivacy.extract.name",
            "aiPrivacy.extract.desc",
            "aiPrivacy.cloze.name",
            "aiPrivacy.cloze.desc",
            "aiPrivacy.qa.name",
            "aiPrivacy.qa.desc",
            "aiPrivacy.diagnosis.name",
            "aiPrivacy.diagnosis.desc",
            "aiPrivacy.embedding.name",
            "aiPrivacy.embedding.desc",
            "aiPrivacy.blocked.consentRevoked",
            "aiPrivacy.blocked.userOptedOut",
            "aiPrivacy.allowed.ready",
            "aiGrounded.warning.containsSpeculativeClaims",
        ];

        for (const k of keys) {
            const zh = resolveKey(zhJson, k);
            const en = resolveKey(enJson, k);
            expect(zh, `zh-CN missing key: ${k}`).toBeTruthy();
            expect(en, `en missing key: ${k}`).toBeTruthy();
        }
    });
});
