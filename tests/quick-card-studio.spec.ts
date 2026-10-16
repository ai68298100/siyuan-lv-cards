import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import QuickCard from "../src/ui/quick-card.svelte";
import StudioWorkbench from "../src/ui/studio-workbench.svelte";

const { getRiffDecks, createRiffDeck } = vi.hoisted(() => ({
    getRiffDecks: vi.fn(),
    createRiffDeck: vi.fn(),
}));

vi.mock("../src/api/riff", () => ({ getRiffDecks, createRiffDeck }));

const i18n = {
    quickCardQ: "问题",
    quickCardA: "答案",
    quickCardCreate: "制卡",
    quickCardNeedDeck: "请选择或新建卡组",
    quickCardDone: "已制卡并加入卡组",
    quickCardFail: "制卡失败，请重试",
    quickCardDeckLoading: "正在读取卡组…",
    quickCardDeckLoadFail: "读取卡组失败：${error}",
    quickCardDeckRetry: "重试读取",
    quickCardDeckFallback: "也可以直接输入新卡组名称继续。",
    quickCardTemplateLabel: "卡面表达",
    quickCardTemplateQA: "问答表达",
    quickCardTemplateCloze: "挖空表达",
    quickCardTemplateQADesc: "先想出答案，再翻开核对",
    quickCardTemplateClozeDesc: "回忆句子里被遮住的关键内容",
    quickCardClozeHint: "在题面中用 ____ 标记要隐藏的答案位置",
    quickCardPreviewTitle: "卡面预览",
    quickCardPreviewNote: "保存后由思源正式渲染",
    quickCardPreviewFront: "回忆面",
    quickCardPreviewBack: "核对面",
    quickCardEditorLabel: "编辑卡片",
    quickCardOneFactHint: "尽量只问一个可核对的知识点；复习时先回忆，再揭晓答案。",
    quickCardShowAnswer: "查看答案",
    quickCardHideAnswer: "返回题面",
    quickCardHiddenAnswer: "答案（复习时隐藏）",
    quickCardPreviewEmpty: "填写题面或答案后预览",
    deckPickerTitle: "选择卡组",
    deckNewName: "新建卡组名称",
};

