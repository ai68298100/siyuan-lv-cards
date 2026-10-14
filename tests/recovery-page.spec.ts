import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import RecoveryPage from "../src/ui/recovery-page.svelte";
import StudioWorkbench from "../src/ui/studio-workbench.svelte";
import AIWizardStub from "./stubs/AIWizardStub.svelte";

const t = {
    title: "待处理与恢复",
    subtitle: "从留下的现场继续",
    loading: "正在核对待处理事项",
    refresh: "核对最新状态",
    refreshing: "核对中",
    retry: "重试",
    loadFailed: "读取恢复状态失败：${error}",
    refreshFailed: "刷新失败：${error}",
    empty: "当前没有需要恢复的事项",
    startLearning: "打开上手与示例",
    sessionTitle: "上次学习现场",
    sessionDate: "${date} 的现场仍可继续",
    sessionProgress: "已完成 ${reviewed} · 跳过 ${skipped}",
    sessionDescription: "复习现场已保存",
    continueReview: "继续本场复习",
    aiTitle: "AI 制卡作业",
    aiCount: "${count} 个作业需要查看",
    needsReview: "需要查看",
    statusDrafting: "草稿中",
    statusGenerating: "生成中断",
    statusReviewing: "候选待审核",
    statusCommitting: "写入中断",
    statusFailed: "失败待处理",
    statusCanceled: "已取消",
    statusDone: "已完成",
    aiJobCounts: "待写入 ${pending} · 失败 ${failed} · 已写入 ${created}",
    aiDescription: "已写入的卡片不会回滚",
    aiReviewDescription: "候选卡已保存，请重新核对",
    aiWriteCheckDescription: "请先核对目标卡组，不会重复提交",
    aiMaterialUnavailable: "需要重新选择材料，不会自动发送请求",
    resumeReview: "继续审核候选",
    openTargetDeck: "打开目标卡组核对",
    aiDeckLabel: "AI 作业目标卡组",
    aiReviewUnavailable: "作业已变化",
    openAI: "打开 AI 制卡",
    unknownSource: "未知来源",
    unknownDate: "日期未知",
    inboxTitle: "材料收件箱",
    inboxCount: "${count} 项材料等待整理",
    waiting: "待整理",
    inboxDescription: "先查看来源和状态",
    openInbox: "打开收件箱",
    suspendedTitle: "今日暂缓",
    suspendedCount: "${count} 张卡今天暂缓",
    todayOnly: "仅影响今天",
    suspendedDescription: "暂缓是可逆的",
    openMaintenance: "打开维护页",
    noUnknownRating: "不会自动重复评分",
};

const props = (overrides: Record<string, unknown> = {}) => ({
    i18n: { recoveryCenter: t },
    load: vi.fn().mockResolvedValue({ aiJobs: [], inboxCount: 0, suspendedCount: 0, session: null }),
    openAI: vi.fn(),
    openDeck: vi.fn(),
    openInbox: vi.fn(),
    openMaintenance: vi.fn(),
    openReview: vi.fn(),
    openOnboarding: vi.fn(),
    ...overrides,
});

const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
};

