/**
 * BI-40 学习成果导出与对比分析引擎（纯逻辑，node 可单测）。
 * 
 * 核心契约与安全原则：
 * 1. 双格式输出：Markdown 证书 + JSON 原始数据；
 * 2. 隐私零泄露：绝不输出卡片私有题面正文，仅保留知识概念标签与脱敏摘要；
 * 3. 防篡改签名：基于确定性哈希算法生成验真指纹；
 * 4. 薄弱点收敛排序：按失误次数降序排列，提供针对性复习建议。
 */

export type ExportFormat = "markdown" | "json";

/** 防篡改签名参数 */
export interface SignatureParams {
    goalId: string;
    completedAt: number;
    totalCards: number;
    retentionRate: number;
}

/** 防篡改签名生成器（轻量确定性哈希） */
export function generateTamperProofSignature(params: SignatureParams): string {
    const raw = `${params.goalId}|${params.completedAt}|${params.totalCards}|${Math.round(params.retentionRate * 100)}`;
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
        const char = raw.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0;
    }
    const hex = Math.abs(hash).toString(16).padStart(8, "0");
    return `sig-lv-${hex}`;
}

/** 验证防篡改签名真伪 */
export function verifyTamperProofSignature(cert: {
    goalId: string;
    completedAt: number;
    totalCardsMastered: number;
    overallRetentionRate: number;
    verificationSignature: string;
}): boolean {
    const expected = generateTamperProofSignature({
        goalId: cert.goalId,
        completedAt: cert.completedAt,
        totalCards: cert.totalCardsMastered,
        retentionRate: cert.overallRetentionRate,
    });
    return cert.verificationSignature === expected;
}

/** 薄弱点清单条目 */
export interface WeakPointItem {
    topicName: string;
    failureCount: number;
    forgetRate: number;
    remedyRecommendationKey: string;
}

/** 完整学习成果证明包 */
export interface AchievementExportBundleV2 {
    certificate: {
        certificateId: string;
        goalId: string;
        goalTitle: string;
        learnerAlias: string;
        completedAt: number;
        totalCardsMastered: number;
        studySpanDays: number;
        overallRetentionRate: number;
        verificationSignature: string;
    };
    weakPoints: WeakPointItem[];
    nextStepSuggestions: string[];
    exportedAt: number;
}

/**
 * 组装生成完整的学习成果证明包 V2（纯函数）
 */
export function generateAchievementExportBundleV2(params: {
    goalId: string;
    goalTitle: string;
    learnerAlias?: string;
    completedAt?: number;
    totalCardsMastered: number;
    studySpanDays: number;
    overallRetentionRate: number;
    weakPoints?: { topic: string; fails: number; total: number }[];
    now?: number;
}): AchievementExportBundleV2 {
    const ts = params.completedAt ?? (params.now ?? Date.now());
    const alias = params.learnerAlias ? params.learnerAlias.trim() : "闪卡终身学习者";
    const title = params.goalTitle.trim();

    const signature = generateTamperProofSignature({
        goalId: params.goalId,
        completedAt: ts,
        totalCards: params.totalCardsMastered,
        retentionRate: params.overallRetentionRate,
    });

    const cert = {
        certificateId: `cert-${ts}-${Math.random().toString(36).substring(2, 6)}`,
        goalId: params.goalId,
        goalTitle: title,
        learnerAlias: alias,
        completedAt: ts,
        totalCardsMastered: Math.max(0, params.totalCardsMastered),
        studySpanDays: Math.max(1, params.studySpanDays),
        overallRetentionRate: Math.max(0, Math.min(1, Math.round(params.overallRetentionRate * 100) / 100)),
        verificationSignature: signature,
    };

    // 梳理薄弱点清单（按失误次数降序）
    const weakPoints: WeakPointItem[] = (params.weakPoints || [])
        .filter(w => w.fails > 0)
        .map(w => ({
            topicName: w.topic.trim(),
            failureCount: w.fails,
            forgetRate: w.total > 0 ? Math.round((w.fails / w.total) * 100) / 100 : 1,
            remedyRecommendationKey: "achievementExport.remedy.periodicRecheck",
        }))
        .sort((a, b) => b.failureCount - a.failureCount);

    // 后续维护建议
    const suggestions: string[] = [
        "achievementExport.suggestion.maintainIntervals",
        "achievementExport.suggestion.focusOnWeakPoints",
    ];
    if (weakPoints.length > 0) {
        suggestions.push("achievementExport.suggestion.scheduleWeakPointDrill");
    }

    return {
        certificate: cert,
        weakPoints,
        nextStepSuggestions: suggestions,
        exportedAt: params.now ?? Date.now(),
    };
}

/** 格式化导出为正式可展示的 Markdown 证书文本 */
export function formatAchievementToMarkdownV2(bundle: AchievementExportBundleV2): string {
    const cert = bundle.certificate;
    const dateStr = new Date(cert.completedAt).toISOString().split("T")[0];

    const lines = [
        `# 🎓 学习目标达成与成果证明书`,
        `> 授予学习者：**${cert.learnerAlias}**`,
        `> 达成目标：**${cert.goalTitle}**`,
        `- 达成日期：${dateStr}`,
        `- 掌握卡片总数：${cert.totalCardsMastered} 张`,
        `- 学习周期跨度：${cert.studySpanDays} 天`,
        `- 综合记忆保持率：${Math.round(cert.overallRetentionRate * 100)}%`,
        `- 防伪验真指纹：\`${cert.verificationSignature}\``,
        "",
        `---`,
        `## ⚠️ 需持续关注的薄弱点清单（共 ${bundle.weakPoints.length} 项）`,
    ];

    for (const wp of bundle.weakPoints) {
        lines.push(`- **${wp.topicName}**：累计失误 ${wp.failureCount} 次（遗忘率 ${Math.round(wp.forgetRate * 100)}%）`);
    }

    lines.push("", `## 📌 后续维护建议`);
    for (const sug of bundle.nextStepSuggestions) {
        lines.push(`- ${sug}`);
    }

    return lines.join("\n");
}

/** 格式化导出为 JSON 原始数据 */
export function formatAchievementToJsonV2(bundle: AchievementExportBundleV2): string {
    return JSON.stringify({
        certificate: bundle.certificate,
        weakPoints: bundle.weakPoints,
        nextStepSuggestions: bundle.nextStepSuggestions,
        exportedAt: bundle.exportedAt,
    }, null, 2);
}
