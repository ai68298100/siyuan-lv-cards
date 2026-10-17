import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import Review from "../src/ui/review.svelte";

vi.mock("svelte/transition", () => ({ fade: () => ({ duration: 0, css: () => "" }) }));

const { getRiffDueCards, getRiffDecks, batchSetRiffCardsDueTime, reviewRiffCard, skipReviewRiffCard, getNotebooks, getBlockAttrs, getBlockDOM, setBlockAttrs, sqlQuery } = vi.hoisted(() => ({
    getRiffDueCards: vi.fn(),
    getRiffDecks: vi.fn(),
    batchSetRiffCardsDueTime: vi.fn(),
    reviewRiffCard: vi.fn(),
    skipReviewRiffCard: vi.fn(),
    getNotebooks: vi.fn(),
    getBlockAttrs: vi.fn(),
    getBlockDOM: vi.fn(),
    setBlockAttrs: vi.fn().mockResolvedValue(undefined),
    sqlQuery: vi.fn().mockImplementation(async (stmt: string) => {
        if (stmt.includes("hpath")) return [{ hpath: "/notebook/chapter/doc" }];
        if (stmt.includes("markdown FROM blocks")) {
            return [
                { id: "block-a", markdown: "block-a question ==block-a answer==" },
                { id: "block-b", markdown: "block-b question ==block-b answer==" },
            ];
        }
        return [];
    }),
}));

vi.mock("@/api/riff", () => ({ getRiffDueCards, getRiffDecks, batchSetRiffCardsDueTime, reviewRiffCard, skipReviewRiffCard }));
vi.mock("@/api/siyuan", () => ({ getNotebooks, getBlockAttrs, getBlockDOM, setBlockAttrs, sqlQuery }));
vi.mock("@/api/due-shared", () => ({ dueCache: { get: vi.fn().mockResolvedValue({ unreviewedCount: 0 }) }, invalidateDueCache: vi.fn() }));
vi.mock("siyuan", () => ({ openTab: vi.fn(), showMessage: vi.fn() }));

const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
};

const cardA = { deckID: "deck-a", cardID: "card-a", blockID: "block-a", lapses: 0, reps: 0, state: 2, lastReview: 0, nextDues: {} };
const cardB = { deckID: "deck-a", cardID: "card-b", blockID: "block-b", lapses: 0, reps: 0, state: 2, lastReview: 0, nextDues: {} };

function message(path: string): any {
    const fn = () => path;
    return new Proxy(fn, {
        get(_target, property) {
            if (property === "replace") return (search: string, replacement: string) => path.replace(search, replacement);
            if (property === "toString" || property === "valueOf" || property === Symbol.toPrimitive) return () => path;
            if (property === "then") return undefined;
            return message(`${path}.${String(property)}`);
        },
        apply: () => path,
    });
}

const settings = (choiceEnabled = false, ttsEnabled = false, sfxEnabled = false) => ({
    ratingStyle: "four" as const,
    timeoutMode: "off" as const,
    timeoutSeconds: 60,
    randomOrder: false,
    cardMaxWidth: 720,
    typingEnabled: false,
    typingStrict: false,
    choiceEnabled,
    mixedRotation: false,
    ttsEnabled,
    ttsRate: 1,
    ttsVoice: "",
    batchLimit: 0,
    dictationEnabled: false,
    requeueAgain: false,
    dailyReviewTarget: 0,
    cardFontScale: 1,
    ratingDensity: "cozy" as const,
    sfxEnabled,
    sfxStyle: "chime" as const,
    hideMetaUntilAnswer: false,
    reverseOrder: false,
    answerTimeCapSec: 60,
    dailyTipEnabled: false,
});

const ctx = (choiceEnabled = false, ttsEnabled = false, sfxEnabled = false) => ({
    i18n: message("t"),
    app: {},
    settings: () => settings(choiceEnabled, ttsEnabled, sfxEnabled),
    appendRevlog: vi.fn(),
    getRevlog: () => ({ version: 1, entries: [], days: {} }),
    isSuspendedToday: () => false,
    suspendToday: vi.fn(),
    openDashboard: vi.fn(),
    onScopePersist: vi.fn(),
    getSessionState: () => null,
    saveSessionState: vi.fn(),
    clearSessionState: vi.fn(),
    emitSessionFinished: vi.fn(),
    getContextBlocks: async () => [],
});

