/**
 * 存量与原生闪卡格式智能识别与升级引擎（Delimited QA & Legacy Flashcards Engine）
 *
 * 针对在安装小驴闪卡前已存在的大量存量笔记闪卡进行兼容与规范化升级：
 * 1. 概念卡（双冒号分隔符）：`概念 :: 释义` / `术语:: 定义`
 * 2. 问答卡（前后缀标记）：`Q: 问题 \nA: 答案` 或 `问：问题 \n答：答案`
 * 3. 块备注卡（思源原生 memo 属性作为答案）
 * 4. 纯文本卡（自由回忆/自评卡）
 */

export type DelimitedQaFormat = "triple-colon" | "double-colon" | "qa-prefix" | "qa-chinese";

export interface DelimitedQaResult {
    question: string;
    answer: string;
    format: DelimitedQaFormat;
}

const INLINE_OR_BLOCK_CODE = /```[\s\S]*?```|`[^`\n]+`/g;
const LATEX_MATH = /\$\$[\s\S]*?\$\$|\$[^$\n]+?\$/g;

/**
 * 尝试解析带分隔符的问答文本（::: 或 :: 或 Q/A 前缀）
 * 严格排除 C++ std::cout 命名空间及代码块中的混淆
 */
export function parseDelimitedQa(markdown: string): DelimitedQaResult | null {
    const raw = String(markdown ?? "").trim();
    if (!raw) return null;

    // 已包含标准 ==答案== 的优先交由挖空/问答门禁处理
    if (raw.includes("==")) return null;

    // 排除纯代码或公式段落
    const strippedCodeAndMath = raw
        .replace(INLINE_OR_BLOCK_CODE, " ")
        .replace(LATEX_MATH, " ")
        .trim();
    if (!strippedCodeAndMath) return null;

    // 1. 三冒号分隔符 ::: (RemNote 描述卡)
    if (raw.includes(":::")) {
        const parts = raw.split(/\s*:::\s*/);
        if (parts.length >= 2) {
            const question = parts[0]?.trim();
            const answer = parts.slice(1).join(" ::: ").trim();
            if (question && answer) {
                return { question, answer, format: "triple-colon" };
            }
        }
    }

    // 2. 双冒号分隔符 :: (概念 :: 定义)
    // 保护 C++ / Rust 等命名空间：:: 前后不能同时紧贴单词字符（如 std::vector 必须排除）
    if (raw.includes("::")) {
        // 要求 :: 至少一侧有空格，或者至少一侧不是字母/数字/下划线（例如汉字或标点）
        const colonRegex = /(?<![a-zA-Z0-9_])::(?![a-zA-Z0-9_])|\s+::\s+/;
        if (colonRegex.test(raw)) {
            const parts = raw.split(colonRegex);
            if (parts.length >= 2) {
                const question = parts[0]?.trim();
                const answer = parts.slice(1).join(" :: ").trim();
                if (question && answer) {
                    return { question, answer, format: "double-colon" };
                }
            }
        }
    }

    // 3. Q: ... \nA: ... (英文标记，允许中英文冒号，跨行或同行)
    const qaMatch = raw.match(/(?:^|\n)\s*(?:Q|q|Question)[:：]\s*([\s\S]+?)(?:\n|\s{2,})(?:A|a|Answer)[:：]\s*([\s\S]+)$/i);
    if (qaMatch && qaMatch[1]?.trim() && qaMatch[2]?.trim()) {
        return {
            question: qaMatch[1].trim(),
            answer: qaMatch[2].trim(),
            format: "qa-prefix",
        };
    }

    // 4. 问: ... \n答: ... (中文标记，允许 问题 / 答案)
    const zhMatch = raw.match(/(?:^|\n)\s*(?:问|问题)[:：]\s*([\s\S]+?)(?:\n|\s{2,})(?:答|答案)[:：]\s*([\s\S]+)$/);
    if (zhMatch && zhMatch[1]?.trim() && zhMatch[2]?.trim()) {
        return {
            question: zhMatch[1].trim(),
            answer: zhMatch[2].trim(),
            format: "qa-chinese",
        };
    }

    return null;
}

/**
 * 判断文本是否具备可识别的存量问答格式
 */
export function hasDelimitedQa(markdown: string): boolean {
    return parseDelimitedQa(markdown) !== null;
}

/**
 * 在内存 DOM 树中为未带 ==挖空== 标记的存量问答卡（::、::: 或 Q/A）就地生成遮罩。
 * 纯运行时呈现转换，绝不修改用户原笔记 Markdown，保证零破坏与原笔记纯净。
 */
export function maskDelimitedQaInHtml(root: Node): boolean {
    if (typeof document === "undefined") return false;
    let modified = false;

    // 0. 如果卡片包含引述块（blockquote 或 data-type="NodeBlockquote"），在问题态将其内容遮蔽，防止解题思路提前剧透
    const elementRoot = root instanceof Element ? root : (root as any).firstElementChild || root;
    if (elementRoot && typeof elementRoot.querySelectorAll === "function") {
        const quotes: Element[] = Array.from(elementRoot.querySelectorAll("blockquote, [data-type='NodeBlockquote']"));
        for (const q of quotes) {
            if (q.closest("pre, code, svg")) continue;
            const slot = document.createElement("div");
            slot.className = "lv-masked lv-analysis-slot";
            slot.setAttribute("data-type", "mark");
            slot.setAttribute("aria-hidden", "true");
            slot.title = "参考解析将在翻面或查看答案后揭晓";
            slot.innerHTML = `<span class="lv-mask-slot">［ 参考解析·查看答案时揭晓 ］</span>`;
            q.innerHTML = "";
            q.appendChild(slot);
            modified = true;
        }
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node: Text | null = null;

    while ((node = walker.nextNode() as Text | null)) {
        const parent = node.parentElement;
        if (!parent) continue;

        // 严格排除代码块、行内代码、公式及 SVG 内的文本节点
        if (parent.closest("pre, code, kbd, svg, .language-math, .katex, .MathJax")) {
            continue;
        }

        const text = node.nodeValue ?? "";

        // 0.5 匹配填空题中连续下划线填空槽，如 _____ 或 ____（3 个及以上下划线）
        const blankMatch = text.match(/_{3,}/);
        if (blankMatch && blankMatch.index !== undefined) {
            const before = text.slice(0, blankMatch.index);
            const after = text.slice(blankMatch.index + blankMatch[0].length);
            const slot = document.createElement("mark");
            slot.className = "lv-masked";
            slot.setAttribute("data-type", "mark");
            slot.setAttribute("aria-hidden", "true");
            slot.title = "填空遮蔽（点击揭晓）";
            slot.innerHTML = `<span class="lv-mask-slot">［ 填空 ］</span>`;

            node.nodeValue = before;
            const afterNode = document.createTextNode(after);
            parent.insertBefore(slot, node.nextSibling);
            parent.insertBefore(afterNode, slot.nextSibling);
            modified = true;
            continue;
        }

        // 1. 匹配 ::: 或 ::（排除命名空间如 std::vector）
        const colonMatch = text.match(/(?<![a-zA-Z0-9_])(:{2,3})(?![a-zA-Z0-9_])|\s+(:{2,3})\s+/);
        if (colonMatch && colonMatch.index !== undefined) {
            const sep = colonMatch[1] ?? colonMatch[2];
            const before = text.slice(0, colonMatch.index).trim();
            const after = text.slice(colonMatch.index + colonMatch[0].length).trim();
            if (before && after) {
                const slot = document.createElement("mark");
                slot.className = "lv-masked";
                slot.setAttribute("data-type", "mark");
                slot.setAttribute("aria-hidden", "true");
                slot.title = sep === ":::" ? "属性描述遮蔽" : "概念释义遮蔽";
                slot.innerHTML = `<span class="lv-mask-slot">［ ${sep === ":::" ? "属性描述" : "概念释义"} ］</span>`;

                node.nodeValue = text.slice(0, colonMatch.index + colonMatch[0].length);
                parent.insertBefore(slot, node.nextSibling);
                return true;
            }
        }

        // 2. 匹配 A: / Answer: / 答: / 答案:
        const ansMatch = text.match(/(?:^|\n)\s*(?:A|a|Answer|答|答案)[:：]\s*/);
        if (ansMatch && ansMatch.index !== undefined) {
            const prefix = text.slice(0, ansMatch.index + ansMatch[0].length);
            const after = text.slice(ansMatch.index + ansMatch[0].length).trim();
            if (after) {
                const parent = node.parentNode;
                if (!parent) continue;

                const slot = document.createElement("mark");
                slot.className = "lv-masked";
                slot.setAttribute("data-type", "mark");
                slot.setAttribute("aria-hidden", "true");
                slot.title = "参考答案遮蔽";
                slot.innerHTML = `<span class="lv-mask-slot">［ 参考答案 ］</span>`;

                node.nodeValue = prefix;
                parent.insertBefore(slot, node.nextSibling);
                return true;
            }
        }
    }

    return modified;
}

/**
 * 将单张存量卡片内容转换为小驴闪卡标准格式（带 ==答案== 挖空）
 */
export function upgradeLegacyCardToStandard(markdown: string, memo?: string): { markdown: string; reason: string } | null {
    const text = String(markdown ?? "").trim();
    if (!text) return null;

    // 已具备 ==答案== 的不需要重复转换
    if (text.includes("==")) return null;

    // 1. 优先尝试解析分隔符问答（:: 或 Q/A）
    const qa = parseDelimitedQa(text);
    if (qa) {
        return {
            markdown: `${qa.question} ==${qa.answer}==`,
            reason: qa.format === "double-colon"
                ? "将概念卡 :: 语法升级为标准闪卡挖空标记"
                : "将问答文本升级为标准闪卡挖空标记",
        };
    }

    // 2. 块备注作为答案：正文内容 ==memo==
    const cleanMemo = String(memo ?? "").trim();
    if (cleanMemo) {
        return {
            markdown: `${text} ==${cleanMemo}==`,
            reason: "将思源块备注合并为标准卡片答案标记",
        };
    }

    return null;
}

/**
 * 批量扫描存量卡片并生成标准化的批量修复草稿提案（用于维护中心一键升级）
 */
export function proposeLegacyCardUpgrades(
    cards: Array<{ blockID: string; md: string; memo?: string }>,
): Array<{ blockID: string; afterMarkdown: string; reason: string }> {
    const proposals: Array<{ blockID: string; afterMarkdown: string; reason: string }> = [];

    for (const card of cards) {
        const upgrade = upgradeLegacyCardToStandard(card.md, card.memo);
        if (upgrade) {
            proposals.push({
                blockID: card.blockID,
                afterMarkdown: upgrade.markdown,
                reason: upgrade.reason,
            });
        }
    }

    return proposals;
}
