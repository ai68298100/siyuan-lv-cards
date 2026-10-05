import { describe, expect, it } from "vitest";
import { assembleGeneratePrompt, TASK_REGISTRY, AI_TASKS } from "../src/core/ai-pipeline";
import { INJECTION_GUARD_DEFAULT } from "../src/core/prompt-injection";

// BU-35 流水线骨架：模板解析→围栏→条款→预算报告→审计字段（单一入口，禁止旁路拼装）
const base = {
    task: "cards-generate" as const,
    // 既有行为：默认系统提示自包含（i18n aiSystemPrompt 无占位符，原样直出）
    defaultSystem: "默认系统提示：只输出 JSON 数组的闪卡。",
    userTemplate: "材料：${source}\n数量：${count} 语言：${language} 题型：${type}",
    source: "线粒体是细胞的能量工厂",
    cfg: { count: 5, language: "中文", type: "qa" },
    typeClozeHint: "挖空题",
    typeQaHint: "问答题",
};

describe("ai-pipeline（BU-35 骨架）", () => {
    it("注册表：任务在册、默认模板/写入目标/预算齐备", () => {
        expect([...AI_TASKS]).toEqual(["cards-generate"]);
        expect(TASK_REGISTRY["cards-generate"].defaultTemplateId).toBe("generic");
        expect(TASK_REGISTRY["cards-generate"].writeTarget).toBe("card-wizard");
        expect(TASK_REGISTRY["cards-generate"].budgetTokens).toBeGreaterThan(0);
    });

    it("默认路径：i18n 系统提示原样直出 + 隔离条款；材料经围栏进入 user", () => {
        const r = assembleGeneratePrompt({ ...base, guardClause: "【隔离条款】" });
        expect(r.system).toContain("默认系统提示：只输出 JSON 数组的闪卡。");
        expect(r.system).toContain("【隔离条款】");
        expect(r.user).toContain('<untrusted_data label="来源材料">\n线粒体是细胞的能量工厂\n</untrusted_data>');
        expect(r.user).toContain("数量：5 语言：中文 题型：问答题");
        expect(r.audit.templateSource).toBe("default");
        expect(r.audit.needsBatching).toBe(false);
    });

    it("自定义模板路径：占位符填充优先于默认系统提示；审计记 custom", () => {
        const r = assembleGeneratePrompt({
            ...base,
            customTemplate: "自定义：出 ${count} 张 ${type} 卡（${language}）",
        });
        expect(r.system.startsWith("自定义：出 5 张 qa 卡（中文）")).toBe(true);
        expect(r.system).toContain(INJECTION_GUARD_DEFAULT); // 无 i18n 条款时兜底
        expect(r.audit.templateSource).toBe("custom");
    });

    it("题型切换：cloze 用挖空提示；空 customTemplate 视同默认（trim 语义）", () => {
        const r = assembleGeneratePrompt({ ...base, cfg: { ...base.cfg, type: "cloze" }, customTemplate: "   " });
        expect(r.user).toContain("题型：挖空题");
        expect(r.audit.templateSource).toBe("default");
    });

    it("材料超预算：needsBatching=true 且审计带 writeTarget（不静默截断，由调用方抛错/分批）", () => {
        const r = assembleGeneratePrompt({ ...base, source: "M".repeat(24000 * 4 + 100) });
        expect(r.needsBatching).toBe(true);
        expect(r.audit.sourceTokens).toBeGreaterThan(24000);
        expect(r.audit.writeTarget).toBe("card-wizard");
    });

    it("审计字段不含材料明文（AuditSink 隐私口径）", () => {
        const r = assembleGeneratePrompt(base);
        expect(JSON.stringify(r.audit)).not.toContain("线粒体");
    });

    // BU-18：预算从模型注册表解析——登记模型按窗口收紧，未登记回任务默认
    it("modelId 登记模型：预算按窗口收紧并记入审计（budgetSource=model-registry）", () => {
        const r = assembleGeneratePrompt({ ...base, modelId: "moonshot-v1-8k" });
        expect(r.audit.budgetSource).toBe("model-registry");
        expect(r.audit.modelId).toBe("moonshot-v1-8k");
        expect(r.audit.budgetTokens).toBe(Math.floor(8192 * 0.6));
        // 小窗口下中等材料即触发分批建议（不静默截断）
        const long = assembleGeneratePrompt({ ...base, modelId: "moonshot-v1-8k", source: "M".repeat(30000) });
        expect(long.needsBatching).toBe(true);
    });

    it("modelId 未登记/缺省：任务默认预算，审计 modelId=null", () => {
        const r = assembleGeneratePrompt({ ...base, modelId: "my-private-model" });
        expect(r.audit.budgetSource).toBe("task-default");
        expect(r.audit.modelId).toBeNull();
        expect(r.audit.budgetTokens).toBe(TASK_REGISTRY["cards-generate"].budgetTokens);
        const noModel = assembleGeneratePrompt(base);
        expect(noModel.audit.budgetSource).toBe("task-default");
    });
});
