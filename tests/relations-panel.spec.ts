import { describe, expect, it, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import RelationsPanel from "../src/ui/relations-panel.svelte";

afterEach(cleanup);

// BK-2 UI：关系面板 props 注入契约（查看/新建/删除；表单校验错误不触回调）
const t = {
    relations: {
        title: "关系",
        empty: "暂无关系",
        remove: "删除",
        add: "添加",
        typeLabel: "关系类型",
        targetPlaceholder: "目标块 ID",
        errTargetRequired: "目标必填",
        errSelfRelation: "不能关联自身",
        relSibling: "兄弟",
        relPrerequisite: "前置",
        relExample: "示例",
        relCounterexample: "反例",
        relSource: "来源",
        relApplication: "应用",
        relAlternative: "替代",
    },
};

describe("relations-panel（BK-2 UI）", () => {
    it("空关系：显示占位，不渲染行", () => {
        const { container, getByText } = render(RelationsPanel, {
            entityId: "blk-1", relations: [], t, onadd: vi.fn(), onremove: vi.fn(),
        });
        expect(getByText("暂无关系")).toBeTruthy();
        expect(container.querySelectorAll(".lv-relations-row")).toHaveLength(0);
    });

    it("双向渲染行：outgoing 显示目标、incoming 显示来源；类型本地化", () => {
        const relations = [
            { relation: { from: "blk-1", to: "blk-2", type: "sibling", createdAt: 1 }, direction: "outgoing" as const },
            { relation: { from: "blk-3", to: "blk-1", type: "prerequisite", createdAt: 2 }, direction: "incoming" as const },
        ];
        const { container } = render(RelationsPanel, { entityId: "blk-1", relations, t, onadd: vi.fn(), onremove: vi.fn() });
        const rows = [...container.querySelectorAll(".lv-relations-row")];
        expect(rows).toHaveLength(2);
        expect(rows[0].textContent).toContain("兄弟");
        expect(rows[0].textContent).toContain("blk-2");
        expect(rows[1].textContent).toContain("前置");
        expect(rows[1].textContent).toContain("blk-3");
        expect(rows[1].textContent).toContain("←");
    });

    it("删除按钮携带该行的 from/to/type 回调", async () => {
        const onremove = vi.fn();
        const relations = [
            { relation: { from: "blk-1", to: "blk-2", type: "sibling", createdAt: 1 }, direction: "outgoing" as const },
        ];
        const { container } = render(RelationsPanel, { entityId: "blk-1", relations, t, onadd: vi.fn(), onremove });
        await fireEvent.click(container.querySelector(".lv-relations-row button")!);
        expect(onremove).toHaveBeenCalledWith("blk-1", "blk-2", "sibling");
    });

    it("新建：目标为空/自身 → 校验错误且不触回调；合法 → 回调携带 from/to/type", async () => {
        const onadd = vi.fn();
        const { container, getByText, getByLabelText } = render(RelationsPanel, {
            entityId: "blk-1", relations: [], t, onadd, onremove: vi.fn(),
        });
        const input = getByLabelText("目标块 ID") as HTMLInputElement;
        const addBtn = getByText("添加");

        await fireEvent.input(input, { target: { value: "" } });
        await fireEvent.click(addBtn);
        expect(getByText("目标必填")).toBeTruthy();
        expect(onadd).not.toHaveBeenCalled();

        await fireEvent.input(input, { target: { value: "blk-1" } });
        await fireEvent.click(addBtn);
        expect(getByText("不能关联自身")).toBeTruthy();
        expect(onadd).not.toHaveBeenCalled();

        await fireEvent.input(input, { target: { value: "blk-9" } });
        const select = getByLabelText("关系类型") as HTMLSelectElement;
        select.value = "prerequisite";
        await fireEvent.change(select);
        await fireEvent.click(addBtn);
        expect(onadd).toHaveBeenCalledWith("blk-1", "blk-9", "prerequisite");
    });
});
