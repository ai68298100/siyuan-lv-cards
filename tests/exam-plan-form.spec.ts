import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import ExamPage from "../src/ui/exam-page.svelte";

const { getRiffDecks, getNotebooks } = vi.hoisted(() => ({ getRiffDecks: vi.fn(), getNotebooks: vi.fn() }));
vi.mock("../src/api/riff", () => ({ getRiffDecks }));
vi.mock("../src/api/siyuan", () => ({ getNotebooks }));

const t = {
    dashboard: { refresh: "重试" }, review: { scopeNotebooks: "笔记本" },
    exam: {
        title: "考试冲刺", pageSub: "每日建议", newPlan: "新建考试计划", scopeAll: "全部范围",
        needName: "请填写计划名称", needDate: "请选择考试日期", untitled: "未命名计划", planName: "计划名称",
        examDateLabel: "考试日期", scopeLabel: "范围", totalCardsLabel: "总卡量", totalCardsHint: "可选",
        cramDaysLabel: "考前天数", editPlan: "编辑考试计划", delete: "删除", emptyHint: "暂无计划",
        loadFailed: "加载失败", cramOn: "冲刺", daysLeft: "剩 ${n} 天", passed: "已过", startToday: "开始今日",
        resume: "恢复", edit: "编辑", report: "报告", writeDoc: "写入", archive: "归档", pause: "暂停", enable: "启用",
        dailyTarget: "每日", cardsUnit: "张", pace: "进度", adviceExpired: "已结束", adviceCapacityUnknown: "未知 ${observed}",
        adviceToday: "今日 ${n}", adviceBehind: "落后 ${n}", adviceOverCap: "需 ${n}", advicePreview: "参考",
    },
};
const base = (extra: Record<string, unknown> = {}) => ({
    i18n: t, plans: { version: 1 as const, plans: [] }, onSavePlan: vi.fn(async () => ({ version: 1 as const, plans: [] })),
    onDeletePlan: vi.fn(async () => ({ version: 1 as const, plans: [] })), onReviewScope: vi.fn(), onReport: vi.fn(),
    onWriteReport: vi.fn(async () => undefined), onError: vi.fn(), getRevlog: () => ({ entries: [] }), getDailyCap: () => 20, ...extra,
});

describe("exam plan form interactions", () => {
    beforeEach(() => {
        getRiffDecks.mockReset().mockResolvedValue([]); getNotebooks.mockReset().mockResolvedValue([]);
        Object.defineProperty(window, "siyuan", { configurable: true, value: { languages: { cancel: "取消", confirm: "确定" } } });
        Object.defineProperty(window, "confirm", { configurable: true, value: vi.fn(() => true) });
    });
    afterEach(cleanup);

    it("keeps draft and locks duplicate saves after a persistence failure", async () => {
        let resolve!: (value: { version: 1; plans: never[] }) => void;
        const pending = new Promise<{ version: 1; plans: never[] }>(r => { resolve = r; });
        const onSavePlan = vi.fn().mockRejectedValueOnce(new Error("磁盘不可用")).mockReturnValueOnce(pending);
        render(ExamPage, base({ onSavePlan }));
        await fireEvent.click(screen.getByRole("button", { name: "+ 新建考试计划" }));
        await fireEvent.input(screen.getByLabelText("计划名称"), { target: { value: "期末" } });
        await fireEvent.input(screen.getByLabelText("考试日期"), { target: { value: "2030-05-01" } });
        await fireEvent.click(screen.getByRole("button", { name: "确定" }));
        expect(await screen.findByText(/保存考试计划失败：磁盘不可用/)).toBeTruthy();
        expect((screen.getByLabelText("计划名称") as HTMLInputElement).value).toBe("期末");
        const retry = screen.getByRole("button", { name: "重试保存" }) as HTMLButtonElement;
        await fireEvent.click(retry); await fireEvent.click(retry);
        expect(retry.disabled).toBe(true); expect(onSavePlan).toHaveBeenCalledTimes(2);
        resolve({ version: 1, plans: [] });
        await waitFor(() => expect(screen.queryByLabelText("计划名称")).toBeNull());
    });

    it("shows range loading feedback while keeping all-scope plan creation available", async () => {
        let resolveDecks!: (value: never[]) => void;
        const pendingDecks = new Promise<never[]>(resolve => { resolveDecks = resolve; });
        getRiffDecks.mockReturnValueOnce(pendingDecks);
        render(ExamPage, base());

        expect(screen.getByRole("status").textContent).toContain("加载中…");
        expect((screen.getByRole("button", { name: "+ 新建考试计划" }) as HTMLButtonElement).disabled).toBe(false);
        resolveDecks([]);
        await waitFor(() => expect(screen.queryByRole("status", { name: "加载中…" })).toBeNull());
        expect((screen.getByRole("button", { name: "+ 新建考试计划" }) as HTMLButtonElement).disabled).toBe(false);
    });

    it("requires confirmation before deletion and keeps the plan for a retry", async () => {
        const plan = { id: "p", name: "期末", examDate: "2030-05-01", scopeKind: "all" as const, scopeId: "", scopeName: "全部范围", cramDays: 7, enabled: true, createdAt: Date.now() };
        const onDeletePlan = vi.fn().mockRejectedValueOnce(new Error("写入失败")).mockResolvedValueOnce({ version: 1 as const, plans: [] });
        const confirm = window.confirm as ReturnType<typeof vi.fn>;
        render(ExamPage, base({ plans: { version: 1, plans: [plan] }, onDeletePlan }));
        await fireEvent.click(screen.getByRole("button", { name: "删除" }));
        expect(confirm).toHaveBeenCalledOnce(); expect(await screen.findByText(/保存考试计划失败：写入失败/)).toBeTruthy();
        await fireEvent.click(screen.getByRole("button", { name: "重试" }));
        await waitFor(() => expect(onDeletePlan).toHaveBeenCalledTimes(2)); expect(confirm).toHaveBeenCalledOnce();
    });

    it("cancels plan editing when Escape key is pressed", async () => {
        render(ExamPage, base());
        await fireEvent.click(screen.getByRole("button", { name: "+ 新建考试计划" }));
        expect(screen.getByLabelText("计划名称")).toBeTruthy();

        const input = screen.getByLabelText("计划名称");
        await fireEvent.keyDown(input, { key: "Escape" });
        await waitFor(() => expect(screen.queryByLabelText("计划名称")).toBeNull());
    });
});
