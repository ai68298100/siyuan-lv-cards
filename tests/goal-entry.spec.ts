import { describe, expect, it } from "vitest";
import {
    currentCriteria, daysUntilDeadline, emptyGoals, isGoalActive, normalizeGoals, setCriteria, sortGoalsByPriority, suggestedMinutes,
    type LearningGoal,
} from "../src/core/learning-goal";
import {
    emptyEntryContexts, findContext, isContextFresh, normalizeEntryContexts,
    removeContext, upsertContext, type EntryContext,
} from "../src/core/entry-context";

// BI-1 目标模型：只记录目标不强迫建卡
describe("learning-goal（BI-1）", () => {
    it("normalizeGoals：最小目标可存（无材料无截止不强迫建卡）", () => {
        const g = normalizeGoals({ goals: [{ id: "g1", purpose: "explore" }] }).goals[0];
        expect(g.purpose).toBe("explore");
        expect(g.deadline).toBeNull();
        expect(g.materialBlockIDs).toEqual([]);
        expect(g.minutesPerDay).toBe(0);
    });

    it("normalizeGoals：白名单清洗 + 材料去重 + 非法目的回 review", () => {
        const d = normalizeGoals({
            goals: [
                { id: "g1", purpose: "bogus", deadline: "2026-11-01", materialBlockIDs: ["b1", "b1", "", 42, "b2"], minutesPerDay: 25.9, level: "novice" },
                { purpose: "review" },               // 缺 id 剔除
                { id: "g1", purpose: "build" },      // 重复 id 剔除
            ],
        });
        expect(d.goals).toHaveLength(1);
        const g = d.goals[0];
        expect(g.purpose).toBe("review");       // 非法目的兜底
        expect(g.materialBlockIDs).toEqual(["b1", "b2"]);
        expect(g.minutesPerDay).toBe(25);        // 向下取整
        expect(g.level).toBe("novice");
    });

    it("daysUntilDeadline：同日 0 / 未来正 / 已过负 / 无截止 null", () => {
        const mk = (deadline: string | null): LearningGoal => ({
            id: "g", purpose: "review", deadline, materialBlockIDs: [], minutesPerDay: 0, level: "beginner", createdAt: 0, updatedAt: 0,
        });
        expect(daysUntilDeadline(mk("2026-10-10"), "2026-10-10")).toBe(0);
        expect(daysUntilDeadline(mk("2026-10-15"), "2026-10-10")).toBe(5);
        expect(daysUntilDeadline(mk("2026-10-01"), "2026-10-10")).toBe(-9);
        expect(daysUntilDeadline(mk(null), "2026-10-10")).toBeNull();
    });

    it("isGoalActive：无截止活跃；截止当天活跃；过后不活跃", () => {
        const mk = (deadline: string | null): LearningGoal => ({
            id: "g", purpose: "review", deadline, materialBlockIDs: [], minutesPerDay: 0, level: "beginner", createdAt: 0, updatedAt: 0,
        });
        expect(isGoalActive(mk(null), "2026-10-10")).toBe(true);
        expect(isGoalActive(mk("2026-10-10"), "2026-10-10")).toBe(true);
        expect(isGoalActive(mk("2026-10-09"), "2026-10-10")).toBe(false);
    });

    it("suggestedMinutes：复习/维护基础更低，水平越高越长，5 分钟取整", () => {
        expect(suggestedMinutes("review", "novice")).toBe(15);
        expect(suggestedMinutes("build", "novice")).toBe(25);
        expect(suggestedMinutes("build", "advanced")).toBe(50);
        expect(suggestedMinutes("explore", "beginner")).toBe(30);
    });
});

// BI-11 多目标取舍：优先级分层排序，纯展示序不改调度
describe("learning-goal BI-11：多目标取舍", () => {
    const g = (id: string, priority?: string, createdAt = 0): LearningGoal =>
        normalizeGoals({ goals: [{ id, purpose: "review", minutesPerDay: 0, level: "beginner", priority, createdAt }] }).goals[0];

    it("normalize 白名单清洗：非法优先级回缺省（维持）", () => {
        expect(g("a", "primary").priority).toBe("primary");
        expect(g("b", "hack").priority).toBeUndefined();
        expect(g("c").priority).toBeUndefined();
    });

    it("分层排序 primary→keep→pause；同层 createdAt 升序稳定；不改原数组", () => {
        const input = [g("k1", "keep", 1), g("p1", "primary", 2), g("z", undefined, 3), g("p2", "pause", 4), g("k2", "keep", 0)];
        const out = sortGoalsByPriority(input);
        expect(out.map(x => x.id)).toEqual(["p1", "k2", "k1", "z", "p2"]);
        // 纯展示序：输入数组不受影响（验收：不暗中改 due/调度）
        expect(input.map(x => x.id)).toEqual(["k1", "p1", "z", "p2", "k2"]);
    });
});

