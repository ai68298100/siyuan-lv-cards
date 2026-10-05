/**
 * Anki M2：重复检测（docs/39 §3 M2）。
 * 指纹 = 归一化问面（去空白/统一小写/去尾标点）的 FNV-1a 64 位十六进制——
 * 纯实现零依赖（不引 node:crypto，保持渲染端可移植）。
 * M3 导入执行时用同一指纹对既有块查重；本模块只做包内分组。
 */

/** 归一化：全角空白/半角空白剔除、小写、去尾部标点 */
export function normalizeQuestion(q: string): string {
    return q
        .replace(/[\s\u3000]+/g, "")
        .toLowerCase()
        .replace(/[。，、；：？！.,;:?!"']+$/g, "");
}

/** 双通道 32 位 FNV-1a 拼接为 64 位指纹（只需稳定可比较，不需密码学强度） */
export function fnv1a64(text: string): string {
    let a = 0x811c9dc5;
    let b = 0x01000193;
    for (let i = 0; i < text.length; i++) {
        const ch = text.charCodeAt(i);
        a = Math.imul(a ^ ch, 0x01000193) >>> 0;
        b = Math.imul(b ^ (ch + i), 0x85ebca6b) >>> 0;
    }
    return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

export function cardFingerprint(questionText: string): string {
    return fnv1a64(normalizeQuestion(questionText));
}

export interface DedupeItem {
    guid: string;
    question: string;
}

/** 包内重复组：同一指纹（归一化问面相同）出现 ≥2 张 → 组内全部 guid */
export function findInPackageDuplicates(items: DedupeItem[]): { fingerprint: string; guids: string[] }[] {
    const byFp = new Map<string, string[]>();
    for (const it of items) {
        const fp = cardFingerprint(it.question);
        const list = byFp.get(fp) ?? [];
        list.push(it.guid);
        byFp.set(fp, list);
    }
    return [...byFp.entries()]
        .filter(([, guids]) => guids.length >= 2)
        .map(([fingerprint, guids]) => ({ fingerprint, guids }));
}
