/**
 * BU-12 跨 provider 输出 schema 注册表（纯逻辑，node 可单测）。
 * 每个 AI 输出形态声明字段类型/必选性，validate 返回清洗后的行数组 + 错误列表；
 * 与 prompt-templates 的 output 声明对接口径一致（cards-json / advice / diff-preview / scan / route / split / leak / distractor / rewrite）。
 * 宽容校验原则（AJ5 同口径）：类型可收敛则收敛（数字字符串→数值），不可收敛才报错；坏行跳过不炸整批。
 */

export type FieldType = "string" | "number" | "boolean" | "stringArray";

export interface SchemaField {
    key: string;
    type: FieldType;
    required: boolean;
}

export interface SchemaDef {
    id: string;
    fields: SchemaField[];
}

export interface ValidateResult {
    ok: boolean;
    /** 校验通过的行（类型已收敛；required 缺失的行整行跳过） */
    rows: Record<string, unknown>[];
    /** 全部行都失败时 ok=false 且 errors 非空；部分失败只跳行不报错 */
    errors: string[];
}

const defs: Record<string, SchemaDef> = {
    "cards-json": {
        id: "cards-json",
        fields: [
            { key: "q", type: "string", required: true },
            { key: "a", type: "string", required: true },
            { key: "d", type: "number", required: false },
        ],
    },
    scan: {
        id: "scan",
        fields: [
            { key: "point", type: "string", required: true },
            { key: "why", type: "string", required: true },
            { key: "prereq", type: "stringArray", required: false },
            { key: "mustLearn", type: "boolean", required: false },
        ],
    },
    clarify: {
        id: "clarify",
        fields: [
            { key: "question", type: "string", required: true },
            { key: "why", type: "string", required: true },
        ],
    },
    route: {
        id: "route",
        fields: [
            { key: "fact", type: "string", required: true },
            { key: "cardType", type: "string", required: true },
            { key: "why", type: "string", required: false },
        ],
    },
    split: {
        id: "split",
        fields: [
            { key: "fact", type: "string", required: true },
            { key: "evidence", type: "string", required: true },
            { key: "reason", type: "string", required: false },
        ],
    },
    leak: {
        id: "leak",
        fields: [
            { key: "leak", type: "string", required: true },
            { key: "where", type: "string", required: true },
            { key: "fix", type: "string", required: false },
        ],
    },
    distractor: {
        id: "distractor",
        fields: [
            { key: "distractor", type: "string", required: true },
            { key: "cause", type: "string", required: true },
            { key: "whyPlausible", type: "string", required: false },
        ],
    },
    rewrite: {
        id: "rewrite",
        fields: [
            { key: "q", type: "string", required: true },
            { key: "a", type: "string", required: true },
            { key: "change", type: "string", required: false },
        ],
    },
};

export function getSchema(id: string): SchemaDef | undefined {
    return defs[id];
}

function coerce(value: unknown, type: FieldType): { ok: boolean; value?: unknown } {
    switch (type) {
        case "string":
            if (typeof value === "string") return { ok: true, value: value.trim() };
            if (typeof value === "number" || typeof value === "boolean") return { ok: true, value: String(value) };
            return { ok: false };
        case "number": {
            const n = Number(value);
            return Number.isFinite(n) ? { ok: true, value: n } : { ok: false };
        }
        case "boolean":
            if (typeof value === "boolean") return { ok: true, value };
            if (value === "true") return { ok: true, value: true };
            if (value === "false") return { ok: true, value: false };
            return { ok: false };
        case "stringArray":
            if (Array.isArray(value)) {
                const arr = value.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map(v => v.trim());
                return { ok: true, value: arr };
            }
            return { ok: false };
    }
}

/** 按注册表 schema 校验模型输出行数组：宽容收敛 + 坏行跳过 + 全败报错 */
export function validateRows(schemaId: string, rows: unknown): ValidateResult {
    const def = defs[schemaId];
    if (!def) {
        return { ok: false, rows: [], errors: [`unknown schema: ${schemaId}`] };
    }
    if (!Array.isArray(rows)) {
        return { ok: false, rows: [], errors: [`output is not an array: ${schemaId}`] };
    }
    const out: Record<string, unknown>[] = [];
    const errors: string[] = [];
    rows.forEach((row, idx) => {
        if (!row || typeof row !== "object") {
            errors.push(`row ${idx}: not an object`);
            return;
        }
        const rec = row as Record<string, unknown>;
        const cleaned: Record<string, unknown> = {};
        let missing = false;
        for (const f of def.fields) {
            const has = f.key in rec && rec[f.key] !== undefined && rec[f.key] !== null && rec[f.key] !== "";
            if (!has) {
                if (f.required) {
                    missing = true;
                    errors.push(`row ${idx}: missing required "${f.key}"`);
                    break;
                }
                continue;
            }
            const c = coerce(rec[f.key], f.type);
            if (!c.ok) {
                if (f.required) {
                    errors.push(`row ${idx}: field "${f.key}" type mismatch (${f.type})`);
                    missing = true;
                    break;
                }
                continue; // 可选字段类型不符：直接省略
            }
            cleaned[f.key] = c.value;
        }
        if (!missing) {
            out.push(cleaned);
        }
    });
    return { ok: out.length > 0 || errors.length === 0, rows: out, errors };
}
