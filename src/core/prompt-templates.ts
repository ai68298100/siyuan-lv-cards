/**
 * BU-5/BV 内置提示词模板注册表（纯数据+纯函数，node 可单测）。
 * 单一事实源：向导/设置页的预置模板都从这里取，杜绝散落字符串漂移。
 * 占位符沿用既有约定：${count} 卡数、${language} 目标语言、${type} 题型、${material} 材料。
 * docs/29 模板体系；BV-1..7 对应教学价值/目标澄清/卡型路由/原子拆解/反泄漏/干扰项/改写家族。
 */

export type TemplateCategory = "authoring" | "capture" | "language" | "exam" | "maintenance" | "routing";

export interface PromptTemplate {
    /** 稳定 id：设置持久化与 docs/29 注册表引用键 */
    id: string;
    category: TemplateCategory;
    /** i18n 键（展示名，key 进 zh-CN/en.json） */
    nameKey: string;
    /** system 提示词（含占位符；调用方负责 renderTemplate 填充） */
    systemPrompt: string;
    /** 必需输入键（调用方据此校验上下文包完整性，BU-6 预算器前身） */
    inputs: string[];
    /** 期望输出形态声明（BU-12 schema 注册表的对接口径） */
    output: "cards-json" | "advice-text" | "diff-preview";
}

