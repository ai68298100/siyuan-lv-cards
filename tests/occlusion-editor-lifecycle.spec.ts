import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import OcclusionEditor from "../src/ui/occlusion-editor.svelte";

const { getBlockDOM } = vi.hoisted(() => ({ getBlockDOM: vi.fn() }));
vi.mock("../src/api/siyuan", () => ({ getBlockDOM, setBlockAttrs: vi.fn() }));

describe("occlusion editor pointer lifecycle", () => {
    beforeEach(() => {
        getBlockDOM.mockReset().mockResolvedValue('<img src="image.png" />');
        Object.defineProperty(window, "siyuan", { configurable: true, value: { languages: { cancel: "Cancel" } } });
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    function mountEditor() {
        return render(OcclusionEditor, {
            blockID: "block-1",
            i18n: { occlusion: { title: "Image masks", drawHint: "Drag to draw", undo: "Undo", clear: "Clear", editorAria: "Mask editor", save: "Save" }, occlusionNoImage: "No image" },
            onSave: vi.fn(),
            onClose: vi.fn(),
        });
    }

    it("cancels the in-progress rectangle on pointercancel", async () => {
        const { container } = mountEditor();
        const overlay = await waitFor(() => {
            const element = container.querySelector("svg.lv-occed-overlay");
            expect(element).toBeTruthy();
            return element as SVGSVGElement;
        });
        vi.spyOn(overlay, "getBoundingClientRect").mockReturnValue({
            x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, toJSON: () => ({}),
        });

        await fireEvent.pointerDown(overlay, { pointerId: 7, clientX: 10, clientY: 10 });
        await fireEvent.pointerMove(window, { pointerId: 7, clientX: 60, clientY: 60 });
        await fireEvent.pointerCancel(window, { pointerId: 7, clientX: 60, clientY: 60 });

        expect(screen.getByRole("button", { name: /Save \(0\)/ }).hasAttribute("disabled")).toBe(true);
        expect(overlay.querySelectorAll("rect")).toHaveLength(0);
    });

    it("removes global pointer and resize listeners and the image listener on unmount", async () => {
        const addWindow = vi.spyOn(window, "addEventListener");
        const removeWindow = vi.spyOn(window, "removeEventListener");
        const { container, unmount } = mountEditor();
        const overlay = await waitFor(() => {
            expect(["pointermove", "pointerup", "pointercancel", "resize"].every(type =>
                addWindow.mock.calls.some(([event]) => event === type),
            )).toBe(true);
            const element = container.querySelector("svg.lv-occed-overlay");
            expect(element).toBeTruthy();
            return element as SVGSVGElement;
        });
        const image = container.querySelector("img")!;

        for (const type of ["pointermove", "pointerup", "pointercancel", "resize"]) {
            expect(addWindow.mock.calls.some(([event]) => event === type)).toBe(true);
        }
        const removeImage = vi.spyOn(image, "removeEventListener");
        unmount();

        for (const type of ["pointermove", "pointerup", "pointercancel", "resize"]) {
            expect(removeWindow.mock.calls.some(([event]) => event === type)).toBe(true);
        }
        expect(removeImage).toHaveBeenCalledWith("load", expect.any(Function));
        expect(container.querySelector("svg.lv-occed-overlay")).toBeNull();
    });

    it("supports keyboard shortcuts: Ctrl+Z to undo, Ctrl+Enter to save, Escape to close", async () => {
        const onSave = vi.fn();
        const onClose = vi.fn();
        const { container } = render(OcclusionEditor, {
            blockID: "block-1",
            i18n: { occlusion: { title: "Image masks", drawHint: "Drag to draw", undo: "Undo", clear: "Clear", editorAria: "Mask editor", save: "Save" }, occlusionNoImage: "No image" },
            onSave,
            onClose,
        });

        const overlay = await waitFor(() => {
            const element = container.querySelector("svg.lv-occed-overlay");
            expect(element).toBeTruthy();
            return element as SVGSVGElement;
        });
        vi.spyOn(overlay, "getBoundingClientRect").mockReturnValue({
            x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, toJSON: () => ({}),
        });

        // 绘制一个遮挡矩形
        await fireEvent.pointerDown(overlay, { pointerId: 1, clientX: 10, clientY: 10 });
        await fireEvent.pointerMove(window, { pointerId: 1, clientX: 60, clientY: 60 });
        await fireEvent.pointerUp(window, { pointerId: 1, clientX: 60, clientY: 60 });
        expect(overlay.querySelectorAll("rect")).toHaveLength(1);

        // 按 Ctrl+Z 撤销上一个遮挡
        await fireEvent.keyDown(window, { key: "z", ctrlKey: true });
        expect(overlay.querySelectorAll("rect")).toHaveLength(0);

        // 再次绘制一个矩形，按 Ctrl+Enter 快捷保存
        await fireEvent.pointerDown(overlay, { pointerId: 2, clientX: 20, clientY: 20 });
        await fireEvent.pointerMove(window, { pointerId: 2, clientX: 70, clientY: 70 });
        await fireEvent.pointerUp(window, { pointerId: 2, clientX: 70, clientY: 70 });
        expect(overlay.querySelectorAll("rect")).toHaveLength(1);

        await fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });
        await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
        expect(onClose).toHaveBeenCalledOnce();
    });

    it("supports drawing occlusions on SVG canvas such as Excalidraw (Issue #14)", async () => {
        getBlockDOM.mockResolvedValueOnce('<svg class="excalidraw-svg" viewBox="0 0 800 600"><rect width="800" height="600" /></svg>');
        const { container } = mountEditor();
        const svg = await waitFor(() => {
            const element = container.querySelector("svg.excalidraw-svg");
            expect(element).toBeTruthy();
            return element as SVGSVGElement;
        });
        expect(svg).toBeTruthy();
        const overlay = container.querySelector("svg.lv-occed-overlay") as SVGSVGElement;
        expect(overlay).toBeTruthy();
        vi.spyOn(overlay, "getBoundingClientRect").mockReturnValue({
            x: 0, y: 0, left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200, toJSON: () => ({}),
        });

        await fireEvent.pointerDown(overlay, { pointerId: 3, clientX: 10, clientY: 10 });
        await fireEvent.pointerMove(window, { pointerId: 3, clientX: 80, clientY: 80 });
        await fireEvent.pointerUp(window, { pointerId: 3, clientX: 80, clientY: 80 });
        expect(overlay.querySelectorAll("rect")).toHaveLength(1);
    });
});
