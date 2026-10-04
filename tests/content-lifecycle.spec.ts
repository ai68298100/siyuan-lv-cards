import { describe, expect, it } from "vitest";
import {
    canTransition, createLifecycle, ensureLifecycle, lifecycleStats, normalizeLifecycle,
    normalizeLifecycles, transition, type ContentLifecycle,
} from "../src/core/content-lifecycle";

// BI-5 内容状态机：合法转移/原因时间记录/清洗/统计
describe("content-lifecycle（BI-5）", () => {
    it("新建：起点 source，无轨迹", () => {
        const lc = createLifecycle("b1", 1000);
        expect(lc.state).toBe("source");
        expect(lc.history).toHaveLength(0);
    });

    it("正向主链：source→candidate→reviewed→stocked→inReview→applied", () => {
        const lc = createLifecycle("b1", 1000);
        for (const to of ["candidate", "reviewed", "stocked", "inReview", "applied"] as const) {
            expect(transition(lc, to, "主链推进", 2000)).toBe(true);
        }
        expect(lc.state).toBe("applied");
        expect(lc.history).toHaveLength(5);
        expect(lc.history[0].from).toBe("source");
        expect(lc.history[4].to).toBe("applied");
    });

    it("转移必须带原因与时间", () => {
        const lc = createLifecycle("b1", 1000);
        transition(lc, "candidate", "材料入选", 1500);
        expect(lc.history[0].reason).toBe("材料入选");
        expect(lc.history[0].at).toBe(1500);
        expect(transition(lc, "reviewed", "", 1600)).toBe(false); // 空原因拒绝
    });

    it("非法转移拒绝且不写轨迹", () => {
        const lc = createLifecycle("b1", 1000);
        expect(transition(lc, "stocked", "跳级", 1500)).toBe(false); // source 不能直达 stocked
        expect(transition(lc, "source", "同状态", 1500)).toBe(false);
        expect(lc.history).toHaveLength(0);
        expect(lc.state).toBe("source");
    });

    it("回环：needsRevision→candidate 重审；archived→source 解档", () => {
        const lc = createLifecycle("b1", 1000);
        transition(lc, "candidate", "入选", 1500);
        transition(lc, "needsRevision", "内容有误", 1600);
        expect(lc.state).toBe("needsRevision");
        expect(transition(lc, "candidate", "改后重审", 1700)).toBe(true);
        transition(lc, "archived", "弃用", 1800);
        expect(canTransition("archived", "source")).toBe(true);
        expect(transition(lc, "source", "解档重开", 1900)).toBe(true);
    });

    it("canTransition：UI 可达性查询", () => {
        expect(canTransition("source", "candidate")).toBe(true);
        expect(canTransition("source", "inReview")).toBe(false);
        expect(canTransition("archived", "stocked")).toBe(false);
    });

    it("normalizeLifecycle：白名单清洗 + 末态取最后合法轨迹", () => {
        const lc = normalizeLifecycle({
            blockID: "b1",
            createdAt: 1000,
            updatedAt: 4000,
            history: [
                { from: "source", to: "candidate", reason: "入选", at: 1500 },
                { from: "candidate", to: "stocked", reason: "跳级非法", at: 1600 }, // 非法剔除
                { from: "bogus", to: "reviewed", reason: "来源非法", at: 1700 },    // 剔除
                { from: "candidate", to: "reviewed", reason: "审核通过", at: 2000 },
                "junk",
            ],
        });
        expect(lc).not.toBeNull();
        expect(lc!.history).toHaveLength(2);
        expect(lc!.state).toBe("reviewed");
    });

    it("normalizeLifecycle：缺 blockID 剔除；空轨迹回 source", () => {
        expect(normalizeLifecycle({ history: [] })).toBeNull();
        const lc = normalizeLifecycle({ blockID: "b2" });
        expect(lc!.state).toBe("source");
    });

    it("normalizeLifecycles：去重/剔除/空兜底（v0.148.0 集合层）", () => {
        const d = normalizeLifecycles({
            lifecycles: [
                { blockID: "a", history: [{ from: "source", to: "candidate", reason: "入选", at: 100 }] },
                { blockID: "a" },   // 重复 blockID 去重
                { history: [] },    // 缺 blockID 剔除
                "junk",
            ],
        });
        expect(d.version).toBe(1);
        expect(d.lifecycles).toHaveLength(1);
        expect(d.lifecycles[0].state).toBe("candidate");
        expect(normalizeLifecycles(null).lifecycles).toHaveLength(0);
    });

    it("ensureLifecycle：同 blockID 幂等开档（v0.148.0 集合层）", () => {
        const d = { version: 1 as const, lifecycles: [] };
        const a = ensureLifecycle(d, "b1", 1000);
        const b = ensureLifecycle(d, "b1", 2000);
        expect(a).toBe(b);
        expect(d.lifecycles).toHaveLength(1);
    });

    it("lifecycleStats：按状态分组计数", () => {
        const a = createLifecycle("a", 1000);
        transition(a, "candidate", "入选", 1100);
        const b = createLifecycle("b", 1000);
        const c = createLifecycle("c", 1000);
        transition(c, "archived", "弃用", 1100);
        const s = lifecycleStats([a, b, c]);
        expect(s.candidate).toBe(1);
        expect(s.source).toBe(1);
        expect(s.archived).toBe(1);
        expect(s.inReview).toBe(0);
    });
});
