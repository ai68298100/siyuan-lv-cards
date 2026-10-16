import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import i18n from "../public/i18n/zh-CN.json";
import MaintenancePage from "../src/ui/maintenance-page.svelte";

const cards = [
    { blockID: "card-a", md: "待检查的卡片 ==A==", state: "needsRevision" },
    { blockID: "card-b", md: "待检查的卡片 ==B==", state: "needsRevision" },
];

function renderPage(overrides: Record<string, unknown> = {}) {
    return render(MaintenancePage, {
        i18n,
        maintenance: {
            scan: vi.fn(async () => ({ items: cards })),
            suspendToday: vi.fn(async () => undefined),
            unsuspendToday: vi.fn(async () => undefined),
            isSuspendedToday: () => false,
            openSource: vi.fn(async () => undefined),
            openCard: vi.fn(),
            ...overrides,
        },
    });
}

async function expandDetails(details: HTMLDetailsElement) {
    details.open = true;
    await fireEvent(details, new Event("toggle"));
}

async function expandSourceHistory(container: HTMLElement) {
    await waitFor(() => expect(container.querySelector(".lv-maint-health-history")).toBeTruthy());
    const history = container.querySelector<HTMLDetailsElement>(".lv-maint-health-history")!;
    await expandDetails(history);
    await waitFor(() => expect(history.querySelector(".lv-maint-health-source")).toBeTruthy());
    const source = history.querySelector<HTMLDetailsElement>(".lv-maint-health-source")!;
    await expandDetails(source);
    return { history, source };
}

