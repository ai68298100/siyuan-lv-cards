import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import Manager from "../src/ui/manager.svelte";
import fullI18n from "../public/i18n/zh-CN.json";

const { getRiffCards, getRiffCardsByBlockIDs, invalidateDueCache, removeRiffCards, confirmDialog } = vi.hoisted(() => ({
    getRiffCards: vi.fn(),
    getRiffCardsByBlockIDs: vi.fn(),
    invalidateDueCache: vi.fn(),
    removeRiffCards: vi.fn(),
    confirmDialog: vi.fn(),
}));

vi.mock("@/api/riff", () => ({
    getRiffCards,
    getRiffCardsByBlockIDs,
    removeRiffCards,
    resetRiffCards: vi.fn(),
}));
vi.mock("@/api/due-shared", () => ({ invalidateDueCache }));
vi.mock("@/api/siyuan", () => ({ getBlockDOM: vi.fn().mockResolvedValue("") }));
vi.mock("@/libs/dialog", () => ({ confirmDialog }));

const i18n = {
    manager: {
        title: "闪卡管理器", scopeNote: "回到内容", filterLabel: "搜索当前卡片库", filterPlaceholder: "筛选当前页",
        total: "卡片总数", refresh: "刷新", statusLabel: "按状态过滤", statusAll: "状态：全部",
        statusNew: "状态：新卡", statusReview: "状态：已复习", statusDue: "状态：今日到期",
        sortLabel: "排序", sortDefault: "默认顺序", sortPath: "按文档路径", sortContent: "按内容 A-Z",
        sortLapses: "按遗忘次数", prev: "上一页", next: "下一页", selectCard: "选择卡片 ${id}",
        openDoc: "打开文档", emptyContentFallback: "空卡面", dueLoadFailed: "今日到期列表加载失败",
        filterEmptyCurrentPage: "当前页没有匹配项", filterClear: "清除筛选", empty: "没有卡片",
        saveFilter: "收藏筛选", savedFilters: "已存筛选", deleteSaved: "删除筛选", filterSaved: "筛选已收藏",
        leechFilter: "只看易混淆卡", batchConfirm: "确认批量操作 ${n}", batchRemove: "移除", batchReset: "重置",
        batchCancel: "取消选择", exportCsv: "导出 CSV", obExportHint: "导出提示", obExport: "导出 Obsidian",
        batchSelected: "已选 ${n} 张", batchDone: "已移除 ${n} 张", batchResetDone: "已重置 ${n} 张",
        deleteCard: "移除这张卡", deleteConfirm: "确认移除", deleteDone: "已移除", deckScopeClear: "查看全部卡组",
        deckScopeLabel: "当前卡组",
    },
    dashboard: { refresh: "刷新", loading: "读取中", onboardingStart: "开始上手" },
};

const card = { id: "card-a", content: "<p>可恢复现场测试卡</p>", rootID: "doc-a", hPath: "测试" };

function managerContext(overrides: Record<string, unknown> = {}) {
    return {
        i18n,
        app: {},
        savedFilters: () => [],
        saveFilter: vi.fn(),
        deleteFilter: vi.fn(),
        getLeechCards: () => [],
        isNewBlock: () => false,
        getLapsesMap: () => ({}),
        getDueBlockIDs: vi.fn().mockResolvedValue([card.id]),
        ...overrides,
    } as any;
}