describe("R54 manual card workspace", () => {
    beforeEach(() => {
        getRiffDecks.mockReset().mockResolvedValue([{ id: "deck-1", name: "默认卡组", size: 0 }]);
        createRiffDeck.mockReset();
        Object.defineProperty(window, "siyuan", {
            configurable: true,
            value: { languages: { cancel: "取消" } },
        });
    });

    afterEach(cleanup);

    it("previews a Q&A card and submits the native cloze markup", async () => {
        const onCreate = vi.fn(async () => undefined);
        render(QuickCard, { i18n, onCreate, onClose: vi.fn(), embedded: true });

        await fireEvent.input(await screen.findByRole("textbox", { name: "问题" }), { target: { value: "光合作用的主要产物是什么？" } });
        await fireEvent.input(screen.getByRole("textbox", { name: "答案" }), { target: { value: "葡萄糖和氧气" } });
        expect(screen.getByText("答案（复习时隐藏）")).toBeTruthy();
        expect(screen.queryByText("葡萄糖和氧气")).toBeNull();
        await fireEvent.click(screen.getByRole("button", { name: "查看答案" }));
        expect(screen.getByText("葡萄糖和氧气")).toBeTruthy();
        expect(screen.getByText("光合作用的主要产物是什么？")).toBeTruthy();
        await fireEvent.click(screen.getByRole("button", { name: "返回题面" }));

        await fireEvent.click(screen.getByRole("button", { name: /制卡/ }));
        await waitFor(() => expect(onCreate).toHaveBeenCalledWith(
            "光合作用的主要产物是什么？ ==葡萄糖和氧气==",
            "deck-1",
            "默认卡组",
            "光合作用的主要产物是什么？",
            "葡萄糖和氧气",
        ));
        expect(screen.getByRole("status").textContent).toContain("已制卡");
    });

    it("requires a blank marker for cloze and previews the revealed sentence", async () => {
        const onCreate = vi.fn(async () => undefined);
        render(QuickCard, { i18n, onCreate, onClose: vi.fn(), embedded: true });
        await screen.findByRole("button", { name: /挖空表达/ });
        await fireEvent.click(screen.getByRole("button", { name: /挖空表达/ }));

        await fireEvent.input(screen.getByRole("textbox", { name: "问题" }), { target: { value: "光合作用固定的主要糖类是____。" } });
        await fireEvent.input(screen.getByRole("textbox", { name: "答案" }), { target: { value: "葡萄糖" } });
        await fireEvent.click(screen.getByRole("button", { name: "查看答案" }));
        expect(screen.getByText("光合作用固定的主要糖类是葡萄糖。")).toBeTruthy();

        const submit = screen.getByRole("button", { name: /制卡/ }) as HTMLButtonElement;
        expect(submit.disabled).toBe(false);
        await fireEvent.click(submit);
        await waitFor(() => expect(onCreate).toHaveBeenCalledWith(
            "光合作用固定的主要糖类是==葡萄糖==。",
            "deck-1",
            "默认卡组",
            "光合作用固定的主要糖类是____。",
            "葡萄糖",
        ));
    });

    it("keeps cloze submission disabled until the blank marker exists", async () => {
        render(QuickCard, { i18n, onCreate: vi.fn(), onClose: vi.fn(), embedded: true });
        await fireEvent.click(await screen.findByRole("button", { name: /挖空表达/ }));
        await fireEvent.input(screen.getByRole("textbox", { name: "问题" }), { target: { value: "固定的糖类" } });
        await fireEvent.input(screen.getByRole("textbox", { name: "答案" }), { target: { value: "葡萄糖" } });
        expect((screen.getByRole("button", { name: /制卡/ }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("deck loading failure shows a retry action and restores deck choices", async () => {
        getRiffDecks
            .mockRejectedValueOnce(new Error("宿主暂不可用"))
            .mockResolvedValueOnce([{ id: "deck-2", name: "重试卡组", size: 1 }]);
        render(QuickCard, { i18n, onCreate: vi.fn(), onClose: vi.fn(), embedded: true });

        expect((await screen.findByRole("alert")).textContent).toContain("读取卡组失败：宿主暂不可用");
        await fireEvent.click(screen.getByRole("button", { name: "重试读取" }));
        await waitFor(() => expect(getRiffDecks).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(screen.getByRole("combobox", { name: "选择卡组" }).textContent).toContain("重试卡组"));
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("applies the same validation to the keyboard shortcut", async () => {
        const onCreate = vi.fn(async () => undefined);
        render(QuickCard, { i18n, onCreate, onClose: vi.fn(), embedded: true });
        await screen.findByRole("button", { name: /问答表达/ });

        await fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });
        expect(onCreate).not.toHaveBeenCalled();

        await fireEvent.input(screen.getByRole("textbox", { name: "问题" }), { target: { value: "水的化学式是什么？" } });
        await fireEvent.input(screen.getByRole("textbox", { name: "答案" }), { target: { value: "H2O" } });
        await fireEvent.keyDown(screen.getByRole("textbox", { name: "答案" }), { key: "Enter", ctrlKey: true });
        await waitFor(() => expect(onCreate).toHaveBeenCalledWith("水的化学式是什么？ ==H2O==", "deck-1", "默认卡组", "水的化学式是什么？", "H2O"));
    });

    it("does not create the same deck twice when card insertion fails and is retried", async () => {
        createRiffDeck.mockResolvedValue({ id: "deck-new", name: "新建卡组", size: 0 });
        const onCreate = vi.fn()
            .mockRejectedValueOnce(new Error("写入失败"))
            .mockResolvedValueOnce(undefined);
        render(QuickCard, { i18n, onCreate, onClose: vi.fn(), embedded: true });

        await fireEvent.input(await screen.findByRole("textbox", { name: "问题" }), { target: { value: "地球绕太阳一周需要多久？" } });
        await fireEvent.input(screen.getByRole("textbox", { name: "答案" }), { target: { value: "一年" } });
        await fireEvent.input(screen.getByRole("textbox", { name: "新建卡组名称" }), { target: { value: "新建卡组" } });
        await fireEvent.click(screen.getByRole("button", { name: /制卡/ }));

        expect((await screen.findByRole("alert")).textContent).toContain("写入失败");
        await fireEvent.click(screen.getByRole("button", { name: /制卡/ }));

        await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(2));
        expect(createRiffDeck).toHaveBeenCalledOnce();
        expect(onCreate).toHaveBeenLastCalledWith(
            "地球绕太阳一周需要多久？ ==一年==",
            "deck-new",
            "新建卡组",
            "地球绕太阳一周需要多久？",
            "一年",
        );
    });

    it("preserves a manual draft when leaving and reopening the embedded editor", async () => {
        const quickProps = { i18n, onCreate: vi.fn(), onClose: vi.fn() };
        const loadQuickCard = vi.fn(async () => ({ Component: QuickCard, props: quickProps }));
        const loadWizard = vi.fn(async () => ({ Component: QuickCard, props: quickProps }));
        const studioI18n = {
            hubStudioEyebrow: "制卡与学习",
            hubPrimaryStudio: "制卡",
            hubTabAuthoring: "制卡",
            authoringPageSub: "创建卡片",
            aiWizardTitle: "AI 制卡",
            authoringWizardDesc: "根据材料生成候选卡片",
            ...i18n,
        };
        render(StudioWorkbench, {
            i18n: studioI18n,
            isActive: true,
            openOnboarding: vi.fn(),
            loadQuickCard,
            loadWizard,
        });

        const question = await screen.findByRole("textbox", { name: "问题" });
        await fireEvent.input(question, { target: { value: "草稿仍应保留" } });
        await fireEvent.click(screen.getByRole("button", { name: "AI 辅助" }));
        await waitFor(() => expect(loadWizard).toHaveBeenCalledOnce());
        await waitFor(() => expect((screen.getByRole("button", { name: "AI 辅助" }) as HTMLButtonElement).disabled).toBe(false));
        await fireEvent.click(screen.getByRole("button", { name: "手工制卡" }));

        expect((screen.getByRole("textbox", { name: "问题" }) as HTMLTextAreaElement).value).toBe("草稿仍应保留");
        expect(loadQuickCard).toHaveBeenCalledOnce();
    });

    it("keeps the hidden workbench lazy until its tab is opened", async () => {
        const loadQuickCard = vi.fn(async () => ({ Component: QuickCard, props: { i18n, onCreate: vi.fn(), onClose: vi.fn() } }));
        const props = { i18n, openOnboarding: vi.fn(), loadQuickCard, isActive: false };
        const { rerender } = render(StudioWorkbench, props);

        expect(loadQuickCard).not.toHaveBeenCalled();
        await rerender({ ...props, isActive: true });
        await screen.findByRole("textbox", { name: "问题" });
        expect(loadQuickCard).toHaveBeenCalledOnce();
    });

    it("only handles Ctrl+Enter from the visible manual editor", async () => {
        const onCreate = vi.fn().mockResolvedValue(undefined);
        const { container } = render(QuickCard, { i18n, onCreate, onClose: vi.fn(), embedded: true });
        const question = await screen.findByRole("textbox", { name: "问题" });
        await fireEvent.input(question, { target: { value: "草稿问题" } });
        await fireEvent.input(screen.getByRole("textbox", { name: "答案" }), { target: { value: "草稿答案" } });
        await fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });
        expect(onCreate).not.toHaveBeenCalled();
        container.hidden = true;
        await fireEvent.keyDown(question, { key: "Enter", ctrlKey: true });
        expect(onCreate).not.toHaveBeenCalled();
        container.hidden = false;
        await fireEvent.keyDown(question, { key: "Enter", ctrlKey: true });
        await waitFor(() => expect(onCreate).toHaveBeenCalledOnce());
    });

    it("queues an AI request arriving while the manual chunk is loading", async () => {
        let resolveManual!: (view: any) => void;
        const manual = new Promise<any>(resolve => { resolveManual = resolve; });
        const sharedProps = { i18n, onCreate: vi.fn(), onClose: vi.fn() };
        const loadQuickCard = vi.fn(() => manual);
        const loadWizard = vi.fn(async () => ({ Component: QuickCard, props: sharedProps }));
        const props = { i18n, openOnboarding: vi.fn(), loadQuickCard, loadWizard, isActive: true, aiRequest: 0 };
        const { rerender } = render(StudioWorkbench, props);
        await waitFor(() => expect(loadQuickCard).toHaveBeenCalledOnce());
        await rerender({ ...props, aiRequest: 1 });
        resolveManual({ Component: QuickCard, props: sharedProps });
        await waitFor(() => expect(loadWizard).toHaveBeenCalledOnce());
        expect((screen.getByRole("button", { name: "AI 辅助" }) as HTMLButtonElement).getAttribute("aria-pressed")).toBe("true");
    });

    it("mounts a standalone chunk view through its own mounter", async () => {
        const destroy = vi.fn();
        const mount = vi.fn((_component, target: HTMLElement) => {
            target.textContent = "standalone quick card";
            return { destroy };
        });
        const loadQuickCard = vi.fn(async () => ({
            Component: QuickCard,
            mount,
            props: { i18n, onCreate: vi.fn(), onClose: vi.fn() },
        }));
        const { unmount } = render(StudioWorkbench, {
            i18n,
            isActive: true,
            openOnboarding: vi.fn(),
            loadQuickCard,
        });

        expect(await screen.findByText("standalone quick card")).toBeTruthy();
        expect(mount).toHaveBeenCalledOnce();
        expect(screen.queryByRole("textbox", { name: "问题" })).toBeNull();
        unmount();
        expect(destroy).toHaveBeenCalledOnce();
    });
});
