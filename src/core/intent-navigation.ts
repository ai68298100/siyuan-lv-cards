/**
 * BL-1 统一功能搜索与目标意图导航引擎（纯逻辑，node 可单测）。
 * 
 * 核心契约与安全原则：
 * 1. 意图驱动：按“我想记住（memorize）/ 我想理解（understand）/ 我想应用（apply）/ 我想维护（maintain）”四大核心意图归类；
 * 2. 状态分层：验收硬性要求——当前可用（available）、前置依赖（prerequisite-needed）、后置阶段（subsequent）、替代方案（alternative）四态清晰分开；
 * 3. 任何外部 AI 功能均登记离线/手工替代入口（如无 AI 等价制卡、手工规则等），杜绝入口死锁；
 * 4. 纯函数设计，支持多维度意图检索与关键词模糊匹配。
 */

export const LEARNING_INTENTS = ["memorize", "understand", "apply", "maintain"] as const;
export type UserLearningIntent = (typeof LEARNING_INTENTS)[number];

export const AVAILABILITY_STATUSES = [
    "available",
    "prerequisite-needed",
    "subsequent",
    "alternative",
] as const;
export type FeatureAvailability = (typeof AVAILABILITY_STATUSES)[number];

/** 导航动作类型 */
export type FeatureRouteType = "tab" | "dialog" | "command" | "external";

/** 意图功能注册项定义 */
export interface IntentFeatureItem {
    id: string;
    /** 主归属意图 */
    primaryIntent: UserLearningIntent;
    /** 兼顾的辅助意图 */
    secondaryIntents?: UserLearningIntent[];
    /** 名称多语言键 */
    nameKey: string;
    /** 描述多语言键 */
    descKey: string;
    /** 导航目标类型 */
    routeType: FeatureRouteType;
    /** 路由目的地标识 */
    routeTarget: string;
    /** 默认可用性状态 */
    availability: FeatureAvailability;
    /** 前置条件说明多语言键（当 status=prerequisite-needed 时） */
    prerequisiteKey?: string;
    /** 离线/手工替代入口多语言键（当无模型或无网络时） */
    alternativeFallbackKey?: string;
    /** 关键词列表（中英及常见口语搜索词） */
    keywords: string[];
}

/** 意图搜索上下文状态（由宿主提供，用于动态判定功能是否满足前置条件） */
export interface IntentSearchContext {
    totalCardsCount?: number;
    dueCardsCount?: number;
    hasActiveGoals?: boolean;
    hasExams?: boolean;
    hasBrokenCards?: boolean;
    aiConfigured?: boolean;
}

/** 意图功能检索结果集（严格四态分层） */
export interface IntentSearchResult {
    query: string;
    selectedIntent?: UserLearningIntent;
    /** 当前直接可用功能 */
    available: IntentFeatureItem[];
    /** 需前置条件/准备后可用的功能 */
    prerequisiteNeeded: IntentFeatureItem[];
    /** 进阶与后置阶段功能 */
    subsequent: IntentFeatureItem[];
    /** 离线/无模型手工替代功能 */
    alternatives: IntentFeatureItem[];
    totalMatched: number;
}

