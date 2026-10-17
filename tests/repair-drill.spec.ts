import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import RepairDrill from "../src/ui/repair-drill.svelte";

vi.mock("svelte/transition", () => ({ fade: () => ({ duration: 0, css: () => "" }) }));

const mockI18n = {
    drillStep1: "看材料",
    drillStep2: "找问题",
    drillStep3: "改题面",
    drillStep4: "对照改法",
    drillStep5: "旁路试练",
    drillBadge: "演练数据",
    drillSample1: "样例一 · 题面过宽",
    drillMaterial: "TCP 是面向连接的可靠传输协议。",
    drillBrokenQ: "TCP 到底是什么？",
    drillIssue: "问题：考察范围过宽",
    drillFixed: "TCP 建立连接时，为什么需要同步初始序列号？",
    drillAnswer: "确认双方具备发送与接收能力",
    drillSample2: "样例二 · 缺少条件",
    drill2Material: "光在真空中的传播速度约为每秒 30 万公里。",
    drill2BrokenQ: "光速是多少？",
    drill2Issue: "问题：缺少必要介质条件",
    drill2Fixed: "光在真空中的传播速度是多少？",
    drill2Answer: "约每秒 30 万公里",
    drillMaterialLabel: "材料与必要条件",
    drillMaterialNote: "来源快照 · 版本 2",
    drillIntro: "用固定样例走一遍修卡流程",
    drillCardLabel: "待修的卡",
    drillEditLabel: "把题面改得更明确",
    drillEditNote: "边改边看预览",
    aiWizard: { previewQLabel: "卡面预览" },
    drillFixedLabel: "固定改法",
    drillCompareNote: "对照你的改法",
    drillPractice: "旁路试练",
    drillReveal: "显示参考",
    drillPracticeNote: "自评对照，不产生正式评分",
    drillPrev: "上一步",
    drillNext: "下一步",
    drillExit: "完成演练",
    drillFoot: "独立演练，全程零网络",
};

describe("repair drill component flow", () => {
    beforeEach(() => {
        Object.defineProperty(window, "siyuan", {
            configurable: true,
            value: { languages: { cancel: "取消" } },
        });
    });

    afterEach(cleanup);

    it("renders step 1 with sample materials and advances through 5 steps", async () => {
        const onClose = vi.fn();
        render(RepairDrill, { i18n: mockI18n, onClose });

        expect(screen.getByText("材料与必要条件")).toBeTruthy();
        expect(screen.getByText("TCP 是面向连接的可靠传输协议。")).toBeTruthy();
        expect(screen.getByText("1 / 5")).toBeTruthy();

        // 步进到步骤 2
        await fireEvent.click(screen.getByRole("button", { name: "下一步 →" }));
        expect(screen.getByText("待修的卡")).toBeTruthy();
        expect(screen.getByText("TCP 到底是什么？")).toBeTruthy();
        expect(screen.getByText("2 / 5")).toBeTruthy();

        // 步进到步骤 3
        await fireEvent.click(screen.getByRole("button", { name: "下一步 →" }));
        expect(screen.getByLabelText("把题面改得更明确")).toBeTruthy();
        expect(screen.getByText("3 / 5")).toBeTruthy();

        // 步进到步骤 4
        await fireEvent.click(screen.getByRole("button", { name: "下一步 →" }));
        expect(screen.getByText("固定改法")).toBeTruthy();
        expect(screen.getByText("4 / 5")).toBeTruthy();

        // 步进到步骤 5
        await fireEvent.click(screen.getByRole("button", { name: "下一步 →" }));
        expect(screen.getAllByText("旁路试练").length).toBeGreaterThan(0);
        expect(screen.getByText("5 / 5")).toBeTruthy();

        // 揭晓答案
        const revealBtn = screen.getByRole("button", { name: "显示参考" });
        await fireEvent.click(revealBtn);
        expect(screen.getByText("确认双方具备发送与接收能力")).toBeTruthy();

        // 完成演练
        await fireEvent.click(screen.getByRole("button", { name: "完成演练" }));
        expect(onClose).toHaveBeenCalledOnce();
    });

    it("switches samples and resets to step 1", async () => {
        render(RepairDrill, { i18n: mockI18n, onClose: vi.fn() });

        // 切换到样例二
        await fireEvent.click(screen.getByRole("button", { name: "样例二 · 缺少条件" }));
        expect(screen.getByText("光在真空中的传播速度约为每秒 30 万公里。")).toBeTruthy();
        expect(screen.getByText("1 / 5")).toBeTruthy();
    });

    it("supports keyboard navigation: ArrowRight / ArrowLeft to step and Escape to close", async () => {
        const onClose = vi.fn();
        render(RepairDrill, { i18n: mockI18n, onClose });

        // ArrowRight 步进到第 2 步
        await fireEvent.keyDown(window, { key: "ArrowRight" });
        expect(screen.getByText("2 / 5")).toBeTruthy();

        // ArrowLeft 返回第 1 步
        await fireEvent.keyDown(window, { key: "ArrowLeft" });
        expect(screen.getByText("1 / 5")).toBeTruthy();

        // Escape 关闭演练弹窗
        await fireEvent.keyDown(window, { key: "Escape" });
        expect(onClose).toHaveBeenCalledOnce();
    });
});
