import { describe, expect, it, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import KoPanel from "../src/ui/ko-panel.svelte";

afterEach(cleanup);

// BK-1 UI：知识对象面板（实例清单/停用开关/移除/派生派发）
const t = {
    ko: {
        title: "知识对象",
        instancesTitle: "卡片实例",
        emptyInstances: "尚无实例",
        toggleTitle: "参与复习",
        remove: "移除",
        derive: "派生实例",
        deriving: "派生中…",
        deriveLabel: "派生卡型",
        revise: "修订事实",
        reviseLabel: "核心事实（修订）",
        saveRevise: "保存修订",
        cancelRevise: "取消",
    },
};

const instances = [
    { cardID: "card-qa", cardType: "qa", capability: "definition", disabled: false },
    { cardID: "card-cloze", cardType: "cloze", capability: null, disabled: true },
];

describe("ko-panel（BK-1 UI）", () => {
    afterEach(cleanup);

    it("渲染核心事实与实例清单；停用实例行有 disabled 样式", () => {
        const { container, getByText } = render(KoPanel, {
            fact: "线粒体是细胞的能量工厂", instances, t, ontoggle: vi.fn(), onremove: vi.fn(), onderive: vi.fn(),
        });
        expect(getByText("线粒体是细胞的能量工厂")).toBeTruthy();
        expect(getByText("卡片实例")).toBeTruthy();
        const rows = [...container.querySelectorAll(".lv-ko-row")];
        expect(rows).toHaveLength(2);
        expect(rows[1].classList.contains("lv-ko-row-disabled")).toBe(true);
    });

    it("停用开关翻转回调携带 cardID 与新状态（启用→停用 / 停用→启用）", async () => {
        const ontoggle = vi.fn();
        const { container } = render(KoPanel, {
            fact: "F", instances, t, ontoggle, onremove: vi.fn(), onderive: vi.fn(),
        });
        const boxes = [...container.querySelectorAll("input[type=checkbox]")];
        await fireEvent.click(boxes[0]);
        expect(ontoggle).toHaveBeenCalledWith("card-qa", true); // 启用中 → 停用
        await fireEvent.click(boxes[1]);
        expect(ontoggle).toHaveBeenCalledWith("card-cloze", false); // 已停用 → 启用
    });

    it("移除按钮回调携带 cardID", async () => {
        const onremove = vi.fn();
        const { container } = render(KoPanel, {
            fact: "F", instances, t, ontoggle: vi.fn(), onremove, onderive: vi.fn(),
        });
        const btns = [...container.querySelectorAll(".lv-ko-row button")];
        await fireEvent.click(btns[1]);
        expect(onremove).toHaveBeenCalledWith("card-cloze");
    });

    it("派生：下拉排除已有卡型，回调携带所选卡型", async () => {
        const onderive = vi.fn();
        const { container, getByLabelText, getByText } = render(KoPanel, {
            fact: "F", instances, t, ontoggle: vi.fn(), onremove: vi.fn(), onderive,
        });
        const select = getByLabelText("派生卡型") as HTMLSelectElement;
        const values = [...select.querySelectorAll("option")].map(o => o.value);
        expect(values).not.toContain("qa");
        expect(values).not.toContain("cloze");
        expect(values).toContain("occlusion");

        select.value = "occlusion";
        await fireEvent.change(select);
        await fireEvent.click(getByText("派生实例"));
        expect(onderive).toHaveBeenCalledWith("occlusion");
    });

    it("deriving=true：派生按钮禁用", () => {
        const { getByText } = render(KoPanel, {
            fact: "F", instances: [], deriving: true, t, ontoggle: vi.fn(), onremove: vi.fn(), onderive: vi.fn(),
        });
        expect((getByText("派生中…") as HTMLButtonElement).disabled).toBe(true);
    });
});

describe("ko-panel 修订模式（BK-1 验收）", () => {
    afterEach(cleanup);

    it("修订模式：编辑→保存回调携带新事实；空值/同值不触发", async () => {
        const onrevise = vi.fn();
        const { container, getByText, getByLabelText } = render(KoPanel, {
            fact: "旧事实", instances: [], t, ontoggle: vi.fn(), onremove: vi.fn(), onderive: vi.fn(), onrevise,
        });
        await fireEvent.click(getByText("修订事实"));
        const box = getByLabelText("核心事实（修订）") as HTMLTextAreaElement;
        expect(box.value).toBe("旧事实");
        await fireEvent.input(box, { target: { value: "新事实" } });
        await fireEvent.click(getByText("保存修订"));
        expect(onrevise).toHaveBeenCalledWith("新事实");
    });

    it("修订取消不触发回调；未传 onrevise 不显示修订按钮", async () => {
        const onrevise = vi.fn();
        const first = render(KoPanel, {
            fact: "旧事实", instances: [], t, ontoggle: vi.fn(), onremove: vi.fn(), onderive: vi.fn(), onrevise,
        });
        await fireEvent.click(first.getByText("修订事实"));
        await fireEvent.click(first.getByText("取消"));
        expect(first.queryByText("保存修订")).toBeNull();
        expect(onrevise).not.toHaveBeenCalled();
        first.unmount();
        // 未传 onrevise：无修订按钮（宿主可选能力）
        const second = render(KoPanel, {
            fact: "F", instances: [], t, ontoggle: vi.fn(), onremove: vi.fn(), onderive: vi.fn(),
        });
        expect(second.queryByText("修订事实")).toBeNull();
        second.unmount();
    });
});