/** 全量功能意图注册表（单一事实源） */
export const INTENT_FEATURE_REGISTRY: readonly IntentFeatureItem[] = [
    // ---------------- memorize (我想记住) ----------------
    {
        id: "quick-qa-card",
        primaryIntent: "memorize",
        nameKey: "intentNav.feature.quickQa.name",
        descKey: "intentNav.feature.quickQa.desc",
        routeType: "dialog",
        routeTarget: "dialog:quick-card",
        availability: "available",
        keywords: ["快速制卡", "问答卡", "新建卡片", "记背", "quick card", "qa"],
    },
    {
        id: "cloze-card-maker",
        primaryIntent: "memorize",
        nameKey: "intentNav.feature.cloze.name",
        descKey: "intentNav.feature.cloze.desc",
        routeType: "command",
        routeTarget: "command:marker-scan",
        availability: "available",
        keywords: ["挖空制卡", "高亮制卡", "cloze", "填空", "划线记忆"],
    },
    {
        id: "occlusion-card-maker",
        primaryIntent: "memorize",
        nameKey: "intentNav.feature.occlusion.name",
        descKey: "intentNav.feature.occlusion.desc",
        routeType: "dialog",
        routeTarget: "dialog:occlusion-editor",
        availability: "available",
        keywords: ["图片遮挡", "遮挡制卡", "遮图", "image occlusion", "解剖图"],
    },
    {
        id: "fsrs-focus-review",
        primaryIntent: "memorize",
        nameKey: "intentNav.feature.focusReview.name",
        descKey: "intentNav.feature.focusReview.desc",
        routeType: "tab",
        routeTarget: "hub:review",
        availability: "available",
        prerequisiteKey: "intentNav.prereq.needDueCards",
        keywords: ["专注复习", "今日复习", "FSRS", "艾宾浩斯", "间隔重复", "review", "due"],
    },
    {
        id: "type-in-drill",
        primaryIntent: "memorize",
        nameKey: "intentNav.feature.typeInDrill.name",
        descKey: "intentNav.feature.typeInDrill.desc",
        routeType: "tab",
        routeTarget: "hub:review:typing",
        availability: "available",
        keywords: ["打字练习", "默写", "拼写检查", "精确记忆", "type in", "spelling"],
    },
    // ---------------- understand (我想理解) ----------------
    {
        id: "atomic-fact-split",
        primaryIntent: "understand",
        secondaryIntents: ["memorize"],
        nameKey: "intentNav.feature.atomicSplit.name",
        descKey: "intentNav.feature.atomicSplit.desc",
        routeType: "dialog",
        routeTarget: "dialog:ai-wizard:atomic-split",
        availability: "available",
        alternativeFallbackKey: "intentNav.alt.manualSplit",
        keywords: ["原子拆解", "知识细化", "长笔记拆卡", "概念拆分", "atomic split"],
    },
    {
        id: "word-sense-variants",
        primaryIntent: "understand",
        nameKey: "intentNav.feature.wordSense.name",
        descKey: "intentNav.feature.wordSense.desc",
        routeType: "dialog",
        routeTarget: "dialog:ai-wizard:word-sense-variants",
        availability: "available",
        alternativeFallbackKey: "intentNav.alt.manualBidiCard",
        keywords: ["词义辨析", "同形异义", "一词多义", "多义词", "word sense"],
    },
    {
        id: "card-relations-map",
        primaryIntent: "understand",
        nameKey: "intentNav.feature.relationsMap.name",
        descKey: "intentNav.feature.relationsMap.desc",
        routeType: "dialog",
        routeTarget: "dialog:card-relations",
        availability: "available",
        keywords: ["卡片关系", "先修前置", "反例对比", "知识图谱", "relations"],
    },
    {
        id: "socratic-coach-guide",
        primaryIntent: "understand",
        nameKey: "intentNav.feature.socraticCoach.name",
        descKey: "intentNav.feature.socraticCoach.desc",
        routeType: "dialog",
        routeTarget: "dialog:ai-wizard:socratic-coach",
        availability: "subsequent",
        alternativeFallbackKey: "intentNav.alt.hintLadder",
        keywords: ["苏格拉底教练", "启发引导", "深度理解", "自主推导", "socratic"],
    },
    // ---------------- apply (我想应用) ----------------
    {
        id: "timed-challenge-mode",
        primaryIntent: "apply",
        nameKey: "intentNav.feature.timedChallenge.name",
        descKey: "intentNav.feature.timedChallenge.desc",
        routeType: "dialog",
        routeTarget: "dialog:challenge-mode",
        availability: "available",
        prerequisiteKey: "intentNav.prereq.needCardsInDeck",
        keywords: ["限时挑战", "快速作答", "实战模拟", "反应速度", "challenge mode"],
    },
    {
        id: "pairing-game-mode",
        primaryIntent: "apply",
        nameKey: "intentNav.feature.pairingGame.name",
        descKey: "intentNav.feature.pairingGame.desc",
        routeType: "dialog",
        routeTarget: "dialog:pairing-game",
        availability: "available",
        prerequisiteKey: "intentNav.prereq.needCardsInDeck",
        keywords: ["配对游戏", "卡片连连看", "趣味练习", "概念配对", "pairing game"],
    },
    {
        id: "exam-sprint-plan",
        primaryIntent: "apply",
        nameKey: "intentNav.feature.examSprint.name",
        descKey: "intentNav.feature.examSprint.desc",
        routeType: "tab",
        routeTarget: "hub:exam",
        availability: "available",
        keywords: ["考试冲刺", "备考计划", "组卷刷题", "考研考证", "exam sprint"],
    },
    {
        id: "error-cause-probe",
        primaryIntent: "apply",
        secondaryIntents: ["maintain"],
        nameKey: "intentNav.feature.errorProbe.name",
        descKey: "intentNav.feature.errorProbe.desc",
        routeType: "dialog",
        routeTarget: "dialog:ai-wizard:error-cause-probe",
        availability: "subsequent",
        alternativeFallbackKey: "intentNav.alt.leechRewriteManual",
        keywords: ["错因追问", "错题排查", "根因分析", "失分原因", "error probe"],
    },
    // ---------------- maintain (我想维护) ----------------
    {
        id: "maintenance-debt-hub",
        primaryIntent: "maintain",
        nameKey: "intentNav.feature.maintenanceHub.name",
        descKey: "intentNav.feature.maintenanceHub.desc",
        routeType: "tab",
        routeTarget: "hub:maintenance",
        availability: "available",
        keywords: ["维护债务", "坏卡修复", "重复卡", "题面泄露", "过时卡片", "maintenance"],
    },
    {
        id: "return-simulation-tool",
        primaryIntent: "maintain",
        nameKey: "intentNav.feature.returnSim.name",
        descKey: "intentNav.feature.returnSim.desc",
        routeType: "dialog",
        routeTarget: "dialog:return-simulation",
        availability: "available",
        keywords: ["返场模拟", "积压削峰", "长期返场", "阶段封存", "平滑重建", "return simulation"],
    },
    {
        id: "user-audit-log",
        primaryIntent: "maintain",
        nameKey: "intentNav.feature.auditLog.name",
        descKey: "intentNav.feature.auditLog.desc",
        routeType: "dialog",
        routeTarget: "dialog:audit-log",
        availability: "available",
        keywords: ["审计日志", "操作对账", "修改记录", "脱敏导出", "audit log"],
    },
    {
        id: "consent-permission-center",
        primaryIntent: "maintain",
        nameKey: "intentNav.feature.consentCenter.name",
        descKey: "intentNav.feature.consentCenter.desc",
        routeType: "dialog",
        routeTarget: "dialog:consent-center",
        availability: "available",
        keywords: ["同意中心", "权限管理", "隐私设置", "一键撤销", "consent center"],
    },
];

