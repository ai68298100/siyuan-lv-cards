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

/** AQ-16 余量（v0.114.0）：解析产物上限——数量封顶 + 超长卡丢弃（防模型失控输出撑爆预览/落库） */
export const PARSE_LIMITS = {
    /** 单次解析最大卡片数（超出部分丢弃；提示词通常要求 ≤20，50 为宽容上界） */
    maxCards: 50,
    /** 单卡问题最大长度（字符） */
    maxQLen: 500,
    /** 单卡答案最大长度（字符） */
    maxALen: 2000,
} as const;

/** 从模型回复中宽容解析卡片 JSON 数组（容忍 ```json 围栏与前后噪声；超限卡丢弃不报错） */
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
    // G3-call 发现（v0.141.0）：部分模型返回嵌套数组 [[card],[card]]——展平后再解析
    const flat = arr.flatMap((item: any) => (Array.isArray(item) ? item : [item]));
    return flat
        .map((c: any) => {
            const d = Number(c?.d);
            return {
                q: String(c?.q ?? c?.question ?? "").trim(),
                a: String(c?.a ?? c?.answer ?? "").trim(),
                ...(Number.isInteger(d) && d >= 1 && d <= 3 ? { d } : {}),
            };
        })
        .filter(c => c.q && c.a)
        .filter(c => c.q.length <= PARSE_LIMITS.maxQLen && c.a.length <= PARSE_LIMITS.maxALen)
        .slice(0, PARSE_LIMITS.maxCards);
}
