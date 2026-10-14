import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import InboxPage from "../src/ui/inbox-page.svelte";

vi.mock("siyuan", () => ({ showMessage: vi.fn() }));

afterEach(cleanup);

const item = { blockID: "block-1", status: "inbox" as const, addedAt: 1, updatedAt: 1 };
const i18n = {
    inbox: {
        tabInbox: "待筛选", tabStaged: "暂存", tabSelected: "已选中", tabDismissed: "已淘汰",
        title: "材料收件箱", empty: "收件箱为空", filterGroupLabel: "状态筛选",
        selectAll: "全选", unselectAll: "全不选", refresh: "刷新", refreshedNotice: "已刷新",
        selectItem: "选择材料", openSource: "打开来源", opening: "打开中…",
        openFailed: "打开来源失败：${error}，请重试。", retry: "重试",
    },
};

function props(openSource: (id: string) => Promise<void>) {
    return {
        i18n,
        inbox: {
            get: () => ({ version: 1 as const, items: [item] }),
            subscribe: () => () => {},
            setStatus: vi.fn(), undoSelection: vi.fn(), remove: vi.fn(), add: vi.fn(), makeCards: vi.fn(),
            openSource,
            titles: async () => new Map([[item.blockID, "闪卡来源标题"]]),
        },
    };
}

describe("收件箱打开来源交互", () => {
    it("请求中锁定重复触发并给出明确加载状态", async () => {
        let resolve!: () => void;
        const openSource = vi.fn(() => new Promise<void>(r => { resolve = r; }));
        render(InboxPage, props(openSource));

        const button = await screen.findByRole("button", { name: "打开来源" }) as HTMLButtonElement;
        await fireEvent.click(button);
        expect(await screen.findByRole("button", { name: "打开中…" })).toBeTruthy();
        expect(button.disabled).toBe(true);
        await fireEvent.click(button);
        expect(openSource).toHaveBeenCalledTimes(1);

        resolve();
        await waitFor(() => expect(button.disabled).toBe(false));
    });

    it("失败时展示可读原因，重试成功后清除错误", async () => {
        const openSource = vi.fn()
            .mockRejectedValueOnce(new Error("宿主暂不可用"))
            .mockResolvedValueOnce(undefined);
        render(InboxPage, props(openSource));

        await fireEvent.click(await screen.findByRole("button", { name: "打开来源" }));
        expect((await screen.findByRole("alert")).textContent).toContain("打开来源失败：宿主暂不可用，请重试。");
        await fireEvent.click(screen.getByRole("button", { name: "重试" }));
        await waitFor(() => expect(openSource).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    });
});
