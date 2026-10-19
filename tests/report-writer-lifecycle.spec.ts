import { describe, expect, it } from "vitest";
import {
    createReportWriteContext,
    startReportWrite,
    completeReportWrite,
    failReportWrite,
    clearReportWriteDraft,
    classifyReportWriteError,
    executeProtectedReportWrite,
} from "../src/core/report-writer";
import type { ReportWriteContext } from "../src/core/report-writer";

describe("report-writer-lifecycle (AR-5 报告写入状态机与并发互斥闭环)", () => {
    it("初始状态为空闲 idle，无草稿无错误", () => {
        const ctx = createReportWriteContext();
        expect(ctx.status).toBe("idle");
        expect(ctx.draftMarkdown).toBeUndefined();
        expect(ctx.draftTitle).toBeUndefined();
        expect(ctx.errorType).toBeUndefined();
    });

    it("正常写入流程：start -> complete，状态转移为 success 并记录落地文档信息", () => {
        let ctx = createReportWriteContext();
        const now = 1700000000000;

        ctx = startReportWrite(ctx, "考试复盘报告", "# 报告内容", now);
        expect(ctx.status).toBe("busy");
        expect(ctx.inFlightTitle).toBe("考试复盘报告");
        expect(ctx.inFlightMarkdown).toBe("# 报告内容");
        expect(ctx.startedAt).toBe(now);

        ctx = completeReportWrite(ctx, "doc-123456", "小驴闪卡/考试复盘/高数", now + 1500);
        expect(ctx.status).toBe("success");
        expect(ctx.inFlightTitle).toBeUndefined();
        expect(ctx.inFlightMarkdown).toBeUndefined();
        expect(ctx.draftMarkdown).toBeUndefined();
        expect(ctx.lastSuccessDocId).toBe("doc-123456");
        expect(ctx.lastSuccessDocPath).toBe("小驴闪卡/考试复盘/高数");
        expect(ctx.finishedAt).toBe(now + 1500);
    });

    it("并发互斥防护：在 busy 状态下重复触发 startReportWrite 必须抛出繁忙异常", () => {
        let ctx = createReportWriteContext();
        ctx = startReportWrite(ctx, "报告 1", "内容 1", 1000);
        expect(ctx.status).toBe("busy");

        // 尝试重复并发写入
        expect(() => startReportWrite(ctx, "报告 2", "内容 2", 1001)).toThrowError(
            /REPORT_WRITE_BUSY/,
        );
    });

    it("错误智能分类引擎：精准分类无笔记本/权限不足/同步中/超时/网络异常", () => {
        expect(classifyReportWriteError(new Error("No notebook candidate available")).type).toBe("no-notebook");
        expect(classifyReportWriteError(new Error("未找到可用笔记本")).type).toBe("no-notebook");

        expect(classifyReportWriteError(new Error("target is read-only, permission denied")).type).toBe("permission-denied");
        expect(classifyReportWriteError(new Error("权限不足无法写入")).type).toBe("permission-denied");

        expect(classifyReportWriteError(new Error("Notebook database is syncing, please retry")).type).toBe("syncing");
        expect(classifyReportWriteError(new Error("思源同步中锁定")).type).toBe("syncing");

        expect(classifyReportWriteError(new Error("kernel request timed out after 3000ms")).type).toBe("timeout");
        expect(classifyReportWriteError(new Error("fetch failed ECONNREFUSED")).type).toBe("network-failure");
        expect(classifyReportWriteError("something weird happened").type).toBe("unknown");
    });

    it("写入失败时草稿完整沉淀保真：在途内容自动转为 draftMarkdown，可供随时重试", () => {
        let ctx = createReportWriteContext();
        ctx = startReportWrite(ctx, "高数期末复盘", "# 复杂复盘长文内容", 1000);

        // 模拟写入异常（如网络中断）
        ctx = failReportWrite(ctx, new Error("fetch failed ECONNREFUSED"), 1500);
        expect(ctx.status).toBe("failed");
        expect(ctx.inFlightTitle).toBeUndefined();
        expect(ctx.inFlightMarkdown).toBeUndefined();

        // 核心断言：草稿绝对不丢失
        expect(ctx.draftTitle).toBe("高数期末复盘");
        expect(ctx.draftMarkdown).toBe("# 复杂复盘长文内容");
        expect(ctx.errorType).toBe("network-failure");
        expect(ctx.errorI18nKey).toBe("reportWriter.error.networkFailure");
        expect(ctx.finishedAt).toBe(1500);

        // 显式丢弃草稿
        const cleared = clearReportWriteDraft(ctx);
        expect(cleared.draftTitle).toBeUndefined();
        expect(cleared.draftMarkdown).toBeUndefined();
    });

    it("executeProtectedReportWrite 高阶执行器：成功路径自动流转状态", async () => {
        const ctx = createReportWriteContext();
        const stateTransitions: string[] = [];

        const result = await executeProtectedReportWrite(ctx, {
            title: "周报",
            markdown: "# 周报正文",
            writeAction: async (t, m) => {
                expect(t).toBe("周报");
                expect(m).toBe("# 周报正文");
                return { docId: "doc-999", docPath: "小驴闪卡/周报/第42周" };
            },
            onStateChange: (next) => stateTransitions.push(next.status),
        });

        expect(result.success).toBe(true);
        expect(result.docId).toBe("doc-999");
        expect(result.docPath).toBe("小驴闪卡/周报/第42周");
        expect(result.context.status).toBe("success");
        expect(stateTransitions).toEqual(["busy", "success"]);
    });

    it("executeProtectedReportWrite 高阶执行器：失败自动分类并保留草稿，可无损重试", async () => {
        let ctx = createReportWriteContext();

        // 第一次尝试失败（如无笔记本）
        const failResult = await executeProtectedReportWrite(ctx, {
            title: "失败周报",
            markdown: "# 珍贵的周报统计数据",
            writeAction: async () => {
                throw new Error("No notebook candidate available");
            },
        });

        expect(failResult.success).toBe(false);
        expect(failResult.context.status).toBe("failed");
        expect(failResult.context.errorType).toBe("no-notebook");
        expect(failResult.context.draftMarkdown).toBe("# 珍贵的周报统计数据");

        // 基于失败保留的草稿重试
        ctx = failResult.context;
        const retryResult = await executeProtectedReportWrite(ctx, {
            title: ctx.draftTitle!,
            markdown: ctx.draftMarkdown!,
            writeAction: async (t, m) => {
                return { docId: "doc-recovered", docPath: `小驴闪卡/恢复/${t}` };
            },
        });

        expect(retryResult.success).toBe(true);
        expect(retryResult.docId).toBe("doc-recovered");
        expect(retryResult.context.status).toBe("success");
        expect(retryResult.context.draftMarkdown).toBeUndefined(); // 成功后草稿已消费
    });
});
