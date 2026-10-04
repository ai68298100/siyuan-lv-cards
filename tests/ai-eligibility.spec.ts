import { describe, expect, it } from "vitest";
import { checkEligibility, type EligibilityFacts } from "../src/core/ai-eligibility";

// BU-33 eligibility 前置检查：组装 prompt 前阻断 + 给出替代路径；事实缺失=不判而非失败
const healthy: EligibilityFacts = { hasMaterial: true, aiConfigured: true };

describe("ai-eligibility（BU-33）", () => {
    it("全部健康：ok=true 无阻断；未提供的可选事实不判", () => {
        const r = checkEligibility(healthy);
        expect(r.ok).toBe(true);
        expect(r.block).toBeNull();
        expect(r.allBlocks).toEqual([]);
    });

    it("材料缺失阻断，替代路径键成对", () => {
        const r = checkEligibility({ ...healthy, hasMaterial: false });
        expect(r.ok).toBe(false);
        expect(r.block!.reason).toBe("no-material");
        expect(r.block!.reasonKey).toBe("aiElig.no-material");
        expect(r.block!.alternativeKey).toBe("aiElig.alt.no-material");
    });

    it("custom 未配置端点/密钥阻断；网络事实缺失不判、false 才阻断", () => {
        const r = checkEligibility({ ...healthy, aiConfigured: false, online: undefined });
        expect(r.block!.reason).toBe("not-configured");
        expect(checkEligibility({ ...healthy }).ok).toBe(true);
        expect(checkEligibility({ ...healthy, online: false }).block!.reason).toBe("offline");
        expect(checkEligibility({ ...healthy, online: true }).ok).toBe(true);
    });

    it("敏感来源与成本耗尽阻断（接口预留，事实未传恒不判）", () => {
        expect(checkEligibility({ ...healthy, sensitive: true }).block!.reason).toBe("sensitive-source");
        expect(checkEligibility({ ...healthy, costExceeded: true }).block!.reason).toBe("cost-exceeded");
        expect(checkEligibility({ ...healthy, sensitive: false, costExceeded: false }).ok).toBe(true);
    });

    it("多条件阻断按固定优先级取首（材料→配置→网络→敏感→成本）", () => {
        const r = checkEligibility({
            hasMaterial: false, aiConfigured: false, online: false, sensitive: true, costExceeded: true,
        });
        expect(r.block!.reason).toBe("no-material");
        expect(r.allBlocks.map(b => b.reason)).toEqual([
            "no-material", "not-configured", "offline", "sensitive-source", "cost-exceeded",
        ]);
    });
});
