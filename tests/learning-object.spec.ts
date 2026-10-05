import { describe, expect, it } from "vitest";
import {
    canLoTransition, createLearningObject, loTransition, loTransitionMeta, normalizeLearningObject, undoLastLoTransition,
} from "../src/core/learning-object";

// BI-19 学习对象生命周期：九态 + 转移必带触发/责任/原因/撤销四元数据（验收硬性要求）
describe("learning-object（BI-19）", () => {
    it("主旅程：captured→clarified→candidate→committed→practiced→applied→maintained", () => {
        const lo = createLearningObject("lo1", 1000);
        expect(lo.state).toBe("captured");
        for (const to of ["clarified", "candidate", "committed", "practiced", "applied", "maintained"] as const) {
            expect(loTransition(lo, to, 0), `→ ${to}`).toBe(true);
        }
        expect(lo.state).toBe("maintained");
        expect(lo.history).toHaveLength(6);
    });

    it("转移记录携带四元数据（触发/责任/原因/撤销）", () => {
        const lo = createLearningObject("lo1", 1000);
        loTransition(lo, "clarified", 2000);
        const rec = lo.history[0];
        expect(rec).toMatchObject({
            from: "captured", to: "clarified", at: 2000,
            trigger: "clarify", owner: "capture", reasonKey: "loState.clarified", undo: "previous",
        });
        // 制卡承诺的责任模块=wizard
        loTransition(lo, "candidate", 3000);
        loTransition(lo, "committed", 4000);
        expect(lo.history[2]).toMatchObject({ trigger: "cards-created", owner: "wizard", undo: "explicit" });
    });

    it("非法转移拒绝：跳级/反向无表项不写入", () => {
        const lo = createLearningObject("lo1");
        expect(loTransition(lo, "committed")).toBe(false); // captured 跳到 committed
        expect(canLoTransition("captured", "applied")).toBe(false);
        expect(lo.history).toHaveLength(0);
        expect(lo.state).toBe("captured");
    });

    it("撤销策略：previous 回退上一态（追加反向记录）；none/explicit 拒绝撤销", () => {
        const lo = createLearningObject("lo1");
        loTransition(lo, "clarified", 1000);
        expect(undoLastLoTransition(lo, 2000)).toBe(true);
        expect(lo.state).toBe("captured");
        // 反向记录也是合法转移（captured→clarified 的表项）
        expect(lo.history[1]).toMatchObject({ from: "clarified", to: "captured" });

        const lo2 = createLearningObject("lo2");
        loTransition(lo2, "clarified", 1000);
        loTransition(lo2, "candidate", 2000);
        loTransition(lo2, "committed", 3000); // explicit
        expect(undoLastLoTransition(lo2, 4000)).toBe(false); // explicit 不走自动撤销

        const lo3 = createLearningObject("lo3");
        loTransition(lo3, "clarified", 1000);
        loTransition(lo3, "candidate", 2000);
        loTransition(lo3, "committed", 3000);
        loTransition(lo3, "practiced", 4000); // none
        expect(undoLastLoTransition(lo3, 5000)).toBe(false);
    });

    it("退役可重新捕获；stale 可回收或退役", () => {
        const lo = createLearningObject("lo1");
        loTransition(lo, "clarified");
        loTransition(lo, "stale");
        expect(canLoTransition("stale", "captured")).toBe(true);
        loTransition(lo, "captured");
        expect(lo.state).toBe("captured");
        loTransition(lo, "clarified");
        loTransition(lo, "candidate");
        loTransition(lo, "stale");
        loTransition(lo, "retired");
        expect(lo.state).toBe("retired");
        expect(canLoTransition("retired", "captured")).toBe(true);
    });

    it("normalize：非法轨迹剔除、元数据缺一剔除、末态取最后合法轨迹、历史上限", () => {
        const d = normalizeLearningObject({
            id: "lo1",
            history: [
                { from: "captured", to: "clarified", at: 1, trigger: "clarify", owner: "capture", reasonKey: "k" },
                { from: "clarified", to: "applied", at: 2, trigger: "jump", owner: "x", reasonKey: "k" }, // 非法跳级
                { from: "clarified", to: "candidate", at: 3, trigger: "", owner: "capture", reasonKey: "k" }, // 缺 trigger
                { from: "clarified", to: "candidate", at: 4, trigger: "mark-candidate", owner: "capture", reasonKey: "k" },
            ],
        });
        expect(d!.state).toBe("candidate");
        expect(d!.history).toHaveLength(2);
        expect(d!.history[1].at).toBe(4);
        expect(normalizeLearningObject({})).toBeNull();
        // 巨量轨迹截断（历史上限内合法即收）
        const many = Array.from({ length: 80 }, (_, i) => ({
            from: "captured", to: "clarified", at: i, trigger: "clarify", owner: "capture", reasonKey: "k",
        }));
        const capped = normalizeLearningObject({ id: "lo2", history: many });
        expect(capped!.history.length).toBeLessThanOrEqual(50);
    });

    it("转移元数据查询：表外返回 null", () => {
        expect(loTransitionMeta("captured", "clarified")?.owner).toBe("capture");
        expect(loTransitionMeta("captured", "maintained")).toBeNull();
    });
});