// BI-16 自定义完成定义：标准可修改，历史保留当时定义
describe("learning-goal BI-16：完成定义", () => {
    const mk = (): LearningGoal => normalizeGoals({ goals: [{ id: "a", purpose: "review", minutesPerDay: 0, level: "beginner" }] }).goals[0];

    it("setCriteria：追加历史保留旧定义；同文无操作；空文本忽略", () => {
        const goal = mk();
        expect(setCriteria(goal, "能给别人讲解双膜结构", 1000)).toBe(true);
        expect(setCriteria(goal, "能给别人讲解双膜结构", 2000)).toBe(false); // 同文无操作
        expect(setCriteria(goal, "读完第一章并做对例题", 3000)).toBe(true);
        expect(goal.criteriaHistory).toEqual([
            { text: "能给别人讲解双膜结构", since: 1000 },
            { text: "读完第一章并做对例题", since: 3000 },
        ]);
        expect(currentCriteria(goal)).toBe("读完第一章并做对例题");
        expect(setCriteria(goal, "   ", 4000)).toBe(false); // 空文本忽略
        expect(currentCriteria(goal)).toBe("读完第一章并做对例题");
    });

    it("normalize 白名单：空文本条目剔除、超长截 100、非法 since 兜底、空历史回缺省", () => {
        const d = normalizeGoals({
            goals: [{
                id: "a", purpose: "review", minutesPerDay: 0, level: "beginner",
                criteriaHistory: [{ text: "  读完教材  ", since: 500 }, { text: "", since: 600 }, { text: "x".repeat(150), since: 700 }],
            }],
        });
        const h = d.goals[0].criteriaHistory!;
        expect(h).toHaveLength(2);
        expect(h[0]).toEqual({ text: "读完教材", since: 500 });
        expect(h[1].text).toHaveLength(100);
        expect(normalizeGoals({ goals: [{ id: "b", purpose: "review", criteriaHistory: [] }] }).goals[0].criteriaHistory).toBeUndefined();
        expect(currentCriteria(mk())).toBe("");
    });
});

// BI-3 入口上下文：来源/范围/目标/返回点保留，取消重开不丢
describe("entry-context（BI-3）", () => {
    const ctx: EntryContext = {
        entryKind: "block", sourceID: "b1", scopeKey: "deck::x", goalID: "g1", returnPoint: "lv-cards-dashboard", createdAt: 1000,
    };

    it("upsert+find：同 kind+source 刷新保留最新", () => {
        let d = upsertContext(emptyEntryContexts(), ctx);
        const updated = { ...ctx, scopeKey: "deck::y", createdAt: 2000 };
        d = upsertContext(d, updated);
        expect(d.contexts).toHaveLength(1);
        expect(findContext(d, "block", "b1")!.scopeKey).toBe("deck::y");
    });

    it("normalize：往返无损（取消/重开不丢上下文）", () => {
        const d = upsertContext(emptyEntryContexts(), ctx);
        const round = normalizeEntryContexts(JSON.parse(JSON.stringify(d)));
        expect(round).toEqual(d);
    });

    it("normalize：无 sourceID 剔除；同键去重保后", () => {
        const r = normalizeEntryContexts({
            contexts: [
                { entryKind: "block", sourceID: "", createdAt: 1 },
                { entryKind: "doc", sourceID: "d1", scopeKey: "a", createdAt: 1 },
                { entryKind: "doc", sourceID: "d1", scopeKey: "b", createdAt: 2 },
            ],
        });
        expect(r.contexts).toHaveLength(1);
        expect(r.contexts[0].scopeKey).toBe("b");
    });

    it("removeContext：完成/放弃清除", () => {
        let d = upsertContext(emptyEntryContexts(), ctx);
        expect(removeContext(d, "block", "b1")).toBe(true);
        expect(removeContext(d, "block", "b1")).toBe(false);
        expect(findContext(d, "block", "b1")).toBeNull();
    });

    it("isContextFresh：默认 7 天有效期", () => {
        expect(isContextFresh(ctx, 1000 + 6 * 86400000)).toBe(true);
        expect(isContextFresh(ctx, 1000 + 8 * 86400000)).toBe(false);
    });
});
