import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import i18n from "../public/i18n/zh-CN.json";
import { emptyRevlog } from "../src/core/revlog";
import Dashboard from "../src/ui/dashboard.svelte";

const mocks = vi.hoisted(() => ({
    getRiffDecks: vi.fn(),
    getRiffCards: vi.fn(),
    getRiffDueCards: vi.fn(),
    dueGet: vi.fn(),
    getFlashcardStatistics: vi.fn(),
    summarizeStatistics: vi.fn(),
}));

vi.mock("../src/api/riff", () => ({
    getRiffDecks: mocks.getRiffDecks,
    getRiffCards: mocks.getRiffCards,
    getRiffDueCards: mocks.getRiffDueCards,
}));

vi.mock("../src/api/due-shared", () => ({
    dueCache: { get: mocks.dueGet },
}));

vi.mock("../src/api/flashcardV2", () => ({
    getFlashcardStatistics: mocks.getFlashcardStatistics,
    summarizeStatistics: mocks.summarizeStatistics,
}));

vi.mock("siyuan", () => ({
    openTab: vi.fn(),
    showMessage: vi.fn(),
}));

const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

describe("dashboard reviewed invalidation & generation guard (AT-11 / AR-6)", () => {
    let reviewedCallbacks: Array<() => void> = [];
    let sessionFinishedCallbacks: Array<() => void> = [];
    let unsubscribedReviewed = 0;

    const notifyReviewed = () => {
        for (const cb of reviewedCallbacks) cb();
    };

    const notifySessionFinished = () => {
        for (const cb of sessionFinishedCallbacks) cb();
    };

    const makeCtx = (overrides: Record<string, unknown> = {}) => ({
        i18n,
        app: {},
        getRevlog: () => emptyRevlog(),
        getV2Status: () => null,
        getDailyTargets: () => ({ new: 0, review: 0 }),
        openReview: vi.fn(),
        openManager: vi.fn(),
        openManagerDeck: vi.fn(),
        openOnboarding: vi.fn(),
        openQuickCard: vi.fn(),
        getAIBatches: () => [],
        getLeechCards: () => [],
        rewriteWithAI: vi.fn(),
        writeReportDoc: vi.fn(async () => undefined),
        getExamCountdown: () => null,
        getXpEnabled: () => false,
        getHeatmapWeeks: () => 4,
        getSuspendedCount: () => 0,
        restoreSuspendedToday: vi.fn(async () => 0),
        onReviewed: (cb: () => void) => {
            reviewedCallbacks.push(cb);
            return () => {
                unsubscribedReviewed++;
                reviewedCallbacks = reviewedCallbacks.filter(c => c !== cb);
            };
        },
        onSessionFinished: (cb: () => void) => {
            sessionFinishedCallbacks.push(cb);
            return () => {
                sessionFinishedCallbacks = sessionFinishedCallbacks.filter(c => c !== cb);
            };
        },
        ...overrides,
    });

    beforeEach(() => {
        vi.useFakeTimers();
        reviewedCallbacks = [];
        sessionFinishedCallbacks = [];
        unsubscribedReviewed = 0;
        mocks.getRiffDecks.mockReset().mockResolvedValue([{ id: "d1", name: "初始卡组", size: 10 }]);
        mocks.dueGet.mockReset().mockResolvedValue({
            cards: [],
            unreviewedCount: 5,
            unreviewedNewCardCount: 2,
            unreviewedOldCardCount: 3,
        });
    });

    afterEach(() => {
        cleanup();
        vi.useRealTimers();
    });

    it("debounces rapid onReviewed events into a single refresh after 800ms (AT-11)", async () => {
        const view = render(Dashboard, { ctx: makeCtx() });

        // 完成组件初始挂载数据拉取
        await vi.advanceTimersByTimeAsync(0);
        expect(mocks.getRiffDecks).toHaveBeenCalledTimes(1);

        // 模拟用户在复习端快速连续评分 4 次（每隔 200ms 触发一次，总共持续 600ms）
        notifyReviewed();
        await vi.advanceTimersByTimeAsync(200);
        notifyReviewed();
        await vi.advanceTimersByTimeAsync(200);
        notifyReviewed();
        await vi.advanceTimersByTimeAsync(200);
        notifyReviewed();

        // 尚未达到最后一次评分后的 800ms 静默窗口，不触发重复的 refresh
        expect(mocks.getRiffDecks).toHaveBeenCalledTimes(1);

        // 等待 790ms，仍处于防抖窗口内
        await vi.advanceTimersByTimeAsync(790);
        expect(mocks.getRiffDecks).toHaveBeenCalledTimes(1);

        // 跨过 800ms 阈值
        await vi.advanceTimersByTimeAsync(20);

        // 关键断言：连续多次评分被精准合并为仅 1 次总览刷新请求
        expect(mocks.getRiffDecks).toHaveBeenCalledTimes(2);

        view.unmount();
    });

    it("generation guard: discards stale response when a newer refresh supersedes it (AR-6)", async () => {
        const firstDecksDeferred = deferred<any[]>();
        const secondDecksDeferred = deferred<any[]>();

        mocks.getRiffDecks
            .mockResolvedValueOnce([{ id: "d1", name: "初始卡组", size: 10 }]) // 挂载时
            .mockReturnValueOnce(firstDecksDeferred.promise)                    // 第一次刷新（慢）
            .mockReturnValueOnce(secondDecksDeferred.promise);                   // 第二次刷新（快）

        const view = render(Dashboard, { ctx: makeCtx() });
        await vi.advanceTimersByTimeAsync(0);

        // 触发第 1 次刷新（慢请求）
        notifyReviewed();
        await vi.advanceTimersByTimeAsync(800);
        expect(mocks.getRiffDecks).toHaveBeenCalledTimes(2);

        // 在第 1 次慢请求尚未 resolve 时，外部同步触发第 2 次刷新请求
        notifySessionFinished();
        expect(mocks.getRiffDecks).toHaveBeenCalledTimes(3);

        // 第 1 次慢响应返回（带有旧数据）
        firstDecksDeferred.resolve([{ id: "d-old", name: "旧卡组数据", size: 1 }]);
        await vi.advanceTimersByTimeAsync(0);

        // 关键断言：因为代次已落后，旧响应被 generation guard 抛弃，界面上绝不显示旧卡组名称
        expect(screen.queryByText("旧卡组数据")).toBeNull();

        // 第 2 次新响应返回（带有最新数据）
        secondDecksDeferred.resolve([{ id: "d-new", name: "最新卡组数据", size: 99 }]);
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(0);

        // 最新数据被成功采纳呈现
        expect(screen.getByText("最新卡组数据")).toBeTruthy();

        view.unmount();
    });

    it("clears debounce timer and unregisters onReviewed listener on unmount", async () => {
        const view = render(Dashboard, { ctx: makeCtx() });
        await vi.advanceTimersByTimeAsync(0);

        expect(reviewedCallbacks).toHaveLength(1);
        expect(unsubscribedReviewed).toBe(0);

        // 触发一次评分，启动 800ms 防抖定时器
        notifyReviewed();

        // 立即卸载组件
        view.unmount();

        // 验证订阅注销
        expect(unsubscribedReviewed).toBe(1);
        expect(reviewedCallbacks).toHaveLength(0);

        // 推进时间，防抖定时器已在 onDestroy 中被 clearTimeout，不发起任何新请求
        await vi.advanceTimersByTimeAsync(1500);
        expect(mocks.getRiffDecks).toHaveBeenCalledTimes(1);
    });
});
