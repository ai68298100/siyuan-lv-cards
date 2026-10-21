/**
 * 存量与原生闪卡格式智能识别与升级引擎（Delimited QA & Legacy Flashcards Engine）
 *
 * 针对在安装小驴闪卡前已存在的大量存量笔记闪卡进行兼容与规范化升级：
 * 1. 概念卡（双冒号分隔符）：`概念 :: 释义` / `术语:: 定义`
 * 2. 问答卡（前后缀标记）：`Q: 问题 \nA: 答案` 或 `问：问题 \n答：答案`
 * 3. 块备注卡（思源原生 memo 属性作为答案）
 * 4. 纯文本卡（自由回忆/自评卡）
 */

export interface DelimitedQaResult {
    question: string;
    answer: string;
    format: "double-colon" | "qa-prefix" | "qa-chinese";
}

/**
 * 尝试解析带分隔符的问答文本（:: 或 Q/A 前缀）
 */
export function parseDelimitedQa(markdown: string): DelimitedQaResult | null {
    const raw = String(markdown ?? "").trim();
    if (!raw) return null;

    // 已包含标准 ==答案== 的优先交由挖空/问答门禁处理
    if (raw.includes("==")) return null;

    // 1. 双冒号分隔符 :: (概念 :: 定义)
    if (raw.includes("::")) {
        const parts = raw.split(/\s*::\s*/);
        if (parts.length >= 2) {
            const question = parts[0]?.trim();
            const answer = parts.slice(1).join(" :: ").trim();
            if (question && answer) {
                return { question, answer, format: "double-colon" };
            }
        }
    }

    // 2. Q: ... \nA: ... (英文标记，允许中英文冒号，跨行)
    const qaMatch = raw.match(/(?:^|\n)\s*(?:Q|q|Question)[:：]\s*([\s\S]+?)\n\s*(?:A|a|Answer)[:：]\s*([\s\S]+)$/i);
    if (qaMatch && qaMatch[1]?.trim() && qaMatch[2]?.trim()) {
        return {
            question: qaMatch[1].trim(),
            answer: qaMatch[2].trim(),
            format: "qa-prefix",
        };
    }

    // 3. 问: ... \n答: ... (中文标记，允许 问题 / 答案)
    const zhMatch = raw.match(/(?:^|\n)\s*(?:问|问题)[:：]\s*([\s\S]+?)\n\s*(?:答|答案)[:：]\s*([\s\S]+)$/);
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
