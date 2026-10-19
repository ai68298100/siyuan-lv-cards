import { describe, expect, it } from "vitest";
import {
    generateAttestationSignature,
    verifyAttestationSignature,
    generateAchievementExportBundle,
    formatAchievementToMarkdown,
} from "../src/core/achievement-export";
import type { AchievementExportBundle } from "../src/core/achievement-export";

describe("achievement-export (BI-21 学习成果导出、资质证明与薄弱点清单引擎)", () => {
    it("生成确定性验真签名：相同输入参数产生相同指纹", () => {
        const sig1 = generateAttestationSignature({
            goalId: "goal-algebra-2026",
            completedAt: 1700000000000,
            totalCards: 50,
            retentionRate: 0.92,
        });

        const sig2 = generateAttestationSignature({
            goalId: "goal-algebra-2026",
            completedAt: 1700000000000,
            totalCards: 50,
            retentionRate: 0.92,
        });

        expect(sig1).toBe(sig2);
        expect(sig1).toMatch(/^sig-lv-[a-f0-9]{8}$/);
    });

    it("不同输入产生不同签名：防止伪造或篡改", () => {
        const sigA = generateAttestationSignature({
            goalId: "goal-math",
            completedAt: 1700000000000,
            totalCards: 50,
            retentionRate: 0.92,
        });

        const sigB = generateAttestationSignature({
            goalId: "goal-math",
            completedAt: 1700000000000,
            totalCards: 49, // 卡片数不同
            retentionRate: 0.92,
        });

        expect(sigA).not.toBe(sigB);
    });

    it("校验签名真伪：真实签名返回 true，篡改后返回 false", () => {
        const bundle = generateAchievementExportBundle({
            goalId: "goal-physics",
            goalTitle: "高中物理力学复习",
            learnerAlias: "张三",
            totalCardsMastered: 30,
            studySpanDays: 15,
            overallRetentionRate: 0.85,
        });

        // 原始签名应通过校验
        expect(verifyAttestationSignature(bundle.certificate)).toBe(true);

        // 篡改签名（模拟伪造）
        const fakeCert = { ...bundle.certificate };
        fakeCert.verificationSignature = "sig-lv-ffffffff";
        expect(verifyAttestationSignature(fakeCert)).toBe(false);
    });

    it("生成完整证明包：包含证书、脱敏日志、薄弱点与建议", () => {
        const rawLogs = [
            { timestamp: 1700000000000, rating: 3, durationMs: 1200 },
            { timestamp: 1700000000000, rating: 4, durationMs: 1000 },
            { timestamp: 1700086400000, rating: 2, durationMs: 1500 },
        ];

        const weakPoints = [
            { topic: "牛顿第二定律", fails: 5, total: 10 },
            { topic: "动量守恒", fails: 2, total: 8 },
        ];

        const bundle = generateAchievementExportBundle({
            goalId: "goal-physics",
            goalTitle: "高中物理力学复习",
            learnerAlias: "李四同学",
            totalCardsMastered: 25,
            studySpanDays: 14,
            overallRetentionRate: 0.88,
            rawLogs,
            weakPoints,
            now: 1700172800000,
        });

        expect(bundle.certificate.goalTitle).toBe("高中物理力学复习");
        expect(bundle.certificate.learnerAlias).toBe("李四同学");
        expect(bundle.certificate.totalCardsMastered).toBe(25);
        expect(bundle.certificate.studySpanDays).toBe(14);
        expect(bundle.certificate.overallRetentionRate).toBe(0.88);
        expect(bundle.certificate.verificationSignature).toBeDefined();

        // 脱敏日志按日聚合（时间戳对应 2023-11-14）
        expect(bundle.sanitizedLogs).toHaveLength(2);
        expect(bundle.sanitizedLogs[0].dateIso).toBe("2023-11-14");
        expect(bundle.sanitizedLogs[0].cardsReviewed).toBe(2);
        expect(bundle.sanitizedLogs[0].retentionRate).toBe(1); // 2/2 成功
        expect(bundle.sanitizedLogs[0].durationMinutes).toBe(2); // 2200ms ≈ 2min

        // 薄弱点按失误次数降序排列
        expect(bundle.weakPoints).toHaveLength(2);
        expect(bundle.weakPoints[0].topicName).toBe("牛顿第二定律");
        expect(bundle.weakPoints[0].failureCount).toBe(5);
        expect(bundle.weakPoints[0].forgetRate).toBe(0.5);

        // 后续建议包含三项
        expect(bundle.nextStepSuggestions).toHaveLength(3);
    });

    it("格式化 Markdown 证书输出清晰可读的证明书格式", () => {
        const bundle = generateAchievementExportBundle({
            goalId: "goal-calc",
            goalTitle: "微积分基础强化",
            learnerAlias: "王五",
            totalCardsMastered: 40,
            studySpanDays: 20,
            overallRetentionRate: 0.95,
            now: 1700000000000,
        });

        const md = formatAchievementToMarkdown(bundle);
        expect(md).toContain("# 🎓 学习目标达成与成果证明书");
        expect(md).toContain("授予学习者：**王五**");
        expect(md).toContain("掌握卡片总数：40 张");
        expect(md).toContain("综合记忆保持率：95%");
        expect(md).toContain("防伪验真指纹：");
        expect(md).toContain("| 日期 | 复习卡数 | 当日保持率 | 投入时长 (分) |");
    });

    it("隐私零泄露原则：即使输入包含敏感笔记正文，输出也绝不泄露", () => {
        const bundle = generateAchievementExportBundle({
            goalId: "goal-secret",
            goalTitle: "内部机密项目知识",
            learnerAlias: "员工 A",
            totalCardsMastered: 10,
            studySpanDays: 5,
            overallRetentionRate: 0.8,
            rawLogs: [{ timestamp: 1700000000000, rating: 3, durationMs: 1000 }],
            weakPoints: [
                {
                    topic: "客户数据加密算法 sk-abcdef1234567890",
                    fails: 2,
                    total: 5,
                },
            ],
        });

        // 检查题面摘要中是否包含密钥
        const md = formatAchievementToMarkdown(bundle);
        expect(md).not.toContain("sk-abcdef1234567890");
        expect(md).toContain("客户数据加密算法"); // 主题名称保留但密钥已脱敏
    });
});
