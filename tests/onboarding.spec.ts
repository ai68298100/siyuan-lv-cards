import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import Onboarding from "../src/ui/onboarding.svelte";

const { getNotebooks } = vi.hoisted(() => ({ getNotebooks: vi.fn() }));
vi.mock("@/api/siyuan", () => ({ getNotebooks }));

const mockI18n = {
    onboardingStep: "步骤",
    onboardingSkip: "跳过",
    onboardingPersonaQ: "你想怎么用它？",
    onboardingPersonaHint: "选一个画像，一键配好模块与参数",
    onboardingHowTitle: "怎么做",
    onboardingHowDesc: "说明",
    personaExam: "考试冲刺",
    personaExam_desc: "考试倒排与错题强化",
    personaNotes: "常青笔记",
    personaNotes_desc: "概念连接与长效记忆",
    personaLanguage: "语言学习",
    personaLanguage_desc: "听写拼读与双向词卡",
    onboardingTypesTitle: "支持的卡片表达",
    onboardingTypeQa: "问答",
    onboardingTypeQaDesc: "先回忆，再核对",
    onboardingTypeCloze: "挖空",
    onboardingTypeClozeDesc: "遮住重点句子",
    onboardingTypeFormula: "公式",
    onboardingTypeFormulaDesc: "数学符号与表达式",
    onboardingTypeList: "清单",
    onboardingTypeListDesc: "步骤与要点",
    onboardingTypeConcept: "概念",
    onboardingTypeConceptDesc: "术语与定义",
    onboardingSampleTitle: "生成示例卡片",
    onboardingSampleHint: "选择用来存放示例卡片的笔记本",
    onboardingSampleNotice: "示例卡片保存在指定笔记本中",
    onboardingNotebook: "目标笔记本",
    onboardingBack: "返回上一步",
    onboardingCreate: "生成示例卡片",
    onboardingNoNotebook: "未找到可用笔记本",
    onboardingDoneTitle: "太棒了！已准备好示例卡片",
    onboardingDoneDesc: "你随时可以在思源中划选文本继续制卡",
    onboardingHelp: "查看帮助指南",
    onboardingOpenSamples: "打开示例笔记",
    onboardingFinish: "开始复习体验",
    dashboard: { loading: "加载中…", refresh: "重试" },
};

function baseProps(extra: Record<string, unknown> = {}) {
    return {
        i18n: mockI18n,
        applyPersona: vi.fn(),
        createSampleCards: vi.fn(async () => "doc-samples-1"),
        openReview: vi.fn(),
        openHelp: vi.fn(),
        openSampleDoc: vi.fn(),
        onClose: vi.fn(),
        ...extra,
    };
}

describe("onboarding component flow", () => {
    beforeEach(() => {
        getNotebooks.mockReset().mockResolvedValue([
            { id: "nb-1", name: "学习笔记" },
            { id: "nb-2", name: "工作工作区" },
        ]);
    });

    afterEach(cleanup);

    it("renders step 1 with persona options and advances to step 2 on selection", async () => {
        const props = baseProps();
        render(Onboarding, props);

        expect(screen.getByText("步骤 1 / 3")).toBeTruthy();
        expect(screen.getByText("你想怎么用它？")).toBeTruthy();
        expect(screen.getByText("考试冲刺")).toBeTruthy();
        expect(screen.getByText("常青笔记")).toBeTruthy();
        expect(screen.getByText("语言学习")).toBeTruthy();

        // 点击考试冲刺画像
        await fireEvent.click(screen.getByText("考试冲刺"));
        expect(props.applyPersona).toHaveBeenCalledWith("exam");

        // 推进到步骤 2
        await waitFor(() => expect(screen.getByText("步骤 2 / 3")).toBeTruthy());
        expect(screen.getByRole("button", { name: "生成示例卡片" })).toBeTruthy();
    });

    it("creates sample cards at step 2 and completes wizard at step 3", async () => {
        const props = baseProps();
        render(Onboarding, props);

        // 选择画像推进到步骤 2
        await fireEvent.click(screen.getByText("常青笔记"));
        await waitFor(() => expect(screen.getByText("步骤 2 / 3")).toBeTruthy());

        // 点击生成示例卡片
        const createBtn = screen.getByRole("button", { name: "生成示例卡片" });
        await fireEvent.click(createBtn);

        expect(props.createSampleCards).toHaveBeenCalledWith("nb-1");

        // 推进到步骤 3 完成界面
        await waitFor(() => expect(screen.getByText("步骤 3 / 3")).toBeTruthy());
        expect(screen.getByText("太棒了！已准备好示例卡片")).toBeTruthy();

        // 点击开始复习体验
        await fireEvent.click(screen.getByRole("button", { name: /开始复习体验/ }));
        expect(props.openReview).toHaveBeenCalledOnce();
        expect(props.onClose).toHaveBeenCalledOnce();
    });

    it("allows skipping the onboarding wizard at any time", async () => {
        const props = baseProps();
        render(Onboarding, props);

        const skipBtn = screen.getByRole("button", { name: "跳过" });
        await fireEvent.click(skipBtn);
        expect(props.onClose).toHaveBeenCalledOnce();
    });
});
