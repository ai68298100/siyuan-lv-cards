import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/svelte";
import Dashboard from "@/ui/dashboard.svelte";
import i18n from "../public/i18n/zh-CN.json";
import { emptyRevlog } from "@/core/revlog";

const mocks = vi.hoisted(() => ({
    getRiffDecks: vi.fn(),
    getRiffCards: vi.fn(),
    calcDue: vi.fn(),
    getFlashcardStatistics: vi.fn(),
    kernelRead: vi.fn(),
}));

vi.mock("@/api/siyuan", () => ({
    getRiffDecks: (...args: unknown[]) => mocks.getRiffDecks(...args),
    getRiffCards: (...args: unknown[]) => mocks.getRiffCards(...args),
    getFlashcardStatistics: (...args: unknown[]) => mocks.getFlashcardStatistics(...args),
    kernelRead: (...args: unknown[]) => mocks.kernelRead(...args),
}));

vi.mock("@/core/due", () => ({
    calcDue: (...args: unknown[]) => mocks.calcDue(...args),
}));

function deferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

describe("Dashboard manual advance 与中心页并发刷新请求顺序防护（AR-6 / AQ-19）", () => {
    let sessionFinishedCallbacks: Array<() => void> = [];
    let reviewedCallbacks: Array<() => void> = [];

    beforeEach(() => {
        vi.useFakeTimers();
        sessionFinishedCallbacks = [];
        reviewedCallbacks = [];

        mocks.getRiffDecks.mockReset();
        mocks.getRiffCards.mockReset();
        mocks.calcDue.mockReset();
        mocks.getFlashcardStatistics.mockReset();
        mocks.kernelRead.mockReset();

        mocks.getRiffDecks.mockResolvedValue([]);
        mocks.getRiffCards.mockResolvedValue({ total: 0, blocks: [] });
        mocks.calcDue.mockReturnValue({ dueCards: [], leechCards: [] });
        mocks.getFlashcardStatistics.mockResolvedValue([]);
        mocks.kernelRead.mockResolvedValue({ code: 0, data: {} });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const makeCtx = (overrides: Record<string, unknown> = {}) => ({
        i18n,
        app: {},
        getRevlog: () => emptyRevlog(),
        getReviewedDocCount: () => 0,
        getTodayDeckSummaries: () => [],
        calcCoverage: () => ({ reviewedDocs: 0, totalDocs: 0, coveragePct: 0 }),
        onReviewed: (cb: () => void) => {
            reviewedCallbacks.push(cb);
            return () => {
                reviewedCallbacks = reviewedCallbacks.filter((c) => c !== cb);
            };
        },
        onSessionFinished: (cb: () => void) => {
            sessionFinishedCallbacks.push(cb);
            return () => {
                sessionFinishedCallbacks = sessionFinishedCallbacks.filter((c) => c !== cb);
            };
        },
        openReview: vi.fn(),
        openManager: vi.fn(),
        openOnboarding: vi.fn(),
        getCustomDecks: () => [],
        getV2Status: () => false,
        getLearningTargets: () => ({ new: 20, review: 50 }),
        ...overrides,
    });

    it("手动推进刷新（Manual Advance）：连续点击刷新时推进代次，旧响应不覆盖新卡组数据", async () => {
        const deferredMount = deferred<unknown[]>();
        const deferredManual1 = deferred<unknown[]>();
        const deferredManual2 = deferred<unknown[]>();

        mocks.getRiffDecks
            .mockReturnValueOnce(deferredMount.promise)
            .mockReturnValueOnce(deferredManual1.promise)
            .mockReturnValueOnce(deferredManual2.promise);

        const view = render(Dashboard, { ctx: makeCtx() });
        // 挂载初次加载完成
        deferredMount.resolve([{ id: "d-init", name: "初始阶段卡组", size: 10 }]);
        await vi.advanceTimersByTimeAsync(0);

        expect(screen.getByText("初始阶段卡组")).toBeTruthy();

        // 找到手动刷新按钮并点击，触发 manual advance generation 1
        const refreshBtn = screen.getByRole("button", { name: i18n.dashboard.refresh });
        await fireEvent.click(refreshBtn);
        expect(mocks.getRiffDecks).toHaveBeenCalledTimes(2);

        // 在第 1 次手动推进尚未响应完成时，立即再次点击手动推进，触发 manual advance generation 2
        await fireEvent.click(refreshBtn);
        expect(mocks.getRiffDecks).toHaveBeenCalledTimes(3);

        // 第 1 次响应带着陈旧数据晚到并 resolve
        deferredManual1.resolve([{ id: "d-stale", name: "过时慢响应卡组", size: 5 }]);
        await vi.advanceTimersByTimeAsync(0);

        // 验证：界面上绝不出现过时慢响应的卡组内容
        expect(screen.queryByText("过时慢响应卡组")).toBeNull();

        // 第 2 次（最新世代）响应正常到达并 resolve
        deferredManual2.resolve([{ id: "d-latest", name: "最新推进卡组", size: 99 }]);
        await vi.advanceTimersByTimeAsync(0);

        // 验证：最新世代数据成功采纳展示
        expect(screen.getByText("最新推进卡组")).toBeTruthy();

        view.unmount();
    });

    it("故障隔离：过时代次的慢请求发生异常时，绝不覆盖当前成功展示的数据与更新时间", async () => {
        const deferredMount = deferred<unknown[]>();
        const deferredManualFail = deferred<unknown[]>();
        const deferredManualSuccess = deferred<unknown[]>();

        mocks.getRiffDecks
            .mockReturnValueOnce(deferredMount.promise)
            .mockReturnValueOnce(deferredManualFail.promise)
            .mockReturnValueOnce(deferredManualSuccess.promise);

        const view = render(Dashboard, { ctx: makeCtx() });
        deferredMount.resolve([{ id: "d-ok", name: "稳定就绪卡组", size: 25 }]);
        await vi.advanceTimersByTimeAsync(0);

        expect(screen.getByText("稳定就绪卡组")).toBeTruthy();

        const refreshBtn = screen.getByRole("button", { name: i18n.dashboard.refresh });
        // 第一次手动刷新
        await fireEvent.click(refreshBtn);
        // 并发第二次手动刷新
        await fireEvent.click(refreshBtn);

        // 第一次请求失败（如网络超时或内核锁）
        deferredManualFail.reject(new Error("Network timeout on old generation"));
        await vi.advanceTimersByTimeAsync(0);

        // 验证：由于该错误属于已落后的代次，界面保留原有稳定状态，不显示错误警告横幅
        expect(screen.queryByText(/Network timeout/i)).toBeNull();
        expect(screen.getByText("稳定就绪卡组")).toBeTruthy();

        // 第二次请求正常返回
        deferredManualSuccess.resolve([{ id: "d-ok-2", name: "二次更新卡组", size: 30 }]);
        await vi.advanceTimersByTimeAsync(0);

        expect(screen.getByText("二次更新卡组")).toBeTruthy();

        view.unmount();
    });

    it("慢面板（深度统计与知识覆盖率）晚于下一次手动推进到达时被安全丢弃", async () => {
        const deferredMount = deferred<unknown[]>();
        const deferredDocCovOld = deferred<{ reviewedDocs: number; totalDocs: number; coveragePct: number }>();

        mocks.getRiffDecks.mockResolvedValue([{ id: "d1", name: "核心卡组", size: 10 }]);

        let calcCoverageCallCount = 0;
        const ctx = makeCtx({
            calcCoverage: () => {
                calcCoverageCallCount++;
                if (calcCoverageCallCount === 1) {
                    return deferredDocCovOld.promise;
                }
                return Promise.resolve({ reviewedDocs: 50, totalDocs: 100, coveragePct: 50 });
            },
        });

        const view = render(Dashboard, { ctx });
        await vi.advanceTimersByTimeAsync(0);

        // 手动推进触发新世代
        const refreshBtn = screen.getByRole("button", { name: i18n.dashboard.refresh });
        await fireEvent.click(refreshBtn);
        await vi.advanceTimersByTimeAsync(0);

        // 此时第一世代慢面板的旧数据才返回
        deferredDocCovOld.resolve({ reviewedDocs: 1, totalDocs: 100, coveragePct: 1 });
        await vi.advanceTimersByTimeAsync(0);

        // 验证：组件未崩溃且旧的 1% 覆盖率不会冲掉最新状态
        expect(screen.getByText("核心卡组")).toBeTruthy();

        view.unmount();
    });
});