describe("maintenance pause persistence feedback", () => {
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
        window.localStorage.removeItem("lv-cards.maintenance.approximate-duplicates.v1");
    });

    it("shows the partial scan reason while retaining scanned results and a scan retry", async () => {
        const scan = vi.fn(async () => ({ items: cards, error: "权限不足" }));
        renderPage({ scan });

        expect((await screen.findByRole("alert")).textContent).toContain("权限不足");
        expect(screen.getByText("待检查的卡片 A")).toBeTruthy();
        expect(screen.getByText("待检查的卡片 B")).toBeTruthy();
        await fireEvent.click(screen.getByRole("button", { name: i18n.dashboard.refresh }));
        await waitFor(() => expect(scan).toHaveBeenCalledTimes(2));
    });

    it("shows a retry when opening a source document fails", async () => {
        const openSource = vi.fn()
            .mockRejectedValueOnce(new Error("文档已移除"))
            .mockResolvedValueOnce(undefined);
        renderPage({ openSource });

        const openButtons = await screen.findAllByRole("button", { name: "打开来源" });
        await fireEvent.click(openButtons[0]);
        const alert = await screen.findByRole("alert");
        expect(alert.textContent).toContain("打开来源失败");
        expect(alert.textContent).toContain("文档已移除");
        await fireEvent.click(screen.getByRole("button", { name: "重试" }));
        await waitFor(() => expect(openSource).toHaveBeenCalledTimes(2));
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("opens the existing manager detail editor for a card", async () => {
        const openCard = vi.fn();
        renderPage({ openCard });

        await fireEvent.click((await screen.findAllByRole("button", { name: "查看并编辑" }))[0]);
        expect(openCard).toHaveBeenCalledWith("card-a");
    });

    it("explains an answer-only legacy card and removes its debt after editing and rescanning", async () => {
        let legacyMarkdown = "==骨骼肌==";
        const scan = vi.fn(async () => ({ items: [
            { blockID: "answer-only", md: legacyMarkdown },
            { blockID: "valid-question", md: "人体运动的主要动力来自哪里？ ==肌肉收缩==" },
            { blockID: "valid-occlusion", md: "![结构示意图](assets/diagram.png)", occlusion: true },
        ] }));
        const openCard = vi.fn(() => { legacyMarkdown = "人体运动的主要执行器官是什么？ ==骨骼肌=="; });
        const page = renderPage({ scan, openCard });

        const reason = await screen.findByText(i18n.maintenance.qualityReasons["missing-question"]);
        const invalidGroup = reason.closest<HTMLElement>(".lv-maint-group")!;
        expect(within(invalidGroup).getByText(`${i18n.maintenance.kinds.invalidCard} 1`)).toBeTruthy();
        expect(page.container.querySelectorAll(".lv-maint-row")).toHaveLength(1);
        const row = reason.closest<HTMLElement>(".lv-maint-row")!;
        expect(within(row).getByText("骨骼肌")).toBeTruthy();
        expect(screen.queryByText("missing-question")).toBeNull();

        await fireEvent.click(within(row).getByRole("button", { name: i18n.maintenance.editCard }));
        expect(openCard).toHaveBeenCalledWith("answer-only");
        expect(scan).toHaveBeenCalledTimes(1);
        expect(screen.getByText(i18n.maintenance.qualityReasons["missing-question"])).toBeTruthy();

        await fireEvent.click(screen.getByRole("button", { name: i18n.maintenance.scan, exact: true }));
        expect(await screen.findByText(i18n.maintenance.none)).toBeTruthy();
        expect(scan).toHaveBeenCalledTimes(2);
        expect(page.container.querySelector(".lv-maint-row")).toBeNull();
        expect(screen.queryByText(i18n.maintenance.qualityReasons["missing-question"])).toBeNull();
    });

    it("keeps a valid image occlusion card in its review group without an invalid-card debt", async () => {
        const page = renderPage({
            scan: vi.fn(async () => ({ items: [{
                blockID: "occlusion-review", md: "![结构示意图](assets/diagram.png)",
                occlusion: true, state: "needsRevision",
            }] })),
        });

        expect(await screen.findByText(`${i18n.maintenance.kinds.needsReview} 1`)).toBeTruthy();
        expect(page.container.querySelectorAll(".lv-maint-row")).toHaveLength(1);
        expect(screen.queryByText(new RegExp(i18n.maintenance.kinds.invalidCard))).toBeNull();
        expect(screen.queryByText(i18n.maintenance.qualityReasons["missing-answer"])).toBeNull();
        expect(screen.queryByText(i18n.maintenance.qualityReasons["missing-question"])).toBeNull();
    });

    it("shows both complete faces and persists a human keep decision for an approximate duplicate", async () => {
        const scan = vi.fn(async () => ({
            items: [
                { blockID: "left", md: "如何使用间隔重复算法？ ==按遗忘曲线安排复习==" },
                { blockID: "right", md: "如何使用间隔重复？ ==按间隔安排复习==" },
            ],
            approximateDuplicates: [{ blockIDs: ["left", "right"] as [string, string], similarity: 0.8, method: "containment" as const }],
        }));
        renderPage({ scan });

        expect(await screen.findByText("如何使用间隔重复算法？ ==按遗忘曲线安排复习==")).toBeTruthy();
        expect(screen.getByText("如何使用间隔重复？ ==按间隔安排复习==")).toBeTruthy();
        await fireEvent.click(screen.getByRole("button", { name: "保留 · 卡片 A" }));
        expect(screen.getByText(/已保留: left/)).toBeTruthy();
        expect(JSON.parse(window.localStorage.getItem("lv-cards.maintenance.approximate-duplicates.v1")!)).toEqual({
            ["left\u001fright"]: { action: "keep", blockID: "left" },
        });
    });

    it("keeps the prior state after a failed pause and retries the same card", async () => {
        let finishRetry!: () => void;
        const retryWrite = new Promise<void>(resolve => { finishRetry = resolve; });
        const suspendToday = vi.fn().mockRejectedValueOnce(new Error("磁盘不可用")).mockReturnValueOnce(retryWrite);
        renderPage({ suspendToday });

        await fireEvent.click((await screen.findAllByRole("button", { name: "暂缓今日" }))[0]);
        const alert = await screen.findByRole("alert");
        expect(alert.textContent).toContain("今日状态未改变");
        expect(alert.textContent).toContain("磁盘不可用");
        expect(screen.getAllByRole("button", { name: "暂缓今日" })).toHaveLength(2);
        expect(screen.queryByText("已暂缓")).toBeNull();
        expect(suspendToday).toHaveBeenCalledWith(["card-a"]);

        await fireEvent.click(screen.getByRole("button", { name: "重试" }));
        const savingButtons = await screen.findAllByRole("button", { name: "保存中…" });
        expect(savingButtons).toHaveLength(1);
        expect((savingButtons[0] as HTMLButtonElement).disabled).toBe(true);
        expect(suspendToday).toHaveBeenCalledTimes(2);
        finishRetry();
        await waitFor(() => expect(screen.getByRole("button", { name: "恢复" })).toBeTruthy());
        expect(suspendToday).toHaveBeenCalledTimes(2);
        expect(screen.getAllByText("已暂缓").length).toBeGreaterThan(0);
    });

    it("does not mark a group as paused while its write is pending or failed", async () => {
        const suspendToday = vi.fn().mockRejectedValueOnce(new Error("写入失败"));
        renderPage({ suspendToday });

        await fireEvent.click(await screen.findByRole("button", { name: "本组暂缓" }));
        expect((await screen.findByRole("alert")).textContent).toContain("写入失败");
        expect(screen.getAllByRole("button", { name: "暂缓今日" })).toHaveLength(2);
        expect(screen.getByRole("button", { name: "本组暂缓" })).toBeTruthy();
        expect(screen.queryByText("已暂缓")).toBeNull();
        expect(suspendToday).toHaveBeenCalledWith(["card-a", "card-b"]);
    });

    it("keeps a paused group visible when resume fails, then removes its markers on retry success", async () => {
        const unsuspendToday = vi.fn().mockRejectedValueOnce(new Error("写入失败")).mockResolvedValueOnce(undefined);
        renderPage({ unsuspendToday, isSuspendedToday: () => true });

        await fireEvent.click(await screen.findByRole("button", { name: "本组恢复" }));
        expect((await screen.findByRole("alert")).textContent).toContain("写入失败");
        expect(screen.getAllByRole("button", { name: "恢复" })).toHaveLength(2);
        expect(screen.getAllByText("已暂缓")).toHaveLength(2);

        await fireEvent.click(screen.getByRole("button", { name: "重试" }));
        await waitFor(() => expect(screen.getByRole("button", { name: "本组暂缓" })).toBeTruthy());
        expect(screen.queryByText("已暂缓")).toBeNull();
        expect(unsuspendToday).toHaveBeenCalledTimes(2);
        expect(unsuspendToday).toHaveBeenLastCalledWith(["card-a", "card-b"]);
    });

    it("keeps resolved source history accessible after acknowledgement and a fresh mount", async () => {
        let acknowledged = false;
        const discoveredAt = Date.UTC(2026, 9, 15, 8);
        const resolvedAt = Date.UTC(2026, 9, 16, 9);
        const scan = vi.fn(async () => ({
            items: [{
                blockID: "source-card", md: "题面 ==答案==",
                sourceHealthIssues: acknowledged ? [] : [{ kind: "changed", detail: "旧 → 新" }],
            }],
            sourceHealthHistory: [{
                blockID: "source-card",
                records: [{ at: discoveredAt, kind: "changed" as const, resolved: acknowledged, detail: "旧 → 新", ...(acknowledged ? { resolvedAt } : {}) }],
            }],
        }));
        const acknowledgeSourceHealth = vi.fn(async () => { acknowledged = true; });
        const confirm = vi.fn(() => true);
        vi.stubGlobal("confirm", confirm);
        const page = renderPage({ scan, acknowledgeSourceHealth });

        await fireEvent.click(await screen.findByRole("button", { name: "确认当前来源" }));
        await waitFor(() => expect(acknowledgeSourceHealth).toHaveBeenCalledWith("source-card"));
        await waitFor(() => expect(scan).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(page.container.querySelector<HTMLDetailsElement>(".lv-maint-health-history")?.open).toBe(true));
        const source = page.container.querySelector<HTMLDetailsElement>(".lv-maint-health-source")!;
        await expandDetails(source);
        expect(within(source).getByText(i18n.maintenance.sourceHealthResolved)).toBeTruthy();
        expect(source.querySelector(`time[datetime="${new Date(discoveredAt).toISOString()}"]`)).toBeTruthy();
        expect(source.querySelector(`time[datetime="${new Date(resolvedAt).toISOString()}"]`)).toBeTruthy();
        expect(screen.queryByRole("button", { name: "确认当前来源" })).toBeNull();
        expect(screen.getByText("未发现债务卡——保持得很好")).toBeTruthy();

        page.unmount();
        const remounted = renderPage({ scan, acknowledgeSourceHealth });
        await waitFor(() => expect(scan).toHaveBeenCalledTimes(3));
        await waitFor(() => expect(remounted.container.querySelector(".lv-maint-health-history")).toBeTruthy());
        const history = remounted.container.querySelector<HTMLDetailsElement>(".lv-maint-health-history")!;
        expect(history.open).toBe(false);
        expect(history.querySelector(".lv-maint-health-source")).toBeNull();
        const reopened = await expandSourceHistory(remounted.container);
        expect(within(reopened.source).getByText("旧 → 新")).toBeTruthy();
        expect(within(reopened.source).getByText(i18n.maintenance.sourceHealthResolved)).toBeTruthy();
        expect(acknowledgeSourceHealth).toHaveBeenCalledTimes(1);
        expect(confirm).toHaveBeenCalledTimes(1);
    });

    it("shows saved history for a source outside the current card scan", async () => {
        const openSource = vi.fn(async () => undefined);
        const page = renderPage({
            scan: vi.fn(async () => ({
                items: [],
                sourceHealthHistory: [{ blockID: "removed-card", records: [{ at: 1000, kind: "moved", resolved: true, detail: "原文档 → 新文档" }] }],
            })),
            openSource,
        });

        const { source } = await expandSourceHistory(page.container);
        expect(source.querySelector(".lv-maint-health-block")?.textContent).toBe("removed-card");
        expect(within(source).getByText(i18n.maintenance.sourceHealthOutsideScan)).toBeTruthy();
        expect(within(source).getByText("原文档 → 新文档")).toBeTruthy();
        expect(within(source).queryByRole("button", { name: "查看并编辑" })).toBeNull();
        await fireEvent.click(within(source).getByRole("button", { name: "打开来源" }));
        expect(openSource).toHaveBeenCalledWith("removed-card");
    });

    it("renders legacy resolution dates and invalid timestamps without losing the history", async () => {
        const legacy = { at: 1000, kind: "changed", resolved: true, detail: "旧版确认记录" };
        const page = renderPage({
            scan: vi.fn(async () => ({
                items: [],
                sourceHealthHistory: [{ blockID: "legacy-card", records: [
                    legacy,
                    { at: 1e20, kind: "moved", resolved: true, detail: "异常时间记录", resolvedAt: 1e20 },
                    { ...legacy },
                ] }],
            })),
        });

        const { source } = await expandSourceHistory(page.container);
        const records = source.querySelectorAll<HTMLLIElement>(".lv-maint-health-records > li");
        expect(records).toHaveLength(3);
        expect(within(source).getAllByText("旧版确认记录")).toHaveLength(2);
        expect(within(source).getAllByText(new RegExp(i18n.maintenance.sourceHealthUnknownDate))).toHaveLength(4);
        const invalidRecord = within(source).getByText("异常时间记录").closest("li")!;
        expect(invalidRecord.querySelector("time")).toBeNull();
        expect(source.querySelectorAll("time")).toHaveLength(2);
    });

    it("groups several source health issues into one card and one acknowledgement action", async () => {
        const page = renderPage({
            scan: vi.fn(async () => ({ items: [{
                blockID: "multi-issue-card", md: "题面 ==答案==",
                sourceHealthIssues: [
                    { kind: "moved", detail: "文档甲 → 文档乙" },
                    { kind: "changed", detail: "旧指纹 → 新指纹" },
                    { kind: "media-broken", detail: "assets/missing.png" },
                ],
            }] })),
            acknowledgeSourceHealth: vi.fn(async () => undefined),
        });

        expect(await screen.findAllByRole("button", { name: "确认当前来源" })).toHaveLength(1);
        expect(page.container.querySelectorAll(".lv-maint-row")).toHaveLength(1);
        expect(screen.getByText("文档甲 → 文档乙", { exact: false })).toBeTruthy();
        expect(screen.getByText("旧指纹 → 新指纹", { exact: false })).toBeTruthy();
        expect(screen.getByText("assets/missing.png", { exact: false })).toBeTruthy();
    });

    it("retains unresolved history when source acknowledgement is cancelled", async () => {
        const scan = vi.fn(async () => ({
            items: [{ blockID: "cancel-card", md: "题面 ==答案==", sourceHealthIssues: [{ kind: "changed", detail: "待确认变化" }] }],
            sourceHealthHistory: [{ blockID: "cancel-card", records: [{ at: 1000, kind: "changed", resolved: false, detail: "待确认变化" }] }],
        }));
        const acknowledgeSourceHealth = vi.fn(async () => undefined);
        vi.stubGlobal("confirm", vi.fn(() => false));
        const page = renderPage({ scan, acknowledgeSourceHealth });
        const { history, source } = await expandSourceHistory(page.container);

        await fireEvent.click(screen.getByRole("button", { name: "确认当前来源" }));
        expect(acknowledgeSourceHealth).not.toHaveBeenCalled();
        expect(scan).toHaveBeenCalledTimes(1);
        expect(history.open).toBe(true);
        expect(within(source).getByText(i18n.maintenance.sourceHealthOpen)).toBeTruthy();
        expect(within(source).queryByText(i18n.maintenance.sourceHealthResolved)).toBeNull();
    });

    it("retains unresolved history after a failed acknowledgement and resolves it only after a successful retry", async () => {
        let accepted = false;
        let finishRetry!: () => void;
        const retryWrite = new Promise<void>(resolve => { finishRetry = () => { accepted = true; resolve(); }; });
        const scan = vi.fn(async () => ({
            items: [{ blockID: "retry-card", md: "题面 ==答案==", sourceHealthIssues: accepted ? [] : [{ kind: "changed", detail: "保留此问题记录" }] }],
            sourceHealthHistory: [{ blockID: "retry-card", records: [{ at: 1000, kind: "changed", resolved: accepted, detail: "保留此问题记录", ...(accepted ? { resolvedAt: 2000 } : {}) }] }],
        }));
        const acknowledgeSourceHealth = vi.fn().mockRejectedValueOnce(new Error("磁盘不可用")).mockReturnValueOnce(retryWrite);
        vi.stubGlobal("confirm", vi.fn(() => true));
        const page = renderPage({ scan, acknowledgeSourceHealth });
        const { source } = await expandSourceHistory(page.container);

        await fireEvent.click(screen.getByRole("button", { name: "确认当前来源" }));
        expect((await screen.findByRole("alert")).textContent).toContain("磁盘不可用");
        expect(scan).toHaveBeenCalledTimes(1);
        expect(within(source).getByText(i18n.maintenance.sourceHealthOpen)).toBeTruthy();
        expect(within(source).getByText("保留此问题记录")).toBeTruthy();

        await fireEvent.click(screen.getByRole("button", { name: "重试" }));
        const pending = await screen.findByRole("button", { name: i18n.maintenance.sourceHealthUpdating });
        expect((pending as HTMLButtonElement).disabled).toBe(true);
        expect(scan).toHaveBeenCalledTimes(1);
        expect(within(source).getByText(i18n.maintenance.sourceHealthOpen)).toBeTruthy();
        finishRetry();

        await waitFor(() => expect(scan).toHaveBeenCalledTimes(2));
        const { source: resolvedSource } = await expandSourceHistory(page.container);
        expect(within(resolvedSource).getByText("保留此问题记录")).toBeTruthy();
        expect(within(resolvedSource).getByText(i18n.maintenance.sourceHealthResolved)).toBeTruthy();
        expect(within(resolvedSource).queryByText(i18n.maintenance.sourceHealthOpen)).toBeNull();
        expect(screen.queryByRole("alert")).toBeNull();
        expect(acknowledgeSourceHealth).toHaveBeenCalledTimes(2);
        expect(acknowledgeSourceHealth).toHaveBeenNthCalledWith(1, "retry-card");
        expect(acknowledgeSourceHealth).toHaveBeenNthCalledWith(2, "retry-card");
    });

    it("shows the latest twenty history records and lets the user reveal earlier entries", async () => {
        const page = renderPage({
            scan: vi.fn(async () => ({
                items: [],
                sourceHealthHistory: [{ blockID: "long-history-card", records: Array.from({ length: 25 }, (_, index) => ({
                    at: 1000 + index, kind: "changed", resolved: true, detail: `来源变化 ${index}`,
                })) }],
            })),
        });

        const { source } = await expandSourceHistory(page.container);
        expect(source.querySelectorAll(".lv-maint-health-records > li")).toHaveLength(20);
        expect(within(source).queryByText("来源变化 0")).toBeNull();
        expect(within(source).getByText("来源变化 5")).toBeTruthy();
        expect(source.querySelector(".lv-maint-health-records > li")?.textContent).toContain("来源变化 24");
        await fireEvent.click(within(source).getByRole("button", { name: i18n.maintenance.sourceHealthShowEarlier }));
        expect(source.querySelectorAll(".lv-maint-health-records > li")).toHaveLength(25);
        expect(within(source).getByText("来源变化 0")).toBeTruthy();
        expect(within(source).queryByRole("button", { name: i18n.maintenance.sourceHealthShowEarlier })).toBeNull();
    });
});
