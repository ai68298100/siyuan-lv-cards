import { describe, expect, it, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import LifecyclePanel from "../src/ui/lifecycle-panel.svelte";
import type { LcSnapshot } from "../src/ui/lifecycle-panel.svelte";

// BI-5/6/7 UI：内容状态面板（状态 chip + 为什么解释 + 下一动作建议 + 状态流转 + 轨迹）
const t = {
    lc: {
        title: "内容状态",
        hint: "尚未为该内容记录生命周期。",
        open: "开档记录",
        next: "下一步建议",
        flow: "状态流转",
        history: "轨迹",
        historyEmpty: "暂无转移记录",
        state: {
            source: "来源", candidate: "候选", reviewed: "已审核", stocked: "已入库",
            inReview: "复习中", applied: "已应用", needsRevision: "需修订",
            paused: "已暂停", stale: "已过时", archived: "已归档",
        },
        reason: {
            source: "解档重开", candidate: "进入加工视野", reviewed: "人工确认内容无误", stocked: "制卡入库",
            inReview: "进入正式复习", applied: "已在输出或练习中使用", needsRevision: "发现问题待修订",
            paused: "主动搁置", stale: "来源内容已变化", archived: "归档退出活跃周期", resume: "恢复复习",
        },
    },
    nextAction: {
        openSource: "回来源", explain: "解释", makeCards: "制卡", practice: "练习",
        formalReview: "正式复习", revise: "修订", wrapUp: "收工",
    },
    stateWhy: {
        source: "这是材料原文，尚未进入加工。",
        paused: "已主动搁置，可随时恢复。",
        stocked: "已产出卡片，等进入正式复习。",
        repairResume: "恢复复习",
        repairUnarchive: "解档重开",
    },
};

function snap(state: LcSnapshot["state"], history: LcSnapshot["history"] = []): LcSnapshot {
    return { state, history };
}

function renderPanel(snapshot: LcSnapshot | null, overrides: Partial<Record<string, any>> = {}) {
    const onopen = vi.fn();
    const ontransition = vi.fn(() => true);
    const onaction = vi.fn();
    const inst = render(LifecyclePanel, {
        t, snapshot, onopen, ontransition, onaction, ...overrides,
    });
    return { ...inst, onopen, ontransition, onaction };
}

describe("lifecycle-panel（BI-5/6/7 UI）", () => {
    afterEach(cleanup);

    it("未开档：显示提示与开档按钮，点击回调 onopen", async () => {
        const { getByText, onopen } = renderPanel(null);
        expect(getByText("尚未为该内容记录生命周期。")).toBeTruthy();
        await fireEvent.click(getByText("开档记录"));
        expect(onopen).toHaveBeenCalledOnce();
    });

    it("已开档 source：状态 chip + BI-7 为什么解释 + 修复按钮（makeCards 派发 onaction）", async () => {
        const { container, getByText, onaction } = renderPanel(snap("source"));
        expect(getByText("来源")).toBeTruthy();
        expect(getByText("这是材料原文，尚未进入加工。")).toBeTruthy();
        // 修复按钮与建议 chip 同文案（制卡），取解释行的修复按钮派发
        const repair = container.querySelector(".lv-lc-now button")!;
        await fireEvent.click(repair);
        expect(onaction).toHaveBeenCalledWith("makeCards");
    });

    it("BI-6 建议顺序随状态（source=解释/制卡/收工），点击派发 action 字符串", async () => {
        const { container, onaction } = renderPanel(snap("source"));
        const actions = [...container.querySelectorAll(".lv-lc-actions")][0];
        const labels = [...actions.querySelectorAll("button")].map(b => b.textContent);
        expect(labels).toEqual(["解释", "制卡", "收工"]);
        await fireEvent.click(actions.querySelectorAll("button")[2]);
        expect(onaction).toHaveBeenCalledWith("wrapUp");
    });

    it("BI-5 状态流转只列合法目标，点击携带目标态与预设原因", async () => {
        const { container, getByText, ontransition } = renderPanel(snap("source"));
        const flow = [...container.querySelectorAll(".lv-lc-flow button")].map(b => b.textContent);
        expect(flow).toEqual(["候选", "已归档"]);
        await fireEvent.click(getByText("候选"));
        expect(ontransition).toHaveBeenCalledWith("candidate", "进入加工视野");
    });

    it("BI-5 轨迹倒序渲染（最新在前），含原因与文案", () => {
        const { container } = renderPanel(snap("stocked", [
            { from: "source", to: "candidate", reason: "进入加工视野", at: 1000 },
            { from: "candidate", to: "reviewed", reason: "人工确认内容无误", at: 2000 },
            { from: "reviewed", to: "stocked", reason: "制卡入库", at: 3000 },
        ]));
        const items = [...container.querySelectorAll(".lv-lc-history li")].map(li => li.textContent);
        expect(items).toHaveLength(3);
        expect(items[0]).toContain("已审核 → 已入库");
        expect(items[0]).toContain("制卡入库");
        expect(items[2]).toContain("来源 → 候选");
    });

    it("空轨迹显示占位文案", () => {
        const { getByText } = renderPanel(snap("source"));
        expect(getByText("暂无转移记录")).toBeTruthy();
    });

    it("BI-7 paused 修复动作=生命周期转移（resume → inReview + 预设原因）", async () => {
        const { getByText, ontransition, onaction } = renderPanel(snap("paused"));
        expect(getByText("已主动搁置，可随时恢复。")).toBeTruthy();
        await fireEvent.click(getByText("恢复复习"));
        expect(ontransition).toHaveBeenCalledWith("inReview", "恢复复习");
        expect(onaction).not.toHaveBeenCalled();
    });

    it("archived 修复动作=解档（unarchive → source + 预设原因）", async () => {
        const { getByText, ontransition } = renderPanel(snap("archived"));
        await fireEvent.click(getByText("解档重开"));
        expect(ontransition).toHaveBeenCalledWith("source", "解档重开");
    });

    it("stocked 态：主建议=正式复习；流转含 inReview/needsRevision/archived", () => {
        const { container, getByText } = renderPanel(snap("stocked"));
        const actions = [...container.querySelectorAll(".lv-lc-actions")][0];
        expect(actions.querySelector("button")!.textContent).toBe("正式复习");
        const flow = [...container.querySelectorAll(".lv-lc-flow button")].map(b => b.textContent);
        expect(flow).toEqual(["复习中", "需修订", "已归档"]);
        expect(getByText("已产出卡片，等进入正式复习。")).toBeTruthy();
    });
});