describe("recovery center page", () => {
    afterEach(cleanup);

    it("shows loading feedback and locks repeated refresh while the first read is pending", async () => {
        const request = deferred<{ aiJobs: []; inboxCount: number; suspendedCount: number; session: null }>();
        const load = vi.fn(() => request.promise);
        render(RecoveryPage, props({ load }));

        expect(screen.getByLabelText("正在核对待处理事项")).toBeTruthy();
        const refresh = screen.getByRole("button", { name: "核对中" }) as HTMLButtonElement;
        expect(refresh.disabled).toBe(true);
        expect(load).toHaveBeenCalledTimes(1);

        request.resolve({ aiJobs: [], inboxCount: 0, suspendedCount: 0, session: null });
        expect(await screen.findByText("当前没有需要恢复的事项")).toBeTruthy();
    });

    it("shows a readable load error and retries into the recovered empty state", async () => {
        const load = vi.fn()
            .mockRejectedValueOnce(new Error("offline"))
            .mockResolvedValueOnce({ aiJobs: [], inboxCount: 0, suspendedCount: 0, session: null });
        render(RecoveryPage, props({ load }));

        expect(await screen.findByRole("alert")).toBeTruthy();
        expect(screen.getByRole("alert").textContent).toContain("offline");
        await fireEvent.click(screen.getByRole("button", { name: "重试" }));
        expect(await screen.findByText("当前没有需要恢复的事项")).toBeTruthy();
        expect(load).toHaveBeenCalledTimes(2);
    });

    it("offers onboarding from the true empty state", async () => {
        const p = props();
        render(RecoveryPage, p);

        await fireEvent.click(await screen.findByRole("button", { name: "打开上手与示例" }));
        expect(p.openOnboarding).toHaveBeenCalledTimes(1);
    });

    it("routes every recovery action to the matching task and restores only reviewable candidates", async () => {
        const p = props({
            load: vi.fn().mockResolvedValue({
                aiJobs: [
                    { id: "review-1", source: "章节 A", status: "reviewing", pending: 2, failed: 0, created: 0, canReview: true, needsWriteCheck: false, deckID: "" },
                    { id: "write-1", source: "章节 B", status: "committing", pending: 1, failed: 0, created: 1, canReview: false, needsWriteCheck: true, deckID: "deck-b" },
                    { id: "failed-1", source: "章节 C", status: "failed", pending: 0, failed: 0, created: 0, canReview: false, needsWriteCheck: false, deckID: "" },
                ],
                inboxCount: 3,
                suspendedCount: 4,
                session: { date: "20261013", reviewed: 5, skipped: 1 },
            }),
        });
        render(RecoveryPage, p);

        await screen.findByText("AI 制卡作业");
        expect(screen.getByText("候选卡已保存，请重新核对")).toBeTruthy();
        expect(screen.getByText("请先核对目标卡组，不会重复提交")).toBeTruthy();
        expect(screen.getByText("需要重新选择材料，不会自动发送请求")).toBeTruthy();

        await fireEvent.click(screen.getByRole("button", { name: "继续审核候选：章节 A" }));
        await fireEvent.click(screen.getByRole("button", { name: "打开目标卡组核对：章节 B" }));
        await fireEvent.click(screen.getByRole("button", { name: "打开 AI 制卡：章节 C" }));
        await fireEvent.click(screen.getByRole("button", { name: "继续本场复习" }));
        await fireEvent.click(screen.getByRole("button", { name: "打开收件箱" }));
        await fireEvent.click(screen.getByRole("button", { name: "打开维护页" }));

        expect(p.openAI).toHaveBeenNthCalledWith(1, "review-1");
        expect(p.openDeck).toHaveBeenCalledWith("deck-b");
        expect(p.openAI).toHaveBeenNthCalledWith(2);
        expect(p.openReview).toHaveBeenCalledTimes(1);
        expect(p.openInbox).toHaveBeenCalledTimes(1);
        expect(p.openMaintenance).toHaveBeenCalledTimes(1);
    });

    it("keeps an existing AI draft until the user confirms replacing it with recovered candidates", async () => {
        const loadWizard = vi.fn(async (_sources?: unknown, _complete?: unknown, jobId?: string) => ({
            Component: AIWizardStub,
            props: { recoveryJob: jobId ? { id: jobId } : null },
        }));
        const i18n = {
            hubStudioManualTitle: "手工制卡",
            hubStudioManualDesc: "先写问题和答案",
            hubStudioAIConfiguredHint: "检查材料",
            hubStudioAICicker: "AI 辅助",
            hubStudioOnboarding: "上手与示例",
            hubStudioRecoveryReplaceTitle: "恢复审核会替换当前 AI 草稿",
            hubStudioRecoveryReplaceBody: "确认后载入候选卡",
            hubStudioRecoveryReplaceAction: "载入候选审核",
            hubStudioKeepDraft: "保留当前草稿",
            aiWizardTitle: "AI 制卡",
            hubStudioReturnManual: "返回手工制卡",
        };
        const props = {
            i18n,
            isActive: true,
            aiConfigured: true,
            openOnboarding: vi.fn(),
            loadWizard,
            aiRequest: 1,
            recoveryJobId: "",
        };
        const view = render(StudioWorkbench, props);

        expect(await screen.findByText("ordinary")).toBeTruthy();
        expect(loadWizard).toHaveBeenCalledTimes(1);

        await view.rerender({ ...props, aiRequest: 2, recoveryJobId: "review-2" });
        expect(await screen.findByText("恢复审核会替换当前 AI 草稿")).toBeTruthy();
        expect(loadWizard).toHaveBeenCalledTimes(1);

        await fireEvent.click(screen.getByRole("button", { name: "载入候选审核" }));
        expect(await screen.findByText("review-2")).toBeTruthy();
        expect(loadWizard).toHaveBeenNthCalledWith(2, undefined, undefined, "review-2");
    });
});
