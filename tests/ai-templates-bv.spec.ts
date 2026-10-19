import { describe, expect, it } from "vitest";
import {
    PROMPT_TEMPLATES,
    getTemplate,
    renderTemplate,
    missingInputs,
} from "../src/core/prompt-templates";

describe("ai-templates BV 扩容（BV-13 / BV-23）", () => {
    it("BV-13 词义变体模板正确注册且元数据合规", () => {
        const tpl = getTemplate("word-sense-variants");
        expect(tpl).toBeDefined();
        expect(tpl!.category).toBe("language");
        expect(tpl!.nameKey).toBe("tplWordSenseVariants");
        expect(tpl!.inputs).toEqual(["material", "count"]);
        expect(tpl!.output).toBe("cards-json");
        expect(tpl!.systemPrompt).toContain("多义词辨析");
        expect(tpl!.systemPrompt).toContain("senseA");
        expect(tpl!.systemPrompt).toContain("senseB");
        expect(tpl!.systemPrompt).toContain("boundary");
        expect(tpl!.systemPrompt).toContain("commonMistake");
    });

    it("BV-23 统计报告解释模板正确注册且为 advice-text 形态", () => {
        const tpl = getTemplate("stats-report-explain");
        expect(tpl).toBeDefined();
        expect(tpl!.category).toBe("maintenance");
        expect(tpl!.nameKey).toBe("tplStatsExplain");
        expect(tpl!.inputs).toEqual(["windowDays", "stats"]);
        expect(tpl!.output).toBe("advice-text");
        expect(tpl!.systemPrompt).toContain("指标名");
        expect(tpl!.systemPrompt).toContain("verdict");
        expect(tpl!.systemPrompt).toContain("action");
    });

    it("BV-15 苏格拉底教练模板正确注册且为 advice-text 引导形态", () => {
        const tpl = getTemplate("socratic-coach");
        expect(tpl).toBeDefined();
        expect(tpl!.category).toBe("authoring");
        expect(tpl!.nameKey).toBe("tplSocraticCoach");
        expect(tpl!.inputs).toEqual(["material", "userDraft"]);
        expect(tpl!.output).toBe("advice-text");
        expect(tpl!.systemPrompt).toContain("苏格拉底启发式教练");
        expect(tpl!.systemPrompt).toContain("guidingQuestion");
        expect(tpl!.systemPrompt).toContain("hintLevel");
        expect(tpl!.systemPrompt).toContain("anchorInSource");
    });

    it("BV-16 错因追问模板正确注册且包含排查四元组", () => {
        const tpl = getTemplate("error-cause-probe");
        expect(tpl).toBeDefined();
        expect(tpl!.category).toBe("maintenance");
        expect(tpl!.nameKey).toBe("tplErrorCauseProbe");
        expect(tpl!.inputs).toEqual(["cardPrompt", "expectedAnswer", "userAnswer", "material"]);
        expect(tpl!.output).toBe("cards-json");
        expect(tpl!.systemPrompt).toContain("错因追问排查");
        expect(tpl!.systemPrompt).toContain("probeQuestion");
        expect(tpl!.systemPrompt).toContain("suspectedCause");
        expect(tpl!.systemPrompt).toContain("diagnosticOptions");
        expect(tpl!.systemPrompt).toContain("remedy");
    });

    it("BV-19 leech 根因改写模板正确注册且约束原子拆解", () => {
        const tpl = getTemplate("leech-root-rewrite");
        expect(tpl).toBeDefined();
        expect(tpl!.category).toBe("maintenance");
        expect(tpl!.nameKey).toBe("tplLeechRootRewrite");
        expect(tpl!.inputs).toEqual(["cardContent", "failureCount", "material"]);
        expect(tpl!.output).toBe("cards-json");
        expect(tpl!.systemPrompt).toContain("顽疾卡（Leech）根因改写");
        expect(tpl!.systemPrompt).toContain("splitCardType");
        expect(tpl!.systemPrompt).toContain("whySplit");
        expect(tpl!.systemPrompt).toContain("rootCause");
    });

    it("BV-20 来源更新影响模板正确注册且为 diff-preview 形态", () => {
        const tpl = getTemplate("source-update-impact");
        expect(tpl).toBeDefined();
        expect(tpl!.category).toBe("maintenance");
        expect(tpl!.nameKey).toBe("tplSourceUpdateImpact");
        expect(tpl!.inputs).toEqual(["diffSummary", "affectedCards"]);
        expect(tpl!.output).toBe("diff-preview");
        expect(tpl!.systemPrompt).toContain("笔记来源变更影响评估");
        expect(tpl!.systemPrompt).toContain("affectedCardId");
        expect(tpl!.systemPrompt).toContain("impactLevel");
        expect(tpl!.systemPrompt).toContain("diffPoint");
        expect(tpl!.systemPrompt).toContain("suggestedAction");
    });

    it("全量 18 个模板的 id 在注册表内唯一且不与现有模板冲突", () => {
        const ids = PROMPT_TEMPLATES.map(t => t.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length);
        expect(ids).toHaveLength(18);
        expect(ids).toContain("word-sense-variants");
        expect(ids).toContain("stats-report-explain");
        expect(ids).toContain("socratic-coach");
        expect(ids).toContain("error-cause-probe");
        expect(ids).toContain("leech-root-rewrite");
        expect(ids).toContain("source-update-impact");

        // 防回归隔离：核心已注册模板应继续存在
        expect(ids).toContain("generic");
        expect(ids).toContain("exam");
        expect(ids).toContain("language");
        expect(ids).toContain("material-scan");
        expect(ids).toContain("goal-clarify");
        expect(ids).toContain("card-type-route");
        expect(ids).toContain("atomic-split");
        expect(ids).toContain("cloze-leak-check");
        expect(ids).toContain("distractor-with-cause");
        expect(ids).toContain("answer-rubric");
        expect(ids).toContain("list-table-bidi");
    });

    it("BV-13 模板占位符 ${count} 正确渲染", () => {
        const tpl = getTemplate("word-sense-variants")!;
        const rendered = renderTemplate(tpl, { count: 5, material: "示例材料" });
        expect(rendered).toContain("5 组多义词");
        expect(rendered).not.toContain("${count}");
    });

    it("BV-23 模板占位符 ${windowDays} 正确渲染并预检缺失输入", () => {
        const tpl = getTemplate("stats-report-explain")!;
        const rendered = renderTemplate(tpl, {
            windowDays: 7,
            stats: "总卡 200 / 命中 0.83 / 反应 2.1s",
        });
        expect(rendered).toContain("7 天的复习日志");
        expect(rendered).not.toContain("${windowDays}");

        // 缺失 stats 字段应该被检测
        const missing = missingInputs(tpl, { windowDays: 14 });
        expect(missing).toEqual(["stats"]);
    });

    it("BV-13 与 BV-23 模板通过 getTemplate 正确取回，不互相串扰", () => {
        const tplA = getTemplate("word-sense-variants")!;
        const tplB = getTemplate("stats-report-explain")!;
        expect(tplA.id).not.toBe(tplB.id);
        expect(tplA.systemPrompt).not.toBe(tplB.systemPrompt);
        expect(tplA.nameKey).not.toBe(tplB.nameKey);
        expect(tplA.output).toBe("cards-json");
        expect(tplB.output).toBe("advice-text");
    });

    it("未知 id 调用 getTemplate 返回 undefined（与调用方约定）", () => {
        expect(getTemplate("not-existing-template")).toBeUndefined();
    });
});
