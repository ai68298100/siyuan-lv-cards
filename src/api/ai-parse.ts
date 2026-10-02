/**
 * AI 输出解析纯逻辑（零依赖，可单测）：宽松卡片解析与 token 估算。
 * 网络调用见 ai.ts（import siyuan，不可在 node 单测环境加载）。
 */

/** 粗略 token 估算（中英混按 4 字符/token） */
export function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

export interface ParsedCard {
    q: string;
    a: string;
    /** 难度标注（297，可选 1易/2中/3难；越界/缺失不产出） */
    d?: number;
}

/** 从模型回复中宽容解析卡片 JSON 数组（容忍 ```json 围栏与前后噪声） */
export function parseCards(raw: string): ParsedCard[] {
    let text = raw.trim();
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) {
        text = fence[1];
    }
    const arrStart = text.indexOf("[");
    const arrEnd = text.lastIndexOf("]");
    if (arrStart >= 0 && arrEnd > arrStart) {
        text = text.slice(arrStart, arrEnd + 1);
    }
    const arr = JSON.parse(text);
    if (!Array.isArray(arr)) {
        throw new Error("not an array");
    }
    return arr
        .map((c: any) => {
            const d = Number(c?.d);
            return {
                q: String(c?.q ?? c?.question ?? "").trim(),
                a: String(c?.a ?? c?.answer ?? "").trim(),
                ...(Number.isInteger(d) && d >= 1 && d <= 3 ? { d } : {}),
            };
        })
        .filter(c => c.q && c.a);
}
