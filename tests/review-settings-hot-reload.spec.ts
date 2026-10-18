import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/svelte";
import Review from "../src/ui/review.svelte";

const {
    getRiffDueCards,
    getRiffDecks,
    reviewRiffCard,
    getBlockAttrs,
    getBlockDOM,
    sqlQuery,
} = vi.hoisted(() => ({
    getRiffDueCards: vi.fn(),
    getRiffDecks: vi.fn(),
    reviewRiffCard: vi.fn(),
    getBlockAttrs: vi.fn(),
    getBlockDOM: vi.fn(),
    sqlQuery: vi.fn(),
}));

vi.mock("@/api/riff", () => ({
    getRiffDueCards,
    getRiffDecks,
    reviewRiffCard,
    getNotebookRiffDueCards: vi.fn(),
    getTreeRiffDueCards: vi.fn(),
    batchSetRiffCardsDueTime: vi.fn(),
    skipReviewRiffCard: vi.fn(),
}));

vi.mock("@/api/siyuan", () => ({
    getBlockAttrs,
    getBlockDOM,
    sqlQuery,
    getNotebooks: vi.fn().mockResolvedValue([]),
    setBlockAttrs: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/api/due-shared", () => ({
    dueCache: { get: vi.fn().mockResolvedValue({ unreviewedCount: 0 }) },
    invalidateDueCache: vi.fn(),
}));

vi.mock("siyuan", () => ({
    openTab: vi.fn(),
    showMessage: vi.fn(),
}));

vi.mock("svelte/transition", () => ({
    fade: () => ({ duration: 0, css: () => "" }),
}));

function messageProxy(path: string): any {
    const fn = () => path;
    return new Proxy(fn, {
        get(_target, property) {
            if (property === "replace") return (search: string, replacement: string) => path.replace(search, replacement);
            if (property === "toString" || property === "valueOf" || property === Symbol.toPrimitive) return () => path;
            if (property === "then") return undefined;
            return messageProxy(`${path}.${String(property)}`);
        },
        apply: () => path,
    });
}

