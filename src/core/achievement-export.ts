/**
 * BI-21 学习成果导出、资质证明与薄弱点清单引擎（纯逻辑，node 可单测）。
 * 
 * 核心契约与安全原则：
 * 1. 成果证明包含四项要素：达标证明（Attestation）、脱敏复习日志（Sanitized Logs）、薄弱点清单（Weak Points）、后续维护建议（Next Steps）；
 * 2. 隐私零泄露原则：绝不泄露思源私有笔记正文，仅导出知识概念标签与题面摘要；
 * 3. 独立可验真：基于核心事实字段生成确定性防篡改验真指纹（Attestation Checksum）；
 * 4. 纯函数设计，数据不可变隔离。
 */

import { sanitizeSensitiveText } from "./audit-log";

/** 目标达成证明明细 */
export interface AttestationCertificate {
    certificateId: string;
    goalId: string;
    goalTitle: string;
    learnerAlias: string;
    completedAt: number;
    totalCardsMastered: number;
    studySpanDays: number;
    overallRetentionRate: number; // 0 ~ 1.0
    /** 防篡改验真签名（确定性哈希） */
    verificationSignature: string;
}

/** 薄弱点清单条目 */
export interface WeakPointItem {
    topicName: string;
    failureCount: number;
    forgetRate: number;
    remedyRecommendationKey: string;
}

/** 脱敏复习日志条目 */
export interface SanitizedStudyLogEntry {
    dateIso: string;
    cardsReviewed: number;
    retentionRate: number;
    durationMinutes: number;
}

/** 完整学习成果证明包 */
export interface AchievementExportBundle {
    certificate: AttestationCertificate;
    sanitizedLogs: SanitizedStudyLogEntry[];
    weakPoints: WeakPointItem[];
    nextStepSuggestions: string[];
    exportedAt: number;
}

/**
 * 生成轻量确定性验真签名（纯字符串哈希算法，不依赖外部大型加密库）
 */
export function generateAttestationSignature(params: {
    goalId: string;
    completedAt: number;
    totalCards: number;
    retentionRate: number;
}): string {
    const raw = `${params.goalId}|${params.completedAt}|${params.totalCards}|${Math.round(params.retentionRate * 100)}`;
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
        const char = raw.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0; // 转换为 32 位有符号整数
    }
    const hex = Math.abs(hash).toString(16).padStart(8, "0");
    return `sig-lv-${hex}`;
}

/**
 * 校验学习成果证明的签名真实性（防篡改验证）
 */
export function verifyAttestationSignature(cert: AttestationCertificate): boolean {
    const expected = generateAttestationSignature({
        goalId: cert.goalId,
        completedAt: cert.completedAt,
        totalCards: cert.totalCardsMastered,
        retentionRate: cert.overallRetentionRate,
    });
    return cert.verificationSignature === expected;
}

/**
 * 组装生成完整的学习成果证明包（纯函数）
 */
export function generateAchievementExportBundle(params: {
    goalId: string;
    goalTitle: string;
    learnerAlias?: string;
    completedAt?: number;
    totalCardsMastered: number;
    studySpanDays: number;
    overallRetentionRate: number;
    rawLogs?: { timestamp: number; rating: number; durationMs?: number }[];
    weakPoints?: { topic: string; fails: number; total: number }[];
    now?: number;
}): AchievementExportBundle {
    const ts = params.completedAt ?? (params.now ?? Date.now());
    const alias = params.learnerAlias ? sanitizeSensitiveText(params.learnerAlias, 20) : "闪卡终身学习者";
    const title = sanitizeSensitiveText(params.goalTitle, 60);

    const signature = generateAttestationSignature({
        goalId: params.goalId,
        completedAt: ts,
        totalCards: params.totalCardsMastered,
        retentionRate: params.overallRetentionRate,
    });

    const cert: AttestationCertificate = {
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

    // 1. 脱敏并按日聚合复习日志（绝不输出卡片私有题面与私有笔记）
    const logsByDate: Record<string, { count: number; success: number; durationMs: number }> = {};
    for (const log of params.rawLogs || []) {
        const dateIso = new Date(log.timestamp).toISOString().split("T")[0];
        if (!logsByDate[dateIso]) {
            logsByDate[dateIso] = { count: 0, success: 0, durationMs: 0 };
        }
        logsByDate[dateIso].count++;
        if (log.rating >= 3) logsByDate[dateIso].success++;
        logsByDate[dateIso].durationMs += (log.durationMs || 1000);
    }

    const sanitizedLogs: SanitizedStudyLogEntry[] = Object.entries(logsByDate)
        .map(([dateIso, stat]) => ({
            dateIso,
            cardsReviewed: stat.count,
            retentionRate: stat.count > 0 ? Math.round((stat.success / stat.count) * 100) / 100 : 0,
            durationMinutes: Math.max(1, Math.round(stat.durationMs / 1000)),
        }))
        .sort((a, b) => a.dateIso.localeCompare(b.dateIso));

    // 2. 梳理薄弱点清单
    const weakPoints: WeakPointItem[] = (params.weakPoints || [])
        .filter(w => w.fails > 0)
        .map(w => ({
            topicName: sanitizeSensitiveText(w.topic, 40),
            failureCount: w.fails,
            forgetRate: w.total > 0 ? Math.round((w.fails / w.total) * 100) / 100 : 1,
            remedyRecommendationKey: "achievementExport.remedy.periodicRecheck",
        }))
        .sort((a, b) => b.failureCount - a.failureCount);

    // 3. 后续维护建议
    const suggestions: string[] = [
        "achievementExport.suggestion.maintainIntervals",
        "achievementExport.suggestion.focusOnWeakPoints",
    ];
    if (weakPoints.length > 0) {
        suggestions.push("achievementExport.suggestion.scheduleWeakPointDrill");
    }

    return {
        certificate: cert,
        sanitizedLogs,
        weakPoints,
        nextStepSuggestions: suggestions,
        exportedAt: params.now ?? Date.now(),
    };
}

/** 格式化导出为正式可展示的 Markdown 证书与报告文本 */
export function formatAchievementToMarkdown(bundle: AchievementExportBundle): string {
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
        `## 🛡️ 诚实学习轨迹与脱敏日志（共 ${bundle.sanitizedLogs.length} 天复习记录）`,
        `| 日期 | 复习卡数 | 当日保持率 | 投入时长 (分) |`,
        `| :--- | :--- | :--- | :--- |`,
    ];

    for (const log of bundle.sanitizedLogs) {
        lines.push(`| ${log.dateIso} | ${log.cardsReviewed} | ${Math.round(log.retentionRate * 100)}% | ${log.durationMinutes} |`);
    }

    if (bundle.weakPoints.length > 0) {
        lines.push("", `## ⚠️ 需持续关注的薄弱点清单（共 ${bundle.weakPoints.length} 项）`);
        for (const wp of bundle.weakPoints) {
            lines.push(`- **${wp.topicName}**：累计失误 ${wp.failureCount} 次（遗忘率 ${Math.round(wp.forgetRate * 100)}%）`);
        }
    }

    return lines.join("\n");
}