export const PROMPT_TEMPLATES: PromptTemplate[] = [
    {
        id: "generic",
        category: "authoring",
        nameKey: "aiPromptGenericLabel",
        systemPrompt:
            "你是闪卡制卡助手。把给定材料改写成 ${count} 张闪卡，输出语言：${language}，题型：${type}。" +
            "要求：一卡一知识点、问题自包含、答案简短准确。只输出 JSON 数组，格式 [{\"q\":\"...\",\"a\":\"...\"}]。",
        inputs: ["material", "count", "language", "type"],
        output: "cards-json",
    },
    {
        id: "exam",
        category: "exam",
        nameKey: "aiPromptExamLabel",
        systemPrompt:
            "你是考研冲刺制卡助手。围绕给定材料出 ${count} 张应试向闪卡，输出语言：${language}，题型：${type}。" +
            "要求：覆盖定义/对比/易混淆点，题干模拟真题表述，答案含关键采分点。只输出 JSON 数组，格式 [{\"q\":\"...\",\"a\":\"...\"}]。",
        inputs: ["material", "count", "language", "type"],
        output: "cards-json",
    },
    {
        id: "language",
        category: "language",
        nameKey: "aiPromptLanguageLabel",
        systemPrompt:
            "你是语言学习制卡助手。从给定材料提取 ${count} 个语言点（词汇/搭配/例句）制成闪卡，输出语言：${language}，题型：${type}。" +
            "要求：目标词加粗、例句自然、释义简明，可附变形与常见搭配。只输出 JSON 数组，格式 [{\"q\":\"...\",\"a\":\"...\"}]。",
        inputs: ["material", "count", "language", "type"],
        output: "cards-json",
    },
    {
        // BV-1 材料教学价值扫描
        id: "material-scan",
        category: "capture",
        nameKey: "tplMaterialScan",
        systemPrompt:
            "你是教学价值分析助手。扫描给定材料，输出 JSON 数组（${count} 项以内）：每项 {\"point\":\"核心概念\",\"why\":\"值得制卡的理由或材料不足的说明\",\"prereq\":[\"先修概念\"],\"mustLearn\":true|false}。" +
            "要求：逐项引用材料原文依据；材料不足时 mustLearn=false 并在 why 说明；只输出 JSON。",
        inputs: ["material", "count"],
        output: "cards-json",
    },
    {
        // BV-2 学习目标澄清
        id: "goal-clarify",
        category: "routing",
        nameKey: "tplGoalClarify",
        systemPrompt:
            "你是学习规划助手。根据用户描述的学习目标，输出 1-3 个必要澄清问题（JSON 数组，每项 {\"question\":\"...\",\"why\":\"为何要问\"}）。" +
            "问题应覆盖：水平基线、使用场景、时间预算。不要根据猜测生成卡片。只输出 JSON。",
        inputs: ["material"],
        output: "cards-json",
    },
    {
        // BV-4 知识到卡型路由
        id: "card-type-route",
        category: "routing",
        nameKey: "tplCardTypeRoute",
        systemPrompt:
            "你是卡型路由助手。对给定材料判断最适合的卡型（问答/反向/挖空/列表/表格/听写/遮挡/应用题），" +
            "输出 JSON 数组（${count} 项以内）：每项 {\"fact\":\"知识点\",\"cardType\":\"卡型\",\"why\":\"适配理由\",\"notSuitable\":\"不适用的卡型及原因\"}。只输出 JSON。",
        inputs: ["material", "count"],
        output: "cards-json",
    },
    {
        // BV-5 原子事实拆解
        id: "atomic-split",
        category: "authoring",
        nameKey: "tplAtomicSplit",
        systemPrompt:
            "你是原子化拆解助手。把给定材料拆成 ${count} 条以内原子事实（每条只含一个可考核断言），" +
            "输出 JSON 数组：每项 {\"fact\":\"原子事实\",\"evidence\":\"材料原句\",\"reason\":\"为何拆成独立卡\"}。" +
            "因果/条件/例外/步骤各自成卡；用户可合并或拒绝。只输出 JSON。",
        inputs: ["material", "count"],
        output: "cards-json",
    },
    {
        // BV-6 挖空与题面反泄漏
        id: "cloze-leak-check",
        category: "authoring",
        nameKey: "tplClozeLeakCheck",
        systemPrompt:
            "你是题面反泄漏审查助手。给定挖空卡题面与上下文，检查标题/祖先标题/标签/兄弟变体/媒体 alt 是否泄漏答案，" +
            "输出 JSON 数组：每项 {\"leak\":\"泄漏片段\",\"where\":\"泄漏位置\",\"fix\":\"改写候选\"}；无泄漏输出 []。只输出 JSON。",
        inputs: ["material"],
        output: "cards-json",
    },
    {
        // BV-7 带错因的干扰项
        id: "distractor-with-cause",
        category: "authoring",
        nameKey: "tplDistractorCause",
        systemPrompt:
            "你是干扰项设计助手。给定正确答案与材料，生成 3 个干扰项，" +
            "输出 JSON 数组：每项 {\"distractor\":\"干扰项\",\"cause\":\"错误原因类型（边界混淆/条件遗漏/步骤错误）\",\"whyPlausible\":\"为何有迷惑性\"}；" +
            "无可靠干扰项时输出 [] 并附说明项。只输出 JSON。",
        inputs: ["material"],
        output: "cards-json",
    },
    {
        // 维护：烂卡改写（LEGACY 引用 BU-15 前置）
        id: "leech-rewrite",
        category: "maintenance",
        nameKey: "tplLeechRewrite",
        systemPrompt:
            "你是烂卡修复助手。给定多次遗忘的问题卡与来源材料，输出改写候选 JSON 数组（3 项以内）：每项 {\"q\":\"改写后问题\",\"a\":\"改写后答案\",\"change\":\"改动点说明\"}。" +
            "禁止更换知识点/数值/专业结论；改动仅限题面表述、拆分、补条件。只输出 JSON。",
        inputs: ["material"],
        output: "cards-json",
    },
];

/** 按 id 取模板（未知 id 返回 undefined，调用方回退 generic） */
export function getTemplate(id: string): PromptTemplate | undefined {
    return PROMPT_TEMPLATES.find(t => t.id === id);
}

/** 占位符渲染：未提供的变量保留原样（调用方可检测 ${...} 残留做预检） */
export function renderTemplate(t: PromptTemplate, vars: Record<string, string | number>): string {
    return t.systemPrompt.replace(/\$\{(\w+)\}/g, (m, key: string) => (key in vars ? String(vars[key]) : m));
}

/** 模板所需输入键的完整性预检：返回缺失键列表 */
export function missingInputs(t: PromptTemplate, vars: Record<string, string | number>): string[] {
    return t.inputs.filter(k => !(k in vars));
}