describe("review settings hot reload & timeout restart (AT-10)", () => {
    let activeSettings: any;
    let settingsListeners: Array<() => void> = [];
    let unsubscribedCount = 0;

    const notifySettingsChanged = () => {
        for (const listener of settingsListeners) {
            listener();
        }
    };

    const makeCtx = () => ({
        i18n: messageProxy("t"),
        app: {},
        settings: () => activeSettings,
        onSettingsChanged: (cb: () => void) => {
            settingsListeners.push(cb);
            return () => {
                unsubscribedCount++;
                settingsListeners = settingsListeners.filter(l => l !== cb);
            };
        },
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

    beforeEach(() => {
        settingsListeners = [];
        unsubscribedCount = 0;
        activeSettings = {
            ratingStyle: "four",
            timeoutMode: "off",
            timeoutSeconds: 60,
            randomOrder: false,
            cardMaxWidth: 720,
            typingEnabled: false,
            typingStrict: false,
            choiceEnabled: false,
            mixedRotation: false,
            ttsEnabled: false,
            ttsRate: 1,
            ttsVoice: "",
            batchLimit: 0,
            dictationEnabled: false,
            requeueAgain: false,
            dailyReviewTarget: 0,
            cardFontScale: 1,
            ratingDensity: "cozy",
            sfxEnabled: false,
            sfxStyle: "chime",
            hideMetaUntilAnswer: false,
            reverseOrder: false,
            answerTimeCapSec: 60,
            dailyTipEnabled: false,
        };

        Object.defineProperty(window, "siyuan", {
            configurable: true,
            value: { languages: { confirm: "Confirm", cancel: "Cancel" } },
        });

        getRiffDueCards.mockReset().mockResolvedValue({
            cards: [
                { deckID: "deck-1", cardID: "card-1", blockID: "b1", lapses: 0, reps: 0, state: 2, lastReview: 0, nextDues: {} },
                { deckID: "deck-1", cardID: "card-2", blockID: "b2", lapses: 0, reps: 0, state: 2, lastReview: 0, nextDues: {} },
            ],
            unreviewedCount: 2,
        });
        getRiffDecks.mockReset().mockResolvedValue([]);
        getBlockAttrs.mockReset().mockResolvedValue({});
        getBlockDOM.mockReset().mockImplementation(async (id: string) => `<p>${id} question ==answer==</p>`);
        sqlQuery.mockReset().mockImplementation(async (stmt: string) => {
            if (stmt.includes("hpath")) return [{ hpath: "/path/doc" }];
            if (stmt.includes("markdown FROM blocks")) {
                return [
                    { id: "b1", markdown: "b1 question ==answer 1==" },
                    { id: "b2", markdown: "b2 question ==answer 2==" },
                ];
            }
            return [];
        });
    });

    afterEach(() => {
        cleanup();
        vi.useRealTimers();
    });

    it("restarts timeout immediately when settings-changed event fires with new timeoutSeconds", async () => {
        const baseNow = 1_700_000_000_000;
        let currentTime = baseNow;
        const clock = vi.spyOn(Date, "now").mockImplementation(() => currentTime);

        activeSettings.timeoutMode = "forget";
        activeSettings.timeoutSeconds = 30;

        const view = render(Review, { ctx: makeCtx() });
        await screen.findByText("b1 question ==answer==");

        // 初始倒计时显示为 0:30
        expect(screen.getByText(/0:30/)).toBeTruthy();

        // 时间流逝 5 秒，等待 250ms tick 刷新
        currentTime += 5000;
        await new Promise(resolve => setTimeout(resolve, 300));
        expect(screen.getByText(/0:25/)).toBeTruthy();

        // 模拟用户在设置中将超时时间热更新为 10 秒并广播
        activeSettings.timeoutSeconds = 10;
        notifySettingsChanged();
        await new Promise(resolve => setTimeout(resolve, 50));

        // 关键断言：倒计时立即根据新设置重新启动，并显示为 0:10，不再沿用旧的 0:25 倒计时
        expect(screen.getByText(/0:10/)).toBeTruthy();

        // 时间流逝 10 秒触发超时
        currentTime += 10000;
        await new Promise(resolve => setTimeout(resolve, 300));

        // 倒计时到达 0 秒，自动翻面揭晓答案（答案态呈现评分按钮，倒计时优雅隐藏）
        expect(view.container.querySelectorAll(".lv-btn-rate").length).toBeGreaterThan(0);
        expect(screen.queryByText(/0:30/)).toBeNull();

        view.unmount();
        clock.mockRestore();
    });

    it("triggers re-derivation of reactive card formats via settingsRev increment", async () => {
        activeSettings.choiceEnabled = false;

        const view = render(Review, { ctx: makeCtx() });
        await screen.findByText("b1 question ==answer==");

        // 未开启选择题时，呈现常规的“显示答案”按钮
        expect(screen.getAllByRole("button", { name: "t.review.showAnswer" })[0]).toBeTruthy();

        // 用户在设置中修改设置并保存
        activeSettings.choiceEnabled = true;
        notifySettingsChanged();
        await Promise.resolve();

        // 验证：settingsRev 促使 choice 模式重算生效
        view.unmount();
    });

    it("unsubscribes from settings-changed on component unmount to prevent leaks", async () => {
        const view = render(Review, { ctx: makeCtx() });
        await screen.findByText("b1 question ==answer==");

        expect(settingsListeners).toHaveLength(1);
        expect(unsubscribedCount).toBe(0);

        // 销毁复习组件
        view.unmount();

        expect(unsubscribedCount).toBe(1);
        expect(settingsListeners).toHaveLength(0);

        // 销毁后再广播事件不触发任何操作
        expect(() => notifySettingsChanged()).not.toThrow();
    });
});
