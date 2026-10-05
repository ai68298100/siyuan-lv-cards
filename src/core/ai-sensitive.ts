/**
 * BU-8 敏感内容识别与脱敏预览（纯逻辑，node 可单测；模式复用 prompt-injection 扫描器形态）。
 * 高精度类别：密钥/令牌、私钥块、JWT、中国身份证（含校验位验证降误报）、手机号、邮箱、
 * 用户自定义敏感词。验收口径：命中只回报**打码样本**（绝不在诊断/日志回显原文）；
 * 处置权在用户——继续外发/脱敏后外发/取消，本模块只提供识别与脱敏两个纯函数，不自动外发也不自动阻断。
 * 医疗/法律类语义识别正则不可靠，本切片不收录（防高误报），登记为自定义敏感词替代路径。
 */

export interface SensitivePattern {
    id: string;
    pattern: RegExp;
}

/** 全局正则（逐段扫描）；ID 卡采用校验位后验，见 isCnProductId */
export const SENSITIVE_PATTERNS: SensitivePattern[] = [
    { id: "secret-assignment", pattern: /\b(password|passwd|secret|token|api[_-]?key|access[_-]?key)\b\s*[:=]\s*["']?([^\s"',;)]{6,})/gi },
    { id: "openai-key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
    { id: "github-token", pattern: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/g },
    { id: "aws-key", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
    { id: "private-key-block", pattern: /-----BEGIN (RSA |EC |OPENSSH |PGP |DSA )?PRIVATE KEY( BLOCK)?-----/g },
    { id: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g },
    { id: "cn-mobile", pattern: /\b1[3-9]\d{9}\b/g },
    { id: "email", pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
    { id: "cn-id", pattern: /\b\d{17}[\dXx]\b/g },
];

export interface SensitiveHit {
    id: string;
    /** 命中次数 */
    count: number;
    /** 打码样本（截 24 字符 + ***；绝不回显完整原文） */
    sample: string;
}

const SAMPLE_LEN = 24;

function maskSample(m: string): string {
    const head = m.slice(0, Math.min(8, SAMPLE_LEN));
    return `${head}***`;
}

/** 中国居民身份证校验位（GB 11643-1999）；失败视为普通数字串不命中（降误报） */
export function isCnProductIdValid(id: string): boolean {
    if (!/^\d{17}[\dXx]$/.test(id)) {
        return false;
    }
    const w = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
    const codes = "10X98765432";
    const sum = w.reduce((acc, wi, i) => acc + wi * Number(id[i]), 0);
    return codes[sum % 11] === id[17].toUpperCase();
}

/** 逐类别扫描：返回全部命中（打码样本）；customTerms 为用户自定义敏感词（大小写不敏感） */
export function scanSensitive(text: string, customTerms: string[] = []): SensitiveHit[] {
    const src = text ?? "";
    const hits: SensitiveHit[] = [];
    for (const { id, pattern } of SENSITIVE_PATTERNS) {
        const re = new RegExp(pattern.source, pattern.flags);
        const matches = src.match(re) ?? [];
        let count = 0;
        let sample = "";
        for (const m of matches) {
            if (id === "cn-id" && !isCnProductIdValid(m)) {
                continue; // 校验位不合法：大概率是普通数字（订单号/时间戳），不命中
            }
            count += 1;
            sample ||= maskSample(m);
        }
        if (count > 0) {
            hits.push({ id, count, sample });
        }
    }
    const terms = customTerms.map(t => t.trim()).filter(Boolean);
    for (const term of terms) {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(escaped, "gi");
        const matches = src.match(re) ?? [];
        if (matches.length > 0) {
            hits.push({ id: `custom:${term.slice(0, 40)}`, count: matches.length, sample: maskSample(matches[0]) });
        }
    }
    return hits;
}

export interface MaskResult {
    /** 脱敏后文本（命中替换为【已脱敏·类别】占位，长度不保留） */
    masked: string;
    hits: SensitiveHit[];
}

/** 脱敏：命中的敏感片段替换为可读占位符（用户可在向导中继续编辑核对） */
export function maskSensitive(text: string, customTerms: string[] = []): MaskResult {
    let out = text ?? "";
    for (const { id, pattern } of SENSITIVE_PATTERNS) {
        out = out.replace(new RegExp(pattern.source, pattern.flags), (m) => {
            if (id === "cn-id" && !isCnProductIdValid(m)) {
                return m; // 非法校验位不脱敏（与扫描口径一致）
            }
            return `【已脱敏·${id}】`;
        });
    }
    const terms = customTerms.map(t => t.trim()).filter(Boolean);
    for (const term of terms) {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        out = out.replace(new RegExp(escaped, "gi"), `【已脱敏·自定义】`);
    }
    return { masked: out, hits: scanSensitive(out, customTerms) };
}
