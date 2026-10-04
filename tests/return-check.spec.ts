import { describe, expect, it } from "vitest";
import { returnCheck, rebuildImpactPreview, BACKLOG_DUE_WARN, GAP_DAYS_WARN } from "../src/core/return-check";
import type { ReturnCheckFacts } from "../src/core/return-check";

// BI-10 长期返场检查（纯逻辑）：四查只读 + 重建影响只读预览
const base: ReturnCheckFacts = {
    activeGoals: 1,
    nearestDeadlineDays: 12,
    staleCount: 0,
    needsRevisionCount: 0,
    dueCount: 20,
    daysSinceLastStudy: 2,
    clockSkewSuspect: false,
    crossDeviceRestore: false,
};

describe("returnCheck 四查", () => {
    it("全部健康：四项 ok，allOk=true，文案键走 .ok", () => {
        const { items, allOk } = returnCheck(base);
        expect(items.map(i => i.key)).toEqual(["goal", "material", "backlog", "device"]);
        expect(allOk).toBe(true);
        expect(items.map(i => i.whyKey)).toEqual([
            "returnCheck.goal.ok",
            "returnCheck.material.ok",
            "returnCheck.backlog.ok",
            "returnCheck.device.ok",
        ]);
        expect(items.every(i => i.level === "info")).toBe(true);
    });

    it("无活跃目标：goal 不过（info 级，不阻断），文案指向重设目标", () => {
        const { items } = returnCheck({ ...base, activeGoals: 0 });
        const goal = items.find(i => i.key === "goal")!;
        expect(goal.ok).toBe(false);
        expect(goal.level).toBe("info");
        expect(goal.whyKey).toBe("returnCheck.goal.none");
    });

    it("目标临期（≤3 天）：仍 ok 但文案提示临期", () => {
        const { items } = returnCheck({ ...base, nearestDeadlineDays: 3 });
        expect(items[0].ok).toBe(true);
        expect(items[0].whyKey).toBe("returnCheck.goal.dueSoon");
    });

    it("材料过时/待修订：material warn（健康问题不冒充记忆失败）", () => {
        const { items, allOk } = returnCheck({ ...base, staleCount: 2, needsRevisionCount: 1 });
        const material = items.find(i => i.key === "material")!;
        expect(material.ok).toBe(false);
        expect(material.level).toBe("warn");
        expect(material.whyKey).toBe("returnCheck.material.stale");
        expect(allOk).toBe(false);
    });

    it(`大积压（>${BACKLOG_DUE_WARN}）：backlog warn 且键为 backlog（非 gap）`, () => {
        const { items } = returnCheck({ ...base, dueCount: BACKLOG_DUE_WARN + 1 });
        const backlog = items.find(i => i.key === "backlog")!;
        expect(backlog.ok).toBe(false);
        expect(backlog.level).toBe("warn");
        expect(backlog.whyKey).toBe("returnCheck.backlog.backlog");
    });

    it(`长间隔（>${GAP_DAYS_WARN} 天）：backlog warn 且键为 gap；恰好阈值不触发`, () => {
        const over = returnCheck({ ...base, daysSinceLastStudy: GAP_DAYS_WARN + 1 });
        expect(over.items.find(i => i.key === "backlog")!.whyKey).toBe("returnCheck.backlog.gap");
        const edge = returnCheck({ ...base, daysSinceLastStudy: GAP_DAYS_WARN });
        expect(edge.items.find(i => i.key === "backlog")!.ok).toBe(true);
        // 无历史（null）不误报长间隔
        const noHistory = returnCheck({ ...base, daysSinceLastStudy: null });
        expect(noHistory.items.find(i => i.key === "backlog")!.ok).toBe(true);
    });

    it("时钟回拨优先于跨设备恢复提示（warn > info）", () => {
        const both = returnCheck({ ...base, clockSkewSuspect: true, crossDeviceRestore: true });
        expect(both.items.find(i => i.key === "device")!.whyKey).toBe("returnCheck.device.skew");
        expect(both.allOk).toBe(false);
        const restore = returnCheck({ ...base, crossDeviceRestore: true });
        const device = restore.items.find(i => i.key === "device")!;
        expect(device.ok).toBe(true);
        expect(device.level).toBe("info");
        expect(device.whyKey).toBe("returnCheck.device.restore");
    });
});

describe("rebuildImpactPreview（只读预览契约）", () => {
    it("保留事实源声明在场：内核 due/revlog、目标档案、生命周期轨迹", () => {
        const impact = rebuildImpactPreview();
        expect(impact.preserves).toContain("returnCheck.rebuild.due");
        expect(impact.preserves).toContain("returnCheck.rebuild.goals");
        expect(impact.preserves).toContain("returnCheck.rebuild.lifecycle");
    });

    it("作废现场声明在场且仅会话现场（不宣称清 due）", () => {
        const impact = rebuildImpactPreview();
        expect(impact.discards).toEqual(["returnCheck.rebuild.session"]);
    });
});
