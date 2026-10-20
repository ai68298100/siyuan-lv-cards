/**
 * BX-11 复习来源层级面包屑纯模块（纯逻辑，Node 可单测）。
 * 
 * 核心目标与体验价值：
 * 1. 消除原子卡复习时的“孤岛感”：将卡片所属的笔记本、文档根标题及层级章节路径以面包屑呈现；
 * 2. 紧凑自适应截断：对超长标题按最大字符数平滑折叠，保留完整标题供 Tooltip 查阅；
 * 3. 深度自适应：当层级过深时，智能保留根文档与直接父级，中间折叠为 "…"，避免占用卡面过多空间；
 * 4. 纯函数设计，格式化清理 Markdown/HTML 标记，数据不可变隔离。
 */

export type BreadcrumbNodeType = "notebook" | "doc" | "heading" | "block";

export interface BreadcrumbNode {
    id: string;
    type: BreadcrumbNodeType;
    /** 完整原始名称或标题（已剥离 Markdown 标签） */
    fullTitle: string;
    /** 适于 UI 显示的紧凑/截断名称 */
    displayTitle: string;
    /** 点击跳转的目标 ID（笔记本或文档/块 ID） */
    targetId: string;
}

export interface ReviewBreadcrumbChain {
    cardId: string;
    nodes: readonly BreadcrumbNode[];
    /** 格式化为单行纯文本摘要（如 "算法笔记 / 二叉树 / 平衡二叉树"） */
    formattedText: string;
    /** 是否包含中间层级省略折叠 */
    isTruncated: boolean;
}

export interface ResolveBreadcrumbParams {
    cardId: string;
    notebookName?: string;
    docTitle?: string;
    docId?: string;
    ancestorHeadings?: readonly { id: string; title: string }[];
    maxDisplayChars?: number;
    maxDepth?: number;
}

/**
 * 清洗标题中的 Markdown 和 HTML 标记
 */
export function cleanTitleText(text: string): string {
    return String(text ?? "")
        .replace(/<[^>]+>/g, "") // 剥离 HTML 标签
        .replace(/\*\*([^*]+)\*\*/g, "$1") // 剥离粗体
        .replace(/==([^=]+)==/g, "$1") // 剥离思源高亮
        .replace(/~~([^~]+)~~/g, "$1") // 剥离删除线
        .replace(/`([^`]+)`/g, "$1") // 剥离行内代码
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // 剥离 Markdown 链接
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * 紧凑截断文本（超过限制时末尾加 "…"）
 */
export function truncateBreadcrumbTitle(title: string, maxChars: number = 16): string {
    const raw = cleanTitleText(title);
    if (!raw) return "";
    if (raw.length <= maxChars) return raw;
    return raw.slice(0, Math.max(1, maxChars - 1)) + "…";
}

/**
 * 组装复习卡面的层级面包屑链条（纯函数）
 */
export function resolveReviewBreadcrumbs(params: ResolveBreadcrumbParams): ReviewBreadcrumbChain {
    const maxChars = params.maxDisplayChars ?? 16;
    const maxDepth = Math.max(2, params.maxDepth ?? 3);
    const rawNodes: BreadcrumbNode[] = [];

    // 1. 笔记本节点（若提供）
    if (params.notebookName) {
        const cleaned = cleanTitleText(params.notebookName);
        if (cleaned) {
            rawNodes.push({
                id: `nb-${cleaned}`,
                type: "notebook",
                fullTitle: cleaned,
                displayTitle: truncateBreadcrumbTitle(cleaned, maxChars),
                targetId: "",
            });
        }
    }

    // 2. 根文档节点
    if (params.docTitle) {
        const cleaned = cleanTitleText(params.docTitle);
        if (cleaned) {
            rawNodes.push({
                id: params.docId ?? `doc-${cleaned}`,
                type: "doc",
                fullTitle: cleaned,
                displayTitle: truncateBreadcrumbTitle(cleaned, maxChars),
                targetId: params.docId ?? "",
            });
        }
    }

    // 3. 祖先章节标题节点
    if (Array.isArray(params.ancestorHeadings)) {
        for (const h of params.ancestorHeadings) {
            const cleaned = cleanTitleText(h.title);
            if (cleaned) {
                rawNodes.push({
                    id: h.id,
                    type: "heading",
                    fullTitle: cleaned,
                    displayTitle: truncateBreadcrumbTitle(cleaned, maxChars),
                    targetId: h.id,
                });
            }
        }
    }

    // 4. 层级深度自适应收敛（超出 maxDepth 时折叠中间节点）
    let finalNodes: BreadcrumbNode[] = rawNodes;
    let isTruncated = false;

    if (rawNodes.length > maxDepth) {
        isTruncated = true;
        const tailCount = 1; // 始终保留最直接的父级
        const headCount = Math.max(1, maxDepth - tailCount - 1);
        const head = rawNodes.slice(0, headCount);
        const tail = rawNodes.slice(-tailCount);
        const middleEllipsis: BreadcrumbNode = {
            id: "ellipsis-middle",
            type: "heading",
            fullTitle: "…",
            displayTitle: "…",
            targetId: "",
        };
        finalNodes = [...head, middleEllipsis, ...tail];
    }

    const formattedText = finalNodes.map(n => n.displayTitle).filter(Boolean).join(" / ");

    return {
        cardId: params.cardId,
        nodes: finalNodes,
        formattedText,
        isTruncated,
    };
}

/**
 * 将思源 hpath 路径直接解析为自适应面包屑链（纯函数）
 */
export function parseHPathToBreadcrumbs(
    cardId: string,
    hpath: string,
    options: { maxDisplayChars?: number; maxDepth?: number } = {},
): ReviewBreadcrumbChain {
    const raw = String(hpath ?? "").trim().replace(/^\/+/, "").replace(/\/+$/, "");
    if (!raw) {
        return {
            cardId,
            nodes: [],
            formattedText: "",
            isTruncated: false,
        };
    }

    const segments = raw.split("/").map(s => s.trim()).filter(Boolean);
    if (segments.length === 0) {
        return {
            cardId,
            nodes: [],
            formattedText: "",
            isTruncated: false,
        };
    }

    const docTitle = segments[0];
    const ancestorHeadings = segments.slice(1).map((title, idx) => ({
        id: `heading-${idx + 1}`,
        title,
    }));

    return resolveReviewBreadcrumbs({
        cardId,
        docTitle,
        ancestorHeadings,
        maxDisplayChars: options.maxDisplayChars ?? 14,
        maxDepth: options.maxDepth ?? 3,
    });
}