describe("manager view state", () => {
    beforeEach(() => {
        getRiffCards.mockReset().mockResolvedValue({ blocks: [card], total: 21, pageCount: 5 });
        invalidateDueCache.mockReset();
        getRiffCardsByBlockIDs.mockReset();
        removeRiffCards.mockReset().mockResolvedValue(undefined);
        confirmDialog.mockReset();
    });

    afterEach(() => cleanup());

    it("restores page, scroll position and focused card, then saves the updated return point", async () => {
        const save = vi.fn();
        const ctx = managerContext({
            view: {
                initial: JSON.stringify({ filter: "恢复", sort: "default", leechOnly: false, status: "all", page: 4, scrollTop: 420, focusId: "lv-manager-card-card-a" }),
                save,
            },
        });
        const rendered = render(Manager, { ctx });

        await waitFor(() => expect(getRiffCards).toHaveBeenCalledWith("", 4, 20));
        const page = document.getElementById("lv-manager-page") as HTMLElement;
        await waitFor(() => expect(page.scrollTop).toBe(420));
        const row = await screen.findByRole("button", { name: /可恢复现场测试卡/ });
        await waitFor(() => expect(document.activeElement).toBe(row));

        page.scrollTop = 512;
        await fireEvent.scroll(page);
        row.focus();
        rendered.unmount();

        const saved = JSON.parse(save.mock.lastCall![0]);
        expect(saved).toMatchObject({ page: 4, scrollTop: 512, focusId: "lv-manager-card-card-a", filter: "恢复" });
    });

    it("shows a retryable error when loading the due set fails, then recovers", async () => {
        const getDueBlockIDs = vi.fn()
            .mockRejectedValueOnce(new Error("kernel offline"))
            .mockResolvedValueOnce([card.id]);
        render(Manager, { ctx: managerContext({ getDueBlockIDs }) });

        await screen.findByRole("button", { name: /可恢复现场测试卡/ });
        await fireEvent.change(screen.getByRole("combobox", { name: "按状态过滤" }), { target: { value: "due" } });
        const error = await screen.findByRole("alert");
        expect(error.textContent).toContain("kernel offline");
        expect(screen.queryByText("当前页没有匹配项")).toBeNull();

        await fireEvent.click(within(error).getByRole("button", { name: "刷新" }));
        await screen.findByRole("button", { name: /可恢复现场测试卡/ });
        expect(screen.queryByRole("alert")).toBeNull();
        expect(getDueBlockIDs).toHaveBeenCalledTimes(2);
    });

    it("labels the manager search input for assistive technology", () => {
        render(Manager, { ctx: managerContext() });
        expect(screen.getByRole("textbox", { name: "搜索当前卡片库" })).toBeTruthy();
    });

    it("cancels pending search debounce when filters are cleared", async () => {
        render(Manager, {
            ctx: managerContext({ getDueBlockIDs: vi.fn().mockResolvedValue([]) }),
        });
        await screen.findByRole("button", { name: /可恢复现场测试卡/ });
        await fireEvent.change(screen.getByRole("combobox", { name: "按状态过滤" }), { target: { value: "due" } });
        await screen.findByRole("button", { name: "清除筛选" });
        const callsBeforeClear = getRiffCards.mock.calls.length;

        const search = screen.getByRole("textbox", { name: "搜索当前卡片库" });
        await fireEvent.input(search, { target: { value: "不会保留" } });
        await fireEvent.click(screen.getByRole("button", { name: "清除筛选" }));
        await screen.findByRole("button", { name: /可恢复现场测试卡/ });

        await new Promise(resolve => setTimeout(resolve, 250));
        expect(getRiffCards).toHaveBeenCalledTimes(callsBeforeClear + 1);
        expect(screen.getByRole("button", { name: /可恢复现场测试卡/ })).toBeTruthy();
    });

    it("keeps the latest requested detail when an older lookup finishes later", async () => {
        let resolveA!: (value: any) => void;
        let resolveB!: (value: any) => void;
        getRiffCardsByBlockIDs.mockReturnValueOnce(new Promise(resolve => { resolveA = resolve; }))
            .mockReturnValueOnce(new Promise(resolve => { resolveB = resolve; }));
        const context = managerContext({ i18n: fullI18n, initialBlockID: "card-a" });
        const view = render(Manager, { ctx: context });
        await waitFor(() => expect(getRiffCardsByBlockIDs).toHaveBeenCalledWith(["card-a"]));
        await view.rerender({ ctx: { ...context, initialBlockID: "card-b" } });
        await waitFor(() => expect(getRiffCardsByBlockIDs).toHaveBeenCalledWith(["card-b"]));
        resolveB({ blocks: [{ id: "card-b", content: "最新卡面 B" }] });
        await screen.findByRole("dialog");
        expect(await screen.findByText("最新卡面 B")).toBeTruthy();
        resolveA({ blocks: [{ id: "card-a", content: "陈旧卡面 A" }] });
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(screen.queryByText("陈旧卡面 A")).toBeNull();
        expect(screen.getByText("最新卡面 B")).toBeTruthy();
    });

    it("removes the confirmed selection even if a background refresh clears it", async () => {
        render(Manager, { ctx: managerContext() });
        await screen.findByRole("button", { name: /可恢复现场测试卡/ });
        await fireEvent.click(screen.getByRole("checkbox", { name: "选择卡片 card-a" }));
        await fireEvent.click(screen.getByRole("button", { name: "移除" }));
        expect(confirmDialog).toHaveBeenCalledTimes(1);
        const confirm = confirmDialog.mock.calls[0][0].confirm;
        await fireEvent.click(screen.getByRole("button", { name: "刷新" }));
        await waitFor(() => expect(getRiffCards).toHaveBeenCalledTimes(2));
        await confirm();
        expect(removeRiffCards).toHaveBeenCalledWith("", ["card-a"]);
    });

    it("restores and serializes starredOnly filter state", async () => {
        const save = vi.fn();
        const initial = JSON.stringify({
            filter: "",
            sort: "default",
            leechOnly: false,
            starredOnly: true,
            status: "all",
            page: 1,
            scrollTop: 0,
            focusId: "",
        });
        const getStarredCardIDs = vi.fn().mockReturnValue(["card-a"]);
        render(Manager, { ctx: managerContext({ view: { initial, save }, getStarredCardIDs }) });
        await screen.findByRole("button", { name: /可恢复现场测试卡/ });
        const starBtn = screen.getByRole("button", { name: /星标卡/ });
        expect(starBtn.classList.contains("lv-chipbtn-active")).toBe(true);
    });
});
