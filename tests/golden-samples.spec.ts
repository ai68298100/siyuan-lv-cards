import { describe, expect, it } from "vitest";
import { estimateTokens, parseCards } from "../src/api/ai-parse";
import { lintAICards } from "../src/core/ai-lint";

// BU-20 黄金样本评测集（离线子集，v0.115.0）：
// 九类卡型的脱敏 fixture 钉死 parse/lint 行为——未来更换模型/提示词时，
// 本套断言即「输出契约回归基线」：任何解析口径变化都会在这里显式暴露。
// 真实模型的在线评测（G3-call 批量跑）仍归 BU-20 本条。

interface Golden {
    name: string;
    /** 模拟模型原始输出（含围栏/噪声等真实形态） */
    raw: string;
    /** 期望解析结果（parseCards 黄金值） */
    expect: { q: string; a: string; d?: number }[];
    /** 期望 lint 提示（lintAICards 黄金值；空=该样本应零告警通过） */
    lint?: string[][];
}

const GOLDENS: Golden[] = [
    {
        name: "问答（基础，围栏+噪声形态）",
        raw: '好的，以下是卡片：\n```json\n[{"q":"细胞的能量工厂是什么？","a":"线粒体"},{"q":"DNA 的中文全称？","a":"脱氧核糖核酸"}]\n```\n希望有帮助。',
        expect: [
            { q: "细胞的能量工厂是什么？", a: "线粒体" },
            { q: "DNA 的中文全称？", a: "脱氧核糖核酸" },
        ],
    },
    {
        name: "挖空（cloze 标记原样保留，判分归复习面）",
        raw: '[{"q":"线粒体是细胞的{{c1::能量工厂}}","a":"能量工厂"}]',
        expect: [{ q: "线粒体是细胞的{{c1::能量工厂}}", a: "能量工厂" }],
    },
    {
        name: "语言学习（词汇+例句，中英混排）",
        raw: '[{"q":"ubiquitous 是什么意思？例句：Smartphones are ___ devices.","a":"普遍存在的 adj."},{"q":"「 egalitarian 」的中文？","a":"平等主义的"}]',
        expect: [
            { q: "ubiquitous 是什么意思？例句：Smartphones are ___ devices.", a: "普遍存在的 adj." },
            { q: "「 egalitarian 」的中文？", a: "平等主义的" },
        ],
    },
    {
        name: "表格转问答（结构化事实拆解）",
        raw: '[{"q":"元素周期表中 Fe 的元素名？","a":"铁"},{"q":"元素周期表中 Au 的元素名？","a":"金"}]',
        expect: [
            { q: "元素周期表中 Fe 的元素名？", a: "铁" },
            { q: "元素周期表中 Au 的元素名？", a: "金" },
        ],
    },
    {
        name: "代码卡（缩进与符号逐字符保真，E-09 严格口径依赖）",
        raw: '[{"q":"以下代码输出什么？\\nfor (let i = 0; i < 2; i++) {\\n  console.log(i);\\n}","a":"0\\n1"}]',
        expect: [{ q: "以下代码输出什么？\nfor (let i = 0; i < 2; i++) {\n  console.log(i);\n}", a: "0\n1" }],
    },
    {
        name: "公式卡（LaTeX 原样保留，宽松判分不剥离反斜杠语义）",
        raw: '[{"q":"质能方程是什么？","a":"E = mc^2"},{"q":"欧拉恒等式？","a":"e^{i\\\\pi} + 1 = 0"}]',
        expect: [
            { q: "质能方程是什么？", a: "E = mc^2" },
            { q: "欧拉恒等式？", a: "e^{i\\pi} + 1 = 0" },
        ],
    },
    {
        name: "长材料（多事实拆解为多卡，d 难度标注有效）",
        raw: '[{"q":"光合作用光反应的场所？","a":"类囊体薄膜","d":1},{"q":"光合作用暗反应的场所？","a":"叶绿体基质","d":2}]',
        expect: [
            { q: "光合作用光反应的场所？", a: "类囊体薄膜", d: 1 },
            { q: "光合作用暗反应的场所？", a: "叶绿体基质", d: 2 },
        ],
    },
    {
        name: "冲突来源（同问题不同答案=两张独立卡，由用户裁决而非解析层合并）",
        raw: '[{"q":"光速是多少？","a":"约 3×10^8 m/s（真空）"},{"q":"光速是多少？","a":"约 2.998×10^8 m/s"}]',
        expect: [
            { q: "光速是多少？", a: "约 3×10^8 m/s（真空）" },
            { q: "光速是多少？", a: "约 2.998×10^8 m/s" },
        ],
    },
    {
        name: "脏输出（空卡/缺字段丢弃；坏难度标注丢标注不丢卡；字符串难度收敛）",
        raw: '[{"q":"","a":"有答无问"},{"a":"只有答案"},{"q":"有问无答"},{"q":"问题","a":"答案","d":9},{"q":"问题2","a":"答案2","d":"2"}]',
        expect: [
            { q: "问题", a: "答案" }, // d=9 越界：丢标注保留卡
            { q: "问题2", a: "答案2", d: 2 }, // d="2" 数字字符串收敛
        ],
    },
];

describe("BU-20 黄金样本：parseCards 九类卡型契约", () => {
    for (const g of GOLDENS) {
        it(`${g.name} → 黄金解析值`, () => {
            expect(parseCards(g.raw)).toEqual(g.expect);
        });
    }

    it("九类全量：黄金样本逐一过 lint，冲突样本按口径报 duplicate", () => {
        for (const g of GOLDENS) {
            const cards = parseCards(g.raw);
            const verdicts = lintAICards(cards);
            expect(verdicts).toHaveLength(cards.length);
            if (g.lint) {
                expect(verdicts).toEqual(g.lint);
            }
        }
        // 冲突来源样本（index 7）：同问不同答——normText 含 a，不判 duplicate（设计口径：冲突留给用户裁决）
        const conflictVerdicts = lintAICards(parseCards(GOLDENS[7].raw));
        expect(conflictVerdicts.flat()).not.toContain("duplicate");
    });
});

describe("BU-20 黄金样本：token 估算口径（上下文预算参考）", () => {
    it("九类样本 token 估算均为正且有界（<10000，防失控输入）", () => {
        for (const g of GOLDENS) {
            const t = estimateTokens(g.raw);
            expect(t).toBeGreaterThan(0);
            expect(t).toBeLessThan(10_000);
        }
    });
});
