/**
 * AS-3 富内容卡面降级占位与防白屏容错引擎（纯逻辑，node 可单测）。
 * 
 * 核心契约与安全原则：
 * 1. 覆盖 7 大异常降级场景：公式解析失败、图片媒体缺失、损坏嵌入块、代码语法异常、超宽表格溢出、块加载失败与通用渲染崩溃；
 * 2. 铁律一：问题态（question）降级时严格遮蔽答案内容，绝不提前泄露答案；
 * 3. 铁律二：答案态（answer）渲染失败时提供清晰占位与原因说明，绝不白屏卡死复习队列；
 * 4. 动作通道：每个降级占位必须绑定可操作动作（打开思源原块、重试加载、跳过本卡、标记维护）。
 */

import { sanitizeSensitiveText } from "./audit-log";

export type CardFaceFallbackReason =
    | "formula-error"
    | "missing-media"
    | "broken-embed"
    | "malformed-code"
    | "overflow-table"
    | "load-failure"
    | "generic-render-error";

export type FallbackActionType =
    | "open-source"
    | "retry-load"
    | "skip-card"
    | "report-issue";

/** 安全降级占位模型 */
export interface SafeCardFacePlaceholder {
    id: string;
    reason: CardFaceFallbackReason;
    titleKey: string;
    descKey: string;
    stage: "question" | "answer";
    /** 安全可展示的题面摘要（问题态已彻底剔除答案内容） */
    safeExcerpt: string;
    /** 关联的思源来源块 ID */
    sourceBlockId?: string;
    /** 绑定的容错动作列表 */
    actions: FallbackActionType[];
    /** 移动/窄屏横向滚动无障碍提示键（当且仅当表格或长代码时） */
    scrollAriaHintKey?: string;
    createdAt: number;
}

export interface BuildFallbackParams {
    reason: CardFaceFallbackReason;
    stage: "question" | "answer";
    rawContent?: string;
    sourceBlockId?: string;
    errorMessage?: string;
    now?: number;
}

// 挖空与答案段正则匹配
const CLOZE_TAG_REGEX = /==([^=]+)==/g;
const MARK_SPAN_REGEX = /<span\b[^>]*data-type=["']mark["'][^>]*>(.*?)<\/span>/gi;
const HTML_TAGS_REGEX = /<[^>]+>/g;

/**
 * 问题态答案剥离过滤器（纯函数）：
 * 无论传入 Markdown 原文还是内核渲染 HTML，强制移除所有答案挖空内容，防止降级占位造成题眼泄露。
 */
export function stripAnswersForQuestionSafety(text: string): string {
    if (!text) return "";

    let safe = text;

    // 1. 剥离 span[data-type="mark"] 内核挖空标记
    safe = safe.replace(MARK_SPAN_REGEX, "[……]");

    // 2. 剥离 Markdown ==text== 挖空标记
    safe = safe.replace(CLOZE_TAG_REGEX, "[……]");

    // 3. 去除 HTML 残留标签
    safe = safe.replace(HTML_TAGS_REGEX, " ");

    // 4. 清理连续空白
    safe = safe.replace(/\s+/g, " ").trim();

    return sanitizeSensitiveText(safe, 120);
}

/**
 * 构建安全卡面降级占位对象（纯函数）：
 * 严格按照 stage 决定展示策略，绑定可执行容错动作。
 */
export function buildCardFaceFallback(params: BuildFallbackParams): SafeCardFacePlaceholder {
    const now = params.now ?? Date.now();
    const id = `fallback-${params.reason}-${now}-${Math.random().toString(36).substring(2, 6)}`;

    let titleKey = "cardFaceFallback.generic.title";
    let descKey = "cardFaceFallback.generic.desc";
    let scrollAriaHintKey: string | undefined;

    const actions: FallbackActionType[] = ["open-source", "skip-card"];

    switch (params.reason) {
        case "formula-error":
            titleKey = "cardFaceFallback.formula.title";
            descKey = "cardFaceFallback.formula.desc";
            actions.unshift("report-issue");
            break;
        case "missing-media":
            titleKey = "cardFaceFallback.media.title";
            descKey = "cardFaceFallback.media.desc";
            actions.unshift("retry-load");
            break;
        case "broken-embed":
            titleKey = "cardFaceFallback.embed.title";
            descKey = "cardFaceFallback.embed.desc";
            actions.unshift("report-issue");
            break;
        case "malformed-code":
            titleKey = "cardFaceFallback.code.title";
            descKey = "cardFaceFallback.code.desc";
            scrollAriaHintKey = "cardFaceFallback.scroll.code";
            break;
        case "overflow-table":
            titleKey = "cardFaceFallback.table.title";
            descKey = "cardFaceFallback.table.desc";
            scrollAriaHintKey = "cardFaceFallback.scroll.table";
            break;
        case "load-failure":
            titleKey = "cardFaceFallback.load.title";
            descKey = "cardFaceFallback.load.desc";
            actions.unshift("retry-load");
            break;
        case "generic-render-error":
        default:
            titleKey = "cardFaceFallback.generic.title";
            descKey = "cardFaceFallback.generic.desc";
            actions.unshift("retry-load");
            break;
    }

    // 安全处理题面：如果是问题态，必须剥离答案；如果是答案态，可以展示安全截断正文
    let safeExcerpt = "";
    if (params.rawContent) {
        if (params.stage === "question") {
            safeExcerpt = stripAnswersForQuestionSafety(params.rawContent);
        } else {
            const rawClean = params.rawContent.replace(HTML_TAGS_REGEX, " ").replace(/\s+/g, " ").trim();
            safeExcerpt = sanitizeSensitiveText(rawClean, 140);
        }
    }

    return {
        id,
        reason: params.reason,
        titleKey,
        descKey,
        stage: params.stage,
        safeExcerpt,
        sourceBlockId: params.sourceBlockId,
        actions,
        scrollAriaHintKey,
        createdAt: now,
    };
}

/**
 * 诊断渲染异常并推断降级原因类型（纯函数）
 */
export function detectFallbackReasonFromError(err: unknown, contentSnapshot?: string): CardFaceFallbackReason {
    const msg = err instanceof Error ? err.message.toLowerCase() : String(err ?? "").toLowerCase();
    const snapshot = (contentSnapshot ?? "").toLowerCase();

    if (msg.includes("katex") || msg.includes("mathjax") || msg.includes("parse error") || snapshot.includes("language-math")) {
        return "formula-error";
    }

    if (msg.includes("img") || msg.includes("image") || msg.includes("404") || msg.includes("asset not found")) {
        return "missing-media";
    }

    if (msg.includes("embed") || msg.includes("iframe") || msg.includes("nodeblockqueryembed")) {
        return "broken-embed";
    }

    if (msg.includes("timeout") || msg.includes("load block") || msg.includes("not found block")) {
        return "load-failure";
    }

    if (snapshot.includes("<table") || snapshot.includes("|---")) {
        return "overflow-table";
    }

    return "generic-render-error";
}
