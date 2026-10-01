/**
 * 卡型注册表（M4·FR1，docs/14 §2）。
 * 3.8：复习面板内渲染/判分（本文件的运行时契约）；
 * 3.9：同一名义卡型将桥接到官方 registerFlashcardV2PluginType（接口见 docs/14，待 3.9 API 明确后接）。
 * 打字题（typing）是第一个内置卡型（M4·FR2）。
 */

export type Rating1to4 = 1 | 2 | 3 | 4;

export interface TypingGrade {
    /** 建议评分 */
    suggested: Rating1to4;
    /** 相似度 0-1（对期望答案长度） */
    ratio: number;
    /** 逐字符对齐结果（用户输入视角）：ok=该字符命中期望 */
    chars: { ch: string; ok: boolean }[];
}

export interface CardTypeRegistration {
    typeName: string;
    displayNameKey: string;
    gradable: boolean;
    /** 判分：把用户作答映射为建议评分与展示数据 */
    grade?: (answer: string, expected: string, opts: { strict: boolean }) => TypingGrade;
}

// ---- 打字题判分 ----

function normalize(s: string, strict: boolean): string {
    return strict
        ? s
        : s.toLowerCase().replace(/[\s\p{P}\u3000-\u303f\uff00-\uffef]/gu, "");
}

/** LCS 对齐：标出用户输入中命中期望的字符，并给出相似度 */
export function gradeTyping(expected: string, actual: string, strict: boolean): TypingGrade {
    const e = [...normalize(expected, strict)];
    const a = [...normalize(actual, strict)];
    const m = e.length, n = a.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = e[i - 1] === a[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
    }
    const matched = new Array(n).fill(false);
    let i = m, j = n;
    while (i > 0 && j > 0) {
        if (e[i - 1] === a[j - 1]) {
            matched[j - 1] = true;
            i--; j--;
        } else if (dp[i - 1][j] >= dp[i][j - 1]) {
            i--;
        } else {
            j--;
        }
    }
    const ratio = m > 0 ? dp[m][n] / m : 1;
    const suggested: Rating1to4 = ratio >= 0.9 ? 3 : ratio >= 0.6 ? 2 : 1;
    return { suggested, ratio, chars: a.map((ch, idx) => ({ ch, ok: matched[idx] })) };
}

// ---- 注册表 ----

const registry = new Map<string, CardTypeRegistration>();

export function registerCardType(reg: CardTypeRegistration): () => void {
    registry.set(reg.typeName, reg);
    return () => registry.delete(reg.typeName);
}

export function getCardType(typeName: string): CardTypeRegistration | undefined {
    return registry.get(typeName);
}

export function listCardTypes(): CardTypeRegistration[] {
    return [...registry.values()];
}

// 内置：打字题
registerCardType({
    typeName: "type",
    displayNameKey: "cardTypeTyping",
    gradable: true,
    grade: (answer, expected, opts) => gradeTyping(expected, answer, opts.strict),
});
