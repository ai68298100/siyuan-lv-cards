/**
 * BU-1 AI 能力总地图 & BU-2 AI 行为风险分级契约（纯逻辑，Node 可单测）。
 * 
 * 1. BU-1 能力总地图：
 *    为捕获（capture）、澄清（clarify）、制卡（author）、练习（practice）、应用（apply）、维护（maintain）
 *    六种学习阶段登记 AI 能力。明确标注：
 *    - AI 可自主建议 / 辅助生成
 *    - 必须人工把关（Human-in-the-loop）
 *    - 明确禁止行为（Hard Prohibitions）
 *    - 失败替代路径（Fallback/No-AI Equivalent）
 *    - 是否影响思源内核（effectsKernel 恒 false——不篡改正式调度与评分）
 * 
 * 2. BU-2 行为风险分级：
 *    把只读检索、候选生成、单块写入、批量修改与调度建议分为四级风险：
 *    - read-only（低风险）：可直接执行，脱敏审计
 *    - candidate（中风险）：生成临时草稿，必须人工审阅
 *    - content-write（中高风险）：写入笔记/闪卡，必须预览与确认
 *    - batch-modify（高风险）：批量改动，必须逐项 diff、快照备份且支持撤销
 *    - kernel-scheduling（禁止级）：坚决阻断，AI 不得直接修改 due/rating/revlog！
 */

export const AI_LEARNING_MODES = [
    "capture",
    "clarify",
    "author",
    "practice",
    "apply",
    "maintain",
] as const;
export type AiLearningMode = (typeof AI_LEARNING_MODES)[number];

export const AI_RISK_LEVELS = [
    "read-only",
    "candidate",
    "content-write",
    "batch-modify",
    "kernel-scheduling",
] as const;
export type AiRiskLevel = (typeof AI_RISK_LEVELS)[number];

export type AiExecutionRole = "ai-assisted" | "human-mandatory" | "prohibited";

export interface AiCapabilitySpec {
    id: string;
    mode: AiLearningMode;
    nameKey: string;
    descriptionKey: string;
    riskLevel: AiRiskLevel;
    /** AI 在该能力中的角色界限 */
    aiRole: AiExecutionRole;
    /** 人工在其中的不可替代职责 */
    humanRoleKey: string;
    /** 明确禁止的违规行为 */
    prohibitedActions: string[];
    /** 失败或停用时的无 AI 替代流程键（对齐 BU-40） */
    fallbackAltKey: string;
    /** 是否会直接修改内核/FSRS 调度（契约原则：恒为 false） */
    effectsKernel: false;
}

export interface AiRiskEvaluation {
    riskLevel: AiRiskLevel;
    /** 是否需要用户显式确认 */
    requiresConfirmation: boolean;
    /** 是否需要提供变更前预览（Diff/Preview） */
    requiresPreview: boolean;
    /** 是否支持安全撤销（Rollback/Undo） */
    supportsUndo: boolean;
    /** 是否属于被阻断的违规高危动作 */
    isBlocked: boolean;
    /** 阻断或处理理由多语言键 */
    verdictKey: string;
    /** 验收硬性事实源断言：AI 绝不能直接篡改 FSRS 调度或评分 */
    neverDirectlyModifiesKernel: true;
}