function mountReview(choiceEnabled = false, ttsEnabled = false, sfxEnabled = false) {
    Object.defineProperty(window, "siyuan", {
        configurable: true,
        value: { languages: { confirm: "Confirm", cancel: "Cancel" } },
    });
    return render(Review, { ctx: ctx(choiceEnabled, ttsEnabled, sfxEnabled) });
}

describe("review async action guards", () => {
    beforeEach(() => {
        Object.defineProperty(window, "siyuan", {
            configurable: true,
            value: { languages: { confirm: "Confirm", cancel: "Cancel" } },
        });
        getRiffDueCards.mockReset().mockResolvedValue({ cards: [cardA, cardB], unreviewedCount: 2 });
        getRiffDecks.mockReset().mockResolvedValue([]);
        batchSetRiffCardsDueTime.mockReset().mockResolvedValue(undefined);
        reviewRiffCard.mockReset().mockResolvedValue(undefined);
        skipReviewRiffCard.mockReset().mockResolvedValue(undefined);
        getNotebooks.mockReset().mockResolvedValue([]);
        getBlockAttrs.mockReset().mockResolvedValue({});
        getBlockDOM.mockReset().mockImplementation(async (id: string) => `<p>${id} body</p>`);
        sqlQuery.mockReset().mockImplementation(async (stmt: string) => {
            if (stmt.includes("hpath")) return [{ hpath: "/notebook/chapter/doc" }];
            if (stmt.includes("markdown FROM blocks")) {
                return [
                    { id: "block-a", markdown: "block-a question ==block-a answer==" },
                    { id: "block-b", markdown: "block-b question ==block-b answer==" },
                ];
            }
            return [];
        });
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    it("discards a choice-generation response after the current card changes", async () => {
        const staleAnswer = deferred<string>();
        getBlockDOM.mockImplementation((id: string) => {
            if (id === "block-a" && getBlockDOM.mock.calls.filter(([calledID]) => calledID === "block-a").length === 2) {
                return staleAnswer.promise;
            }
            return Promise.resolve(`<p>${id} body</p>`);
        });
        mountReview(true);
        await screen.findByText("block-a body");
        await waitFor(() => expect(getBlockDOM).toHaveBeenCalledTimes(2));
        await fireEvent.click(screen.getByRole("button", { name: "t.review.skip" }));
        await screen.findByText("block-b body");

        staleAnswer.resolve("<p>stale answer from A</p>");
        await Promise.resolve();
        await Promise.resolve();

        expect(screen.getByText("block-b body")).toBeTruthy();
        expect(screen.queryByText(/stale answer from A/)).toBeNull();
        expect(screen.queryByRole("button", { name: /A\. stale answer from A/ })).toBeNull();
    });

    it("locks rescheduling while the first request is pending", async () => {
        const pending = deferred<void>();
        batchSetRiffCardsDueTime.mockReturnValueOnce(pending.promise);
        mountReview();
        await screen.findByText("block-a body");
        await fireEvent.keyDown(window, { key: "f" });
        const confirm = await screen.findByRole("button", { name: "Confirm" });

        await fireEvent.click(confirm);
        await waitFor(() => expect(batchSetRiffCardsDueTime).toHaveBeenCalledTimes(1));
        expect(confirm.hasAttribute("disabled")).toBe(true);
        await fireEvent.click(confirm);
        expect(batchSetRiffCardsDueTime).toHaveBeenCalledTimes(1);

        pending.resolve(undefined);
        await screen.findByText("block-b body");
    });

    it("reuses the exact due timestamp when retrying a failed reschedule", async () => {
        const fixedNow = new Date("2026-10-12T01:02:03.000Z").getTime();
        vi.spyOn(Date, "now").mockReturnValue(fixedNow);
        batchSetRiffCardsDueTime.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
        mountReview();
        await screen.findByText("block-a body");
        await fireEvent.keyDown(window, { key: "f" });
        const confirm = await screen.findByRole("button", { name: "Confirm" });

        await fireEvent.click(confirm);
        await waitFor(() => expect(batchSetRiffCardsDueTime).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(screen.getAllByText("offline").length).toBeGreaterThan(0));
        const retryButton = screen.getByRole("button", { name: /(Confirm|t\.review\.rescheduleRetrySame)/ });
        await fireEvent.click(retryButton);
        await waitFor(() => expect(batchSetRiffCardsDueTime).toHaveBeenCalledTimes(2));

        expect(batchSetRiffCardsDueTime.mock.calls[1][0]).toEqual(batchSetRiffCardsDueTime.mock.calls[0][0]);
        await screen.findByText("block-b body");
    });

    it("formats reschedule preview with the active document language", async () => {
        const language = document.documentElement.lang;
        document.documentElement.lang = "en-US";
        vi.spyOn(Date, "now").mockReturnValue(new Date("2026-10-12T01:02:03.000Z").getTime());
        try {
            const view = mountReview();
            await screen.findByText("block-a body");
            await fireEvent.keyDown(window, { key: "f" });
            const expected = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(Date.now() + 86400000));
            expect(view.container.querySelector(".lv-reschedule strong")?.textContent).toBe(expected);
        } finally {
            document.documentElement.lang = language;
        }
    });

    it("cancels active speech and closes its audio context when the review is destroyed", async () => {
        const cancel = vi.fn();
        const speak = vi.fn();
        Object.defineProperty(window, "speechSynthesis", {
            configurable: true,
            value: { cancel, speak, getVoices: () => [] },
        });
        class MockUtterance {
            lang = "";
            rate = 1;
            voice: unknown;
            onend: (() => void) | null = null;
            onerror: (() => void) | null = null;
            constructor(readonly text: string) {}
        }
        vi.stubGlobal("SpeechSynthesisUtterance", MockUtterance);
        const oscillator = {
            connect: vi.fn(), type: "", frequency: { setValueAtTime: vi.fn() },
            start: vi.fn(), stop: vi.fn(),
        };
        const gain = { connect: vi.fn(), gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() } };
        const close = vi.fn().mockResolvedValue(undefined);
        class MockAudioContext {
            currentTime = 0;
            destination = {};
            createOscillator = () => oscillator;
            createGain = () => gain;
            close = close;
        }
        vi.stubGlobal("AudioContext", MockAudioContext);

        const view = mountReview(false, true, true);
        await screen.findByText("block-a body");
        await fireEvent.click(screen.getByRole("button", { name: "t.review.showAnswer" }));
        await fireEvent.click(screen.getByRole("button", { name: "t.review.speak" }));
        expect(speak).toHaveBeenCalledOnce();
        await fireEvent.click(view.container.querySelector(".lv-btn-rate")!);
        await waitFor(() => expect(reviewRiffCard).toHaveBeenCalledOnce());

        view.unmount();

        expect(cancel).toHaveBeenCalled();
        expect(close).toHaveBeenCalledOnce();
    });

    it("pauses review and preserves session state when pause confirm is clicked", async () => {
        const testCtx = ctx();
        testCtx.tagErrorReason = vi.fn();
        Object.defineProperty(window, "siyuan", {
            configurable: true,
            value: { languages: { confirm: "Confirm", cancel: "Cancel" } },
        });
        const view = render(Review, { ctx: testCtx });
        await screen.findByText("block-a body");

        // 打开暂停弹窗
        const pauseBtn = screen.getByRole("button", { name: "t.review.pauseTitle" });
        await fireEvent.click(pauseBtn);
        expect(screen.getByText("t.review.pauseDesc")).toBeTruthy();

        // 确认暂停并返回今日
        const confirmBtn = screen.getByRole("button", { name: "t.review.pauseConfirm" });
        await fireEvent.click(confirmBtn);

        expect(testCtx.saveSessionState).toHaveBeenCalledOnce();
        expect(testCtx.openDashboard).toHaveBeenCalledWith("overview");
        view.unmount();
    });

    it("marks issue on current card without interrupting review", async () => {
        const testCtx = ctx();
        testCtx.tagErrorReason = vi.fn();
        Object.defineProperty(window, "siyuan", {
            configurable: true,
            value: { languages: { confirm: "Confirm", cancel: "Cancel" } },
        });
        const view = render(Review, { ctx: testCtx });
        await screen.findByText("block-a body");

        // 点击标记疑问
        const markBtn = screen.getByRole("button", { name: "t.review.tbMarkIssue" });
        await fireEvent.click(markBtn);

        expect(testCtx.tagErrorReason).toHaveBeenCalledWith("card-a", "question-unclear");
        expect(screen.getAllByText("🚩 t.review.issueChip")).toHaveLength(2);
        expect(markBtn.hasAttribute("disabled")).toBe(true);
        await fireEvent.click(markBtn);
        expect(testCtx.tagErrorReason).toHaveBeenCalledOnce();
        view.unmount();
    });

    it.each([false, true])("keeps a paused review inert until the user returns to its panel (navigation fails: %s)", async (navigationFails) => {
        const testCtx = ctx();
        if (navigationFails) testCtx.openDashboard.mockImplementation(() => { throw new Error("tab unavailable"); });
        const view = render(Review, { ctx: testCtx });
        await screen.findByText("block-a body");
        await fireEvent.click(screen.getByRole("button", { name: "t.review.pauseTitle" }));
        await fireEvent.click(screen.getByRole("button", { name: "t.review.pauseConfirm" }));
        await fireEvent.keyDown(window, { key: "x" });
        await fireEvent.keyDown(window, { key: " ", code: "Space" });
        await fireEvent.keyDown(window, { key: "Enter", code: "Enter" });
        expect(skipReviewRiffCard).not.toHaveBeenCalled();
        expect(reviewRiffCard).not.toHaveBeenCalled();
        expect(view.container.querySelector(".lv-btn-rate")).toBeNull();
        expect(screen.getByRole("button", { name: "t.review.pauseContinue" })).toBeTruthy();

        await fireEvent.pointerDown(view.container.querySelector(".lv-review")!);
        await fireEvent.keyDown(window, { key: " ", code: "Space" });
        expect(view.container.querySelector(".lv-btn-rate")).toBeTruthy();
        expect(reviewRiffCard).not.toHaveBeenCalled();
    });

    it("preserves native toolbar activation keys without revealing or rating a card", async () => {
        const view = mountReview();
        await screen.findByText("block-a body");
        const pause = screen.getByRole("button", { name: "t.review.pauseTitle" });
        const event = new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true });
        await fireEvent(pause, event);
        expect(event.defaultPrevented).toBe(false);
        expect(view.container.querySelector(".lv-btn-rate")).toBeNull();
        expect(reviewRiffCard).not.toHaveBeenCalled();
    });

    it("discards an old context response after changing the current card", async () => {
        const context = deferred<{ id: string; html: string }[]>();
        const testCtx = ctx();
        testCtx.getContextBlocks = () => context.promise;
        render(Review, { ctx: testCtx });
        await screen.findByText("block-a body");
        await fireEvent.click(screen.getByRole("button", { name: "t.review.tbMoreDesc" }));
        await fireEvent.click(screen.getByRole("button", { name: /t.review.tbCtx/ }));
        await fireEvent.click(screen.getByRole("button", { name: "t.review.skip" }));
        await screen.findByText("block-b body");
        context.resolve([{ id: "context-a", html: "<p>old context A</p>" }]);
        await Promise.resolve();
        await Promise.resolve();
        expect(screen.queryByText("old context A")).toBeNull();
    });

    it("rebuilds choice answers after refreshing an edited source block", async () => {
        let answer = "old answer";
        getBlockDOM.mockImplementation(async (id: string) => `<p>Question ${id} <mark>${id === "block-a" ? answer : "distractor"}</mark></p>`);
        mountReview(true);
        await screen.findByRole("button", { name: /^[A-Z]\. old answer$/ });
        answer = "updated answer";
        await fireEvent.click(screen.getByRole("button", { name: "t.review.tbMoreDesc" }));
        await fireEvent.click(screen.getByRole("button", { name: /t.review.tbRefresh/ }));
        await screen.findByRole("button", { name: /^[A-Z]\. updated answer$/ });
        expect(screen.queryByRole("button", { name: /^[A-Z]\. old answer$/ })).toBeNull();
    });

    it.each(["t.review.pauseTitle", "t.review.sessionOptionsTitle"])("blocks review shortcuts while %s is open and closes it with Escape", async (opener) => {
        mountReview();
        await screen.findByText("block-a body");
        await fireEvent.click(screen.getByRole("button", { name: opener }));

        await fireEvent.keyDown(window, { key: "x" });
        await fireEvent.keyDown(window, { key: " ", code: "Space" });
        await fireEvent.keyDown(window, { key: "Enter", code: "Enter" });

        expect(skipReviewRiffCard).not.toHaveBeenCalled();
        expect(reviewRiffCard).not.toHaveBeenCalled();
        expect(screen.getByText("block-a body")).toBeTruthy();
        await fireEvent.keyDown(window, { key: "Escape" });
        expect(screen.queryByText(opener === "t.review.pauseTitle" ? "t.review.pauseDesc" : "t.review.sessionOptionsHint")).toBeNull();
    });

    it("restores the original answer and skip exclusions when undoing a skip", async () => {
        const testCtx = ctx();
        testCtx.settings = () => ({ ...settings(), typingEnabled: true });
        render(Review, { ctx: testCtx });
        await screen.findByText("block-a body");
        await fireEvent.click(screen.getByRole("button", { name: "t.review.skip" }));
        await screen.findByText("block-b body");
        await waitFor(() => expect(screen.getByRole("button", { name: "t.review.undoTitle" }).hasAttribute("disabled")).toBe(false));
        await fireEvent.click(screen.getByRole("button", { name: "t.review.undoTitle" }));
        await screen.findByText("block-a body");

        expect(testCtx.saveSessionState.mock.lastCall?.[0].skippedIDs).toEqual([]);
        const typingInput = await screen.findByPlaceholderText("t.review.typingPlaceholder");
        await fireEvent.input(typingInput, { target: { value: "block-a body" } });
        await fireEvent.keyDown(screen.getByPlaceholderText("t.review.typingPlaceholder"), { key: "Enter" });
        expect(document.querySelector(".lv-typing-diff")).toBeTruthy();
        expect(document.querySelector(".lv-diff-bad")).toBeNull();
    });

    it("does not reveal the current answer when dismissing an overlay scrim", async () => {
        const view = mountReview();
        await screen.findByText("block-a body");
        await fireEvent.click(screen.getByRole("button", { name: "t.review.pauseTitle" }));
        await fireEvent.click(view.container.querySelector(".lv-modal-backdrop")!);
        expect(view.container.querySelector(".lv-btn-rate")).toBeNull();
        await fireEvent.click(screen.getByRole("button", { name: "t.review.tbMoreDesc" }));
        await fireEvent.click(view.container.querySelector(".lv-toolbar-more-scrim")!);
        expect(view.container.querySelector(".lv-btn-rate")).toBeNull();
    });

    it("stops the previous card countdown before loading the next face", async () => {
        const nextFace = deferred<string>();
        const now = Date.now();
        const clock = vi.spyOn(Date, "now").mockReturnValue(now);
        const testCtx = ctx();
        testCtx.settings = () => ({ ...settings(), timeoutMode: "reveal" as const, timeoutSeconds: 1 });
        getBlockDOM.mockImplementation((id: string) => id === "block-b" ? nextFace.promise : Promise.resolve(`<p>${id} body</p>`));
        const view = render(Review, { ctx: testCtx });
        await screen.findByText("block-a body");
        await fireEvent.click(screen.getByRole("button", { name: "t.review.skip" }));
        await waitFor(() => expect(getBlockDOM).toHaveBeenCalledWith("block-b"));
        clock.mockReturnValue(now + 5000);
        await new Promise(resolve => setTimeout(resolve, 300));
        expect(view.container.querySelector(".lv-btn-rate")).toBeNull();
        nextFace.resolve("<p>block-b body</p>");
        await screen.findByText("block-b body");
    });

    it("opens and closes the streamlined more actions popover via button, scrim and escape key", async () => {
        const testCtx = ctx();
        Object.defineProperty(window, "siyuan", {
            configurable: true,
            value: { languages: { confirm: "Confirm", cancel: "Cancel" } },
        });
        const view = render(Review, { ctx: testCtx });
        await screen.findByText("block-a body");

        // 默认核心高频按钮处于常驻显示状态
        expect(screen.getByRole("button", { name: "t.review.pauseTitle" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "t.review.tbMarkIssue" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "t.review.undoTitle" })).toBeTruthy();

        // 初始状态下二级操作气泡未展开
        const moreBtn = screen.getByRole("button", { name: /(t\.review\.tbMore|t\.review\.tbMoreDesc)/ });
        expect(moreBtn.getAttribute("aria-expanded")).toBe("false");
        expect(view.container.querySelector(".lv-toolbar-more-menu")).toBeNull();

        // 点击展开气泡
        await fireEvent.click(moreBtn);
        expect(moreBtn.getAttribute("aria-expanded")).toBe("true");
        const menu = view.container.querySelector(".lv-toolbar-more-menu");
        expect(menu).toBeTruthy();
        expect(screen.getByText("t.review.tbCtx")).toBeTruthy();
        expect(screen.getByText("t.review.tbHelp")).toBeTruthy();

        // 按 Escape 键优雅关闭气泡
        await fireEvent.keyDown(window, { key: "Escape" });
        expect(view.container.querySelector(".lv-toolbar-more-menu")).toBeNull();

        // 再次打开并通过点击背景 scrim 关闭
        await fireEvent.click(moreBtn);
        expect(view.container.querySelector(".lv-toolbar-more-menu")).toBeTruthy();
        const scrim = view.container.querySelector(".lv-toolbar-more-scrim")!;
        await fireEvent.click(scrim);
        expect(view.container.querySelector(".lv-toolbar-more-menu")).toBeNull();

        view.unmount();
    });

    it("renders card source breadcrumb and allows clicking to toggle context", async () => {
        const testCtx = ctx();
        const view = render(Review, { ctx: testCtx });
        await screen.findByText("block-a body");

        // 卡面顶部渲染来源面包屑按钮
        const breadcrumb = view.container.querySelector(".lv-card-source-breadcrumb");
        if (breadcrumb) {
            await fireEvent.click(breadcrumb);
            expect(view.container.querySelector(".lv-ctxpanel")).toBeTruthy();
        }
        view.unmount();
    });

    it("retires a card from deck directly within review UI without modifying document content", async () => {
        const testCtx = ctx();
        testCtx.removeFromDeck = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(window, "siyuan", {
            configurable: true,
            value: { languages: { confirm: "Confirm", cancel: "Cancel" } },
        });
        const view = render(Review, { ctx: testCtx });
        await screen.findByText("block-a body");

        // 打开更多菜单
        const moreBtn = screen.getByRole("button", { name: /(t\.review\.tbMore|t\.review\.tbMoreDesc)/ });
        await fireEvent.click(moreBtn);

        // 点击移出卡组
        const retireItem = screen.getByRole("button", { name: /t\.review\.retireCard/ });
        await fireEvent.click(retireItem);

        // 确认移出
        const confirmBtn = screen.getByRole("button", { name: /t\.review\.retireCardConfirm/ });
        await fireEvent.click(confirmBtn);

        expect(testCtx.removeFromDeck).toHaveBeenCalledWith("block-a");
        await screen.findByText("block-b body");
        view.unmount();
    });

    it("saves a mnemonic note (memo to future self) via SiYuan block memo and presents it in future review", async () => {
        const testCtx = ctx();
        Object.defineProperty(window, "siyuan", {
            configurable: true,
            value: { languages: { confirm: "Confirm", cancel: "Cancel" } },
        });
        const view = render(Review, { ctx: testCtx });
        await screen.findByText("block-a body");

        // 打开更多菜单并点击助记便签
        const moreBtn = screen.getByRole("button", { name: /(t\.review\.tbMore|t\.review\.tbMoreDesc)/ });
        await fireEvent.click(moreBtn);
        const memoBtn = screen.getByRole("button", { name: /t\.review\.tbMemo/ });
        await fireEvent.click(memoBtn);

        // 输入助记心得并保存
        const textarea = screen.getByRole("textbox");
        await fireEvent.input(textarea, { target: { value: "注意区分TCP与UDP报文格式" } });
        const saveBtn = screen.getByRole("button", { name: /t\.review\.memoSave/ });
        await fireEvent.click(saveBtn);

        expect(setBlockAttrs).toHaveBeenCalledWith("block-a", { memo: "注意区分TCP与UDP报文格式" });
        view.unmount();
    });
});