/**
 * 意图驱动功能搜索与分层判定（纯函数）：
 * - 支持按主意图/兼顾意图过滤；
 * - 支持关键词/名称/描述全文模糊检索；
 * - 结合当前宿主上下文（如是否有到期卡、是否有坏卡、是否配置AI）动态调整可用性与替代方案。
 */
export function searchIntentFeatures(
    query: string = "",
    targetIntent?: UserLearningIntent,
    context?: IntentSearchContext,
    registry: readonly IntentFeatureItem[] = INTENT_FEATURE_REGISTRY,
): IntentSearchResult {
    const q = query.trim().toLowerCase();

    // 1. 意图与关键词初筛
    let matches = registry.filter(item => {
        if (targetIntent && item.primaryIntent !== targetIntent && !item.secondaryIntents?.includes(targetIntent)) {
            return false;
        }

        if (!q) return true;

        const matchId = item.id.toLowerCase().includes(q);
        const matchKeyword = item.keywords.some(k => k.toLowerCase().includes(q));
        const matchRoute = item.routeTarget.toLowerCase().includes(q);

        return matchId || matchKeyword || matchRoute;
    });

    const available: IntentFeatureItem[] = [];
    const prerequisiteNeeded: IntentFeatureItem[] = [];
    const subsequent: IntentFeatureItem[] = [];
    const alternatives: IntentFeatureItem[] = [];

    // 2. 结合运行时上下文动态分层
    for (const item of matches) {
        let dynamicAvailability = item.availability;

        if (context) {
            // 上下文感知调整
            if (item.id === "fsrs-focus-review" && context.dueCardsCount !== undefined && context.dueCardsCount === 0) {
                dynamicAvailability = "prerequisite-needed";
            }
            if ((item.id === "timed-challenge-mode" || item.id === "pairing-game-mode") &&
                context.totalCardsCount !== undefined && context.totalCardsCount === 0) {
                dynamicAvailability = "prerequisite-needed";
            }
            if (item.routeTarget.includes("ai-wizard") && context.aiConfigured === false) {
                // 未配置 AI 时自动归入 alternative 手工打法层
                dynamicAvailability = "alternative";
            }
        }

        if (dynamicAvailability === "available") {
            available.push(item);
        } else if (dynamicAvailability === "prerequisite-needed") {
            prerequisiteNeeded.push(item);
        } else if (dynamicAvailability === "subsequent") {
            subsequent.push(item);
        } else {
            alternatives.push(item);
        }
    }

    return {
        query: q,
        selectedIntent: targetIntent,
        available,
        prerequisiteNeeded,
        subsequent,
        alternatives,
        totalMatched: matches.length,
    };
}