/** 全局 AI 能力注册清单（单一事实源） */
export const AI_CAPABILITY_REGISTRY: readonly AiCapabilitySpec[] = [
    // 1. 材料捕获（capture）
    {
        id: "cap-material-extract",
        mode: "capture",
        nameKey: "aiCapability.extract.name",
        descriptionKey: "aiCapability.extract.desc",
        riskLevel: "read-only",
        aiRole: "ai-assisted",
        humanRoleKey: "aiCapability.extract.humanRole",
        prohibitedActions: ["silent-exfiltration", "extract-sensitive-notebooks"],
        fallbackAltKey: "aiEquiv.alt.cards-generate.1",
        effectsKernel: false,
    },
    // 2. 概念澄清（clarify）
    {
        id: "cla-concept-explain",
        mode: "clarify",
        nameKey: "aiCapability.clarify.name",
        descriptionKey: "aiCapability.clarify.desc",
        riskLevel: "candidate",
        aiRole: "ai-assisted",
        humanRoleKey: "aiCapability.clarify.humanRole",
        prohibitedActions: ["hallucinate-facts-as-truth", "write-to-revlog"],
        fallbackAltKey: "aiEquiv.alt.cards-generate.2",
        effectsKernel: false,
    },
    // 3. 闪卡生成（author）
    {
        id: "aut-cards-generate",
        mode: "author",
        nameKey: "aiCapability.generate.name",
        descriptionKey: "aiCapability.generate.desc",
        riskLevel: "content-write",
        aiRole: "ai-assisted",
        humanRoleKey: "aiCapability.generate.humanRole",
        prohibitedActions: ["direct-db-injection", "bypass-quality-gate", "auto-commit-unreviewed"],
        fallbackAltKey: "aiEquiv.alt.cards-generate.1",
        effectsKernel: false,
    },
    // 4. 练习辅助（practice）
    {
        id: "pra-hint-derivation",
        mode: "practice",
        nameKey: "aiCapability.hint.name",
        descriptionKey: "aiCapability.hint.desc",
        riskLevel: "candidate",
        aiRole: "ai-assisted",
        humanRoleKey: "aiCapability.hint.humanRole",
        prohibitedActions: ["auto-rate-card", "leak-full-answer-early"],
        fallbackAltKey: "aiEquiv.alt.repair-drill",
        effectsKernel: false,
    },
    // 5. 迁移应用（apply）
    {
        id: "app-counter-example",
        mode: "apply",
        nameKey: "aiCapability.counterExample.name",
        descriptionKey: "aiCapability.counterExample.desc",
        riskLevel: "candidate",
        aiRole: "ai-assisted",
        humanRoleKey: "aiCapability.counterExample.humanRole",
        prohibitedActions: ["override-user-judgment", "force-practice-schedule"],
        fallbackAltKey: "aiEquiv.alt.repair-drill",
        effectsKernel: false,
    },
    // 6. 维护改写（maintain）
    {
        id: "mai-leech-rewrite",
        mode: "maintain",
        nameKey: "aiCapability.rewrite.name",
        descriptionKey: "aiCapability.rewrite.desc",
        riskLevel: "batch-modify",
        aiRole: "ai-assisted",
        humanRoleKey: "aiCapability.rewrite.humanRole",
        prohibitedActions: ["batch-overwrite-without-diff", "destroy-original-markdown"],
        fallbackAltKey: "aiEquiv.alt.leech-rewrite.1",
        effectsKernel: false,
    },
    // 7. 调度篡改（prohibited 样例规范）
    {
        id: "pro-kernel-scheduler-tamper",
        mode: "practice",
        nameKey: "aiCapability.schedulerTamper.name",
        descriptionKey: "aiCapability.schedulerTamper.desc",
        riskLevel: "kernel-scheduling",
        aiRole: "prohibited",
        humanRoleKey: "aiCapability.schedulerTamper.humanRole",
        prohibitedActions: ["tamper-due-dates", "fake-fsrs-stability", "bypass-siyuan-ratings"],
        fallbackAltKey: "aiEquiv.loss.no-ai",
        effectsKernel: false,
    },
];

/** 根据能力 ID 获取能力规范 */
export function getAiCapabilitySpec(id: string): AiCapabilitySpec | null {
    return AI_CAPABILITY_REGISTRY.find(item => item.id === id) ?? null;
}

/** 查询特定学习模式下的全部能力 */
export function getAiCapabilitiesByMode(mode: AiLearningMode): AiCapabilitySpec[] {
    return AI_CAPABILITY_REGISTRY.filter(item => item.mode === mode);
}

/**
 * BU-2 行为风险分级评估函数（纯函数）
 * 严格评估动作风险，给出确认、预览、撤销与阻断指令。
 */
export function evaluateAiActionRisk(actionRisk: AiRiskLevel): AiRiskEvaluation {
    switch (actionRisk) {
        case "read-only":
            return {
                riskLevel: "read-only",
                requiresConfirmation: false,
                requiresPreview: false,
                supportsUndo: false,
                isBlocked: false,
                verdictKey: "aiRisk.verdict.readOnlyAllowed",
                neverDirectlyModifiesKernel: true,
            };
        case "candidate":
            return {
                riskLevel: "candidate",
                requiresConfirmation: true,
                requiresPreview: true,
                supportsUndo: true,
                isBlocked: false,
                verdictKey: "aiRisk.verdict.candidateReviewRequired",
                neverDirectlyModifiesKernel: true,
            };
        case "content-write":
            return {
                riskLevel: "content-write",
                requiresConfirmation: true,
                requiresPreview: true,
                supportsUndo: true,
                isBlocked: false,
                verdictKey: "aiRisk.verdict.writeExplicitConsentRequired",
                neverDirectlyModifiesKernel: true,
            };
        case "batch-modify":
            return {
                riskLevel: "batch-modify",
                requiresConfirmation: true,
                requiresPreview: true,
                supportsUndo: true,
                isBlocked: false,
                verdictKey: "aiRisk.verdict.batchDiffAndRollbackRequired",
                neverDirectlyModifiesKernel: true,
            };
        case "kernel-scheduling":
        default:
            return {
                riskLevel: "kernel-scheduling",
                requiresConfirmation: false,
                requiresPreview: false,
                supportsUndo: false,
                isBlocked: true,
                verdictKey: "aiRisk.verdict.schedulingTamperStrictlyBlocked",
                neverDirectlyModifiesKernel: true,
            };
    }
}
