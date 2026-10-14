import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    buildAiCardBlockMarkdown,
    buildAiCardMarker,
    buildBudgetPreview,
    queryNotebookMaterialText,
} from "../src/core/ai-wizard-service";

describe("ai-wizard-service 向导装配与材料提取引擎", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("buildBudgetPreview 预算报告预览", () => {
        const mockI18n = {
            aiSystemPrompt: "系统提示词",
            aiUserPrompt: "从材料提取卡片：${source}",
            aiTypeClozeHint: "挖空题",
            aiTypeQaHint: "问答题",
            aiInjectionGuard: "隔离条款",
            aiUntrustedLabel: "不可信来源",
        };

        it("成功组装预算报告并返回分层 tokens 统计", () => {
            const preview = buildBudgetPreview({
                source: "这是一段用于测试闪卡抽取的样本文档内容。",
                cfg: { count: 3, language: "zh-CN", type: "qa" },
                promptTemplate: "",
                aiMode: "custom",
                aiModel: "gpt-4o",
                i18n: mockI18n,
            });

            expect(preview).not.toBeNull();
            expect(preview?.budgetTokens).toBeGreaterThan(0);
            expect(preview?.totalTokens).toBeGreaterThan(0);
            expect(preview?.sourceTokens).toBeGreaterThan(0);
            expect(preview?.layers).toBeInstanceOf(Array);
            expect(preview?.needsBatching).toBe(false);
        });

        it("异常时安全返回 null", () => {
            const preview = buildBudgetPreview({
                source: "材料",
                cfg: { count: 3, language: "zh-CN", type: "qa" },
                promptTemplate: "",
                aiMode: "custom",
                aiModel: "gpt-4o",
                i18n: {} as any, // 缺少必要模板字段导致异常
            });
            expect(preview).toBeNull();
        });
    });

    describe("queryNotebookMaterialText 笔记本材料聚合", () => {
        it("正确拼接查询到的非空段落文本", async () => {
            const sqlExecutor = vi.fn().mockResolvedValue([
                { markdown: "# 第一章 基础知识" },
                { markdown: "" },
                { markdown: "段落正文内容详解" },
            ]);

            const text = await queryNotebookMaterialText("nb-math", sqlExecutor);

            expect(sqlExecutor).toHaveBeenCalledWith(expect.stringContaining("box='nb-math'"));
            expect(text).toBe("# 第一章 基础知识\n\n段落正文内容详解");
        });
    });

    describe("buildAiCardMarker 断点防重复标记", () => {
        it("生成标准 HTML 注释标记", () => {
            expect(buildAiCardMarker("job-123", 2)).toBe("<!-- lv-ai:job-123:2 -->");
        });

        it("缺省或非法参数时返回空字符串", () => {
            expect(buildAiCardMarker("", 2)).toBe("");
            expect(buildAiCardMarker("job-123", undefined)).toBe("");
            expect(buildAiCardMarker("job-123", -1)).toBe("");
        });
    });

    describe("buildAiCardBlockMarkdown 卡片块 Markdown 组装", () => {
        it("带标记时换行前置标记并在答案周围包裹挖空", () => {
            const md = buildAiCardBlockMarkdown("什么是光合作用？", "光能转化为化学能", "<!-- lv-ai:j1:0 -->");
            expect(md).toBe("<!-- lv-ai:j1:0 -->\n什么是光合作用？ ==光能转化为化学能==");
        });

        it("无标记时直接输出题面与挖空答案", () => {
            const md = buildAiCardBlockMarkdown("什么是光合作用？", "光能转化为化学能", "");
            expect(md).toBe("什么是光合作用？ ==光能转化为化学能==");
        });
    });
});
