import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import AIWizard from "../src/ui/ai-wizard.svelte";

vi.mock("svelte/transition", () => ({ fade: () => ({ duration: 0, css: () => "" }) }));

const { getRiffDecks } = vi.hoisted(() => ({ getRiffDecks: vi.fn() }));
vi.mock("@/api/riff", () => ({ getRiffDecks, createRiffDeck: vi.fn() }));
vi.mock("@/api/ai", () => ({ classifyAiFailure: () => ({ cls: "network" }), isAICanceled: () => false }));
vi.mock("siyuan", () => ({ showMessage: vi.fn() }));

function mockMessage(path: string): any {
    const fn = () => path;
    return new Proxy(fn, {
        get(_target, property) {
            if (property === "replace") return (search: string, replacement: string) => path.replace(search, replacement);
            if (property === "toString" || property === "valueOf" || property === Symbol.toPrimitive) return () => path;
            if (property === "then") return undefined;
            return mockMessage(`${path}.${String(property)}`);
        },
        apply: () => path,
    });
}

const mockI18n = mockMessage("t");

describe("AI wizard advanced interactions (R54 Parity)", () => {
    beforeEach(() => {
        getRiffDecks.mockResolvedValue([{ id: "deck-a", name: "Default" }]);
        Object.defineProperty(window, "siyuan", {
            configurable: true,
            value: { languages: { confirm: "Confirm", cancel: "Cancel" } },
        });
    });

    afterEach(cleanup);

    it("requires preflight consent checkbox before confirming AI generation and allows cancel", async () => {
        const generate = vi.fn().mockResolvedValue({
            cards: [{ q: "Q1", a: "A1" }],
            jobId: "job-1",
            gen: { model: "m", provider: "p" },
        });

        render(AIWizard, {
            i18n: mockI18n,
            generate,
            onCreate: vi.fn(),
            onClose: vi.fn(),
            closeLabel: "Close",
            initialSource: "This is test lecture notes with enough content to review.",
        });

        // 步骤 1：点击生成候选进入 Preflight 预览
        const genBtn = await screen.findByRole("button", { name: /generate/ });
        await fireEvent.click(genBtn);

        // Preflight 弹窗展开，检查提示、材料字数范围与知情同意复选框
        expect(screen.getByText(/preflightTitle/)).toBeTruthy();
        expect(screen.getByText(/preflightNotice/)).toBeTruthy();

        const initialConfirmBtn = screen.getByRole("button", { name: /preflightConfirm/ }) as HTMLButtonElement;
        expect(initialConfirmBtn.disabled).toBe(true);

        // 点击取消“保留材料，不发送”
        const cancelBtn = screen.getByRole("button", { name: /preflightCancel/ });
        await fireEvent.click(cancelBtn);

        // 弹窗关闭，材料保留
        expect(screen.queryByText(/preflightTitle/)).toBeNull();
        const textarea = screen.getByPlaceholderText(/sourceEditHint/) as HTMLTextAreaElement;
        expect(textarea.value).toContain("This is test lecture notes");
        expect(generate).not.toHaveBeenCalled();

        // 重新打开并勾选复选框后方可生成
        await fireEvent.click(screen.getByRole("button", { name: /generate/ }));
        const consentCheckbox = screen.getByRole("checkbox");
        await fireEvent.click(consentCheckbox);

        const confirmBtn = screen.getByRole("button", { name: /preflightConfirm/ }) as HTMLButtonElement;
        expect(confirmBtn.disabled).toBe(false);

        await fireEvent.click(confirmBtn);
        expect(generate).toHaveBeenCalledOnce();
    });

    it("invalidates acceptance on candidate edit and displays editedReaccept chip", async () => {
        const onCreate = vi.fn();
        render(AIWizard, {
            i18n: mockI18n,
            generate: vi.fn(),
            onCreate,
            onClose: vi.fn(),
            closeLabel: "Close",
            recoveryJob: {
                id: "review-job",
                sourceLabel: "Chapter A",
                candidates: [{ q: "Saved question", a: "Saved answer", origIndex: 0 }],
            },
        });

        await screen.findByDisplayValue("Saved question");

        // 接受该卡
        const acceptBtn = screen.getByRole("button", { name: /acceptVer/ });
        await fireEvent.click(acceptBtn);
        expect(screen.getAllByText(/reviewAccepted/).length).toBeGreaterThan(0);

        // 修改问题文本：触发 touchCandidate
        const qInput = screen.getByDisplayValue("Saved question");
        await fireEvent.input(qInput, { target: { value: "Modified question" } });

        // 审阅状态退回未审，并展示“已编辑，需重新接受”标签
        expect(screen.getByText(/editedReaccept/)).toBeTruthy();

        // 再次点击接受，消除警告并恢复接受状态
        const reacceptBtn = screen.getByRole("button", { name: /acceptVer/ });
        await fireEvent.click(reacceptBtn);
        expect(screen.queryByText(/editedReaccept/)).toBeNull();
        expect(screen.getAllByText(/reviewAccepted/).length).toBeGreaterThan(0);
    });

    it("supports setting candidate to needsCheck and displays assertion provenance report", async () => {
        const onCreate = vi.fn();
        render(AIWizard, {
            i18n: mockI18n,
            generate: vi.fn(),
            onCreate,
            onClose: vi.fn(),
            closeLabel: "Close",
            initialSource: "计算机网络中，TCP 是传输控制协议。提供可靠连接并具有拥塞控制功能。",
            recoveryJob: {
                id: "review-job-2",
                sourceLabel: "Chapter B",
                candidates: [{ q: "TCP 是什么？", a: "传输控制协议。提供可靠连接；具有拥塞控制。", origIndex: 0 }],
            },
        });

        await screen.findByDisplayValue("TCP 是什么？");

        // 点击“保留待核实”
        const needsCheckBtn = screen.getByRole("button", { name: /markNeedsCheck/ });
        await fireEvent.click(needsCheckBtn);

        // 验证界面呈现“待核实”徽章
        expect(screen.getAllByText(/reviewNeedsCheck/).length).toBeGreaterThan(0);

        // 展开卡面预览
        const previewBtn = screen.getAllByRole("button", { name: /cardPreview/ })[0];
        await fireEvent.click(previewBtn);

        // 验证展示事实断言依据核验标题与来源对齐内容
        expect(screen.getByText(/assertionTitle/)).toBeTruthy();
        expect(screen.getByText(/sourceTrustScore/)).toBeTruthy();
    });
});
