import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import ChallengeMode from "../src/ui/challenge-mode.svelte";

const { dueGet, getBlockDOM } = vi.hoisted(() => ({
    dueGet: vi.fn(),
    getBlockDOM: vi.fn(),
}));

vi.mock("../src/api/due-shared", () => ({ dueCache: { get: dueGet } }));
vi.mock("../src/api/siyuan", () => ({ getBlockDOM }));

const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(r => { resolve = r; });
    return { promise, resolve };
};

describe("challenge loading lifecycle", () => {
    beforeEach(() => {
        dueGet.mockReset();
        getBlockDOM.mockReset();
        Object.defineProperty(window, "siyuan", {
            configurable: true,
            value: { languages: { cancel: "Cancel" } },
        });
    });

    afterEach(cleanup);

    const renderChallenge = () => render(ChallengeMode, {
        i18n: {
            challenge: {
                title: "Challenge", desc: "For ${n} minutes", start: "Start", loading: "Loading",
                empty: "No cards", loadError: "Load failed", readFailed: "Read failed",
                readPartial: "Skipped ${n}", retry: "Retry", stop: "Stop", unknown: "Unknown",
                known: "Known", doneTitle: "Done", skipped: "skipped", closeBtn: "Close",
            },
            review: { doneSkip: "跳过" },
        },
        onExit: vi.fn(),
    });

    it("does not request cards again after closing during the due query", async () => {
        const due = deferred<{ cards: { blockID: string }[] }>();
        dueGet.mockReturnValueOnce(due.promise);
        renderChallenge();

        await fireEvent.click(screen.getByRole("button", { name: /Start/ }));
        await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        cleanup();
        due.resolve({ cards: [{ blockID: "a" }] });
        await Promise.resolve();
        await Promise.resolve();

        expect(getBlockDOM).not.toHaveBeenCalled();
    });

    it("does not load more faces or start a timer after closing during face loading", async () => {
        const firstFace = deferred<string>();
        dueGet.mockResolvedValueOnce({ cards: [{ blockID: "a" }, { blockID: "b" }] });
        getBlockDOM.mockReturnValueOnce(firstFace.promise);
        renderChallenge();

        await fireEvent.click(screen.getByRole("button", { name: /Start/ }));
        await waitFor(() => expect(getBlockDOM).toHaveBeenCalledOnce());
        const interval = vi.spyOn(globalThis, "setInterval");
        await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        cleanup();
        firstFace.resolve("<p>Question</p>");
        await Promise.resolve();
        await Promise.resolve();

        expect(getBlockDOM).toHaveBeenCalledOnce();
        expect(interval).not.toHaveBeenCalled();
        interval.mockRestore();
    });

    it("supports keyboard controls: 1 for unknown, 2 for known, and Escape to finish", async () => {
        dueGet.mockResolvedValueOnce({ cards: [{ blockID: "a" }, { blockID: "b" }] });
        getBlockDOM.mockImplementation(async (id: string) => `<p>Question ${id}</p>`);
        const onExit = vi.fn();
        Object.defineProperty(window, "confirm", { configurable: true, value: vi.fn(() => true) });

        render(ChallengeMode, {
            i18n: {
                challenge: {
                    title: "Challenge", desc: "For ${n} minutes", start: "Start", loading: "Loading",
                    empty: "No cards", loadError: "Load failed", readFailed: "Read failed",
                    readPartial: "Skipped ${n}", retry: "Retry", stop: "Stop", unknown: "Unknown",
                    known: "Known", doneTitle: "Done", skipped: "skipped", closeBtn: "Close",
                },
                review: { doneSkip: "跳过" },
            },
            onExit,
        });

        // 快捷键空格开始
        await fireEvent.keyDown(window, { key: " " });
        await screen.findByText("Question a");

        // 按 1 标记为不认识
        await fireEvent.keyDown(window, { key: "1" });
        await screen.findByText("Question b");
        expect(screen.getByText("✓ 0 · ✗ 1")).toBeTruthy();

        // 按 2 标记为认识
        await fireEvent.keyDown(window, { key: "2" });
        await screen.findByText("Done");
        expect(screen.getByText(/✓ 1 · ✗ 1/)).toBeTruthy();

        // 结果态按 Escape 退出
        await fireEvent.keyDown(window, { key: "Escape" });
        expect(onExit).toHaveBeenCalledOnce();
    });

    it("starts timer only after all cards are loaded, preserving user answering time (AR-10)", async () => {
        vi.useFakeTimers();
        const firstDom = deferred<string>();
        dueGet.mockResolvedValueOnce({ cards: [{ blockID: "c1" }] });
        getBlockDOM.mockReturnValueOnce(firstDom.promise);

        const view = renderChallenge();
        await fireEvent.click(screen.getByRole("button", { name: /Start/ }));
        await Promise.resolve();

        // 模拟网络较慢，加载材料耗时 5 秒
        await vi.advanceTimersByTimeAsync(5000);

        // 此时材料尚未 resolve，仍处于 loading 阶段，界面上尚未呈现卡片，计时器不启动
        expect(screen.queryByText(/3:00/)).toBeNull();

        // 材料加载完成
        firstDom.resolve("<p>Question 1</p>");
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(0);

        // 材料加载完毕，进入 running 阶段，初始倒计时严格为 180 秒（3:00）
        expect(screen.getByText(/3:00/)).toBeTruthy();

        // 推进 5 秒作答时间
        await vi.advanceTimersByTimeAsync(5000);
        expect(screen.getByText(/2:55/)).toBeTruthy();

        view.unmount();
        vi.useRealTimers();
    });

    it("calibrates remaining time by monotonic deadline across background throttle and settles only once at 0s (AR-10)", async () => {
        vi.useFakeTimers();
        dueGet.mockResolvedValueOnce({ cards: [{ blockID: "c1" }] });
        getBlockDOM.mockResolvedValueOnce("<p>Question 1</p>");

        const view = renderChallenge();
        await fireEvent.click(screen.getByRole("button", { name: /Start/ }));
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(0);

        expect(screen.getByText(/3:00/)).toBeTruthy();

        // 模拟浏览器切入后台或系统休眠 45 秒后被唤醒（interval 被节流，但壁钟前进 45 秒）
        await vi.advanceTimersByTimeAsync(45000);

        // 剩余时间根据 monotonic deadline = Date.now() + remaining * 1000 准确校准为 135 秒（2:15）
        expect(screen.getByText(/2:15/)).toBeTruthy();

        // 推进至 180 秒耗尽（剩余 135 秒）
        await vi.advanceTimersByTimeAsync(135000);

        // 到达 0 秒，自动进入完成态
        expect(screen.getByText("Done")).toBeTruthy();

        // 再次推进时间，验证 0 秒单次结算完成，不会发生二次结算或异常
        await vi.advanceTimersByTimeAsync(10000);
        expect(screen.getByText("Done")).toBeTruthy();

        view.unmount();
        vi.useRealTimers();
    });

    it("clears interval timer immediately when user stops challenge midway (AR-10)", async () => {
        vi.useFakeTimers();
        dueGet.mockResolvedValueOnce({ cards: [{ blockID: "c1" }] });
        getBlockDOM.mockResolvedValueOnce("<p>Question 1</p>");
        Object.defineProperty(window, "confirm", { configurable: true, value: vi.fn(() => true) });

        const view = renderChallenge();
        await fireEvent.click(screen.getByRole("button", { name: /Start/ }));
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(0);

        // 作答 10 秒后点击停止
        await vi.advanceTimersByTimeAsync(10000);
        expect(screen.getByText(/2:50/)).toBeTruthy();

        const stopBtn = screen.getByRole("button", { name: /Stop/ });
        await fireEvent.click(stopBtn);

        // 确认停止后进入完成态，计时器立即清除
        expect(screen.getByText("Done")).toBeTruthy();

        // 推进时间，倒计时不再变化或抛错
        await vi.advanceTimersByTimeAsync(5000);
        expect(screen.getByText("Done")).toBeTruthy();

        view.unmount();
        vi.useRealTimers();
    });
});
