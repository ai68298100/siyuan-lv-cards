import { describe, expect, it, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup, waitFor } from "@testing-library/svelte";
import CardEditor from "../src/ui/card-editor.svelte";

// BX-2 W2：卡片编辑 + 写前差异预览（取消/拒绝保留原卡；无改动不可保存）
const t = {
    editor: {
        edit: "编辑", title: "编辑内容", inputLabel: "卡片内容（markdown）", diffLabel: "差异预览",
        noChange: "（无改动）", save: "保存", saving: "保存中…", cancel: "取消",
        hint: "保存前先看差异；取消即保留原卡", saveFail: "保存失败，请重试", loadFail: "内容加载失败",
    },
};

const flushDebounce = () => new Promise(r => setTimeout(r, 250));

describe("card-editor（BX-2 W2）", () => {
    afterEach(cleanup);

    it("初值=原文；无改动时差异区显示占位且保存禁用", () => {
        const { getByLabelText, getByText } = render(CardEditor, {
            t, original: "线粒体是==能量工厂==", onsave: vi.fn(async () => true), oncancel: vi.fn(),
        });
        const box = getByLabelText("卡片内容（markdown）") as HTMLTextAreaElement;
        expect(box.value).toBe("线粒体是==能量工厂==");
        expect(getByText("（无改动）")).toBeTruthy();
        expect((getByText("保存") as HTMLButtonElement).disabled).toBe(true);
    });

    it("编辑后差异预览出现 add/del 片段；保存回调携带新文本", async () => {
        const onsave = vi.fn(async () => true);
        const { getByLabelText, getByText, container } = render(CardEditor, {
            t, original: "线粒体是能量工厂", onsave, oncancel: vi.fn(),
        });
        const box = getByLabelText("卡片内容（markdown）") as HTMLTextAreaElement;
        await fireEvent.input(box, { target: { value: "线粒体是细胞的能量工厂" } });
        await flushDebounce();
        expect(container.querySelector(".lv-editor-add")?.textContent).toContain("细胞的");
        expect(container.querySelector(".lv-editor-del")).toBeNull(); // 纯插入无删除
        const save = getByText("保存") as HTMLButtonElement;
        expect(save.disabled).toBe(false);
        await fireEvent.click(save);
        await waitFor(() => expect(onsave).toHaveBeenCalledWith("线粒体是细胞的能量工厂"));
    });

    it("删除文本出现 del 片段；保存失败显示错误且面板保持", async () => {
        const onsave = vi.fn(async () => false);
        const { getByLabelText, getByText, container } = render(CardEditor, {
            t, original: "线粒体是能量工厂", onsave, oncancel: vi.fn(),
        });
        const box = getByLabelText("卡片内容（markdown）") as HTMLTextAreaElement;
        await fireEvent.input(box, { target: { value: "线粒体" } });
        await flushDebounce();
        expect(container.querySelector(".lv-editor-del")?.textContent).toContain("是能量工厂");
        await fireEvent.click(getByText("保存"));
        await waitFor(() => expect(getByText("保存失败，请重试")).toBeTruthy());
    });

    it("取消回调不触发保存；保存中按钮禁用", async () => {
        const oncancel = vi.fn();
        let resolveSave: (v: boolean) => void = () => { };
        const onsave = vi.fn(() => new Promise<boolean>(r => { resolveSave = r; }));
        const { getByText, getByLabelText } = render(CardEditor, { t, original: "A", onsave, oncancel });
        const box = getByLabelText("卡片内容（markdown）") as HTMLTextAreaElement;
        await fireEvent.input(box, { target: { value: "B" } });
        await flushDebounce();
        const save = getByText("保存") as HTMLButtonElement;
        await fireEvent.click(save);
        expect((getByText("保存中…") as HTMLButtonElement).disabled).toBe(true);
        resolveSave(true);
    });

    it("取消按钮回调 oncancel", async () => {
        const oncancel = vi.fn();
        const { getByText } = render(CardEditor, {
            t, original: "A", onsave: vi.fn(async () => true), oncancel,
        });
        await fireEvent.click(getByText("取消"));
        expect(oncancel).toHaveBeenCalledOnce();
    });
});
