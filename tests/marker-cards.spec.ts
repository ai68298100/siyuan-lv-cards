import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import MarkerCards, { type MarkerItem } from "../src/ui/marker-cards.svelte";

const mockI18n = {
    markerHint: "找到 ${n} 条标记内容",
    markerEmpty: "当前文档没有找到可制卡的标记内容",
    markerEmptyHint: "请先添加 :: 问答或？整块标记，再重新扫描。",
    markerCancel: "取消",
    markerKindQa: "问答",
    markerKindWhole: "整块",
    markerConfirm: "确认制卡 (${n})",
    markerSaving: "正在制卡…",
    selectAll: "全选",
    unselectAll: "取消全选",
};

const sampleItems: MarkerItem[] = [
    { blockID: "b-1", kind: "qa", front: "TCP", back: "传输控制协议" },
    { blockID: "b-2", kind: "whole", front: "什么是端到端可靠传输？", back: "" },
];

function baseProps(extra: Record<string, unknown> = {}) {
    return {
        i18n: mockI18n,
        items: sampleItems,
        onCreate: vi.fn(async () => undefined),
        onClose: vi.fn(),
        ...extra,
    };
}

describe("marker cards preview modal", () => {
    beforeEach(() => {
        Object.defineProperty(window, "siyuan", {
            configurable: true,
            value: { languages: { cancel: "取消" } },
        });
    });

    afterEach(cleanup);

    it("renders marker items, shows count, and creates cards on confirm", async () => {
        const props = baseProps();
        render(MarkerCards, props);

        expect(screen.getByText("找到 2 条标记内容")).toBeTruthy();
        expect(screen.getByText("TCP → 传输控制协议")).toBeTruthy();
        expect(screen.getByText("什么是端到端可靠传输？")).toBeTruthy();

        // 点击确认制卡
        const confirmBtn = screen.getByRole("button", { name: /确认制卡 \(2\)/ });
        await fireEvent.click(confirmBtn);

        expect(props.onCreate).toHaveBeenCalledWith(sampleItems);
        expect(props.onClose).toHaveBeenCalledOnce();
    });

    it("supports toggle-all and individual checkbox toggles", async () => {
        const props = baseProps();
        render(MarkerCards, props);

        // 点击取消全选
        const toggleAllBtn = screen.getByRole("button", { name: "取消全选" });
        await fireEvent.click(toggleAllBtn);

        // 确认制卡按钮变为 0 并禁用
        const confirmBtn = screen.getByRole("button", { name: /确认制卡 \(0\)/ }) as HTMLButtonElement;
        expect(confirmBtn.disabled).toBe(true);

        // 勾选第一项
        const checkboxes = screen.getAllByRole("checkbox");
        await fireEvent.click(checkboxes[0]);

        // 确认制卡按钮变为 1
        expect(screen.getByRole("button", { name: /确认制卡 \(1\)/ })).toBeTruthy();
    });

    it("supports keyboard shortcuts: Ctrl+Enter to confirm and Escape to cancel", async () => {
        const props = baseProps();
        render(MarkerCards, props);

        // 按 Ctrl+Enter 快捷提交
        await fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });
        await waitFor(() => expect(props.onCreate).toHaveBeenCalledWith(sampleItems));
        expect(props.onClose).toHaveBeenCalledOnce();
    });

    it("closes when Escape key is pressed", async () => {
        const props = baseProps();
        render(MarkerCards, props);

        await fireEvent.keyDown(window, { key: "Escape" });
        expect(props.onClose).toHaveBeenCalledOnce();
    });

    it("renders empty state when no items found", () => {
        const props = baseProps({ items: [] });
        render(MarkerCards, props);

        expect(screen.getByText("当前文档没有找到可制卡的标记内容")).toBeTruthy();
    });
});
