import { describe, expect, it } from "vitest";
import { findAiCardGateIssues, inspectAiCandidates, selectImportableAiCandidates } from "../src/core/ai-card-gate";

describe("AI 闪卡质量硬门禁", () => {
    it("只在完整答案短语出现在题面时阻断，普通主题词重叠仍可通过", () => {
        expect(findAiCardGateIssues([{ q: "光合作用的产物是什么？", a: "光合作用" }])[0]).toContain("answer-in-question");
        expect(findAiCardGateIssues([{ q: "光合作用把什么转化成什么？", a: "光合作用将光能转化为化学能" }])[0]).not.toContain("answer-in-question");
    });

    it("规范化重复问句只阻断后出现的候选", () => {
        const issues = findAiCardGateIssues([
            { q: "什么是 DNA？", a: "脱氧核糖核酸" },
            { q: "什么是DNA", a: "遗传物质的基本单位" },
        ]);
        expect(issues[0]).toEqual([]);
        expect(issues[1]).toContain("duplicate-question");
    });

    it("多问题题面与明确模板残留会阻断", () => {
        expect(findAiCardGateIssues([{ q: "什么是 TCP？；什么是 UDP？", a: "传输层协议" }])[0]).toContain("multiple-questions");
        expect(findAiCardGateIssues([{ q: "什么是 TCP？", a: "{{answer}}" }])[0]).toContain("template-placeholder");
        expect(findAiCardGateIssues([{ q: "TODO 是什么？", a: "一种待办事项标记" }])[0]).not.toContain("template-placeholder");
        expect(findAiCardGateIssues([{ q: "什么是 TCP？", a: "TODO: fill answer" }])[0]).toContain("template-placeholder");
        expect(findAiCardGateIssues([{ q: "什么是 TCP？", a: "TCP 是一种传输协议" }])[0]).not.toContain("template-placeholder");
    });

    it("重复仅在当前勾选候选中计算，取消首张勾选会解锁剩余卡", () => {
        const candidates = [
            { q: "什么是 DNS？", a: "域名系统", keep: false, review: "pending" as const },
            { q: "什么是DNS", a: "域名系统", keep: true, review: "accepted" as const },
        ];
        expect(inspectAiCandidates(candidates)).toEqual([[], []]);
        expect(selectImportableAiCandidates(candidates)).toEqual([candidates[1]]);
    });

    it("preserves literal code syntax instead of classifying it as multiple questions or placeholders", () => {
        expect(findAiCardGateIssues([{ q: "`for (let i=0; i<3; i++)` 循环执行多少次？", a: "三次" }])[0]).toEqual([]);
        expect(findAiCardGateIssues([{ q: "模板字面量中的 `hello ${name}` 表示什么？", a: "变量插值" }])[0]).toEqual([]);
        expect(findAiCardGateIssues([{ q: "`a ? b : c` 与 `a?.b` 中的问号分别是什么语法？", a: "条件运算符与可选链" }])[0]).not.toContain("multiple-questions");
    });

    it("有阻断问题或结构问题时不能入库，普通评分提示不属于硬门禁", () => {
        const candidates = [
            { q: "TCP是什么；UDP是什么？", a: "传输协议", keep: true, review: "accepted" as const },
            { q: "  ", a: "答案", keep: true, review: "accepted" as const },
            { q: "为什么 TCP 使用三次握手？", a: "同步双方序列号", keep: true, review: "accepted" as const },
        ];
        expect(selectImportableAiCandidates(candidates)).toEqual([candidates[2]]);
    });
});
