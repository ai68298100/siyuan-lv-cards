/**
 * BU-24/25 AI 成本预算与用量账本（纯逻辑，node 可单测）。
 * 每次出卡记一条用量（task/provider/model/token 估算/费用估算/算法与价格版本）——
 * 当前 provider 响应不含 usage 字段，全部为**估算并显式标记 est=true**（chars/4 算法 + 注册表价格快照），
 * 绝不冒充账单事实；价格未知（未登记模型）时 costUsd=null 不编数字。
 * 预算：月度 token 上限——warn（默认 80%）提示、exceeded 阻断（eligibility costExceeded 事实源）；
 * 验收硬性要求：达到上限后保留草稿与手工路径（阻断信息自带替代路径键），**不自动切换未同意端点**
 * （阻断发生在组装 prompt 前，任何 fallback 都不会启动）。
 * 隐私：只存 token 数/hash/模型 ID——**key 与材料原文永不入账本**。
 */

export const COST_LEDGER_VERSION = 1;

export interface CostEntry {
    at: number;
    /** 任务（当前在册仅 cards-generate） */
    task: string;
    /** provider 形态：siyuan 内核网关 / custom 端点 */
    mode: "siyuan" | "custom";
    /** 登记模型 ID（未登记/内置=null） */
    modelId: string | null;
    /** token 估算（输入+输出合计，chars/4） */
    tokens: number;
    /** true=估算值（当前恒 true；usage 字段可读后转 false） */
    est: boolean;
    /** 费用估算 USD（价格未知=null，不编数字） */
    costUsd: number | null;
    /** 估算算法标记 */
    algorithm: "chars/4";
    /** 价格快照版本（与 ai-model-registry.MODEL_PRICE_SNAPSHOT 同源） */
    priceVersion: string;
}

export interface CostLedgerData {
    version: 1;
    entries: CostEntry[];
}

export interface CostBudget {
    /** 预算开关（关闭=只记账不限制） */
    enabled: boolean;
    /** 月度 token 上限（0=不设上限；仅 enabled 时生效） */
    monthlyTokenCap: number;
    /** 预警阈值比例（默认 0.8） */
    warnRatio?: number;
}

export interface BudgetState {
    /** 本自然月已用 token（本地时区） */
    monthUsed: number;
    cap: number;
    /** 剩余额度（无上限=null） */
    remaining: number | null;
    /** 达到预警阈值（且未超限） */
    warn: boolean;
    /** 超限（eligibility costExceeded 事实源；无上限恒 false） */
    exceeded: boolean;
    /** 预算是否生效中（enabled && cap>0） */
    active: boolean;
}

const ENTRIES_CAP = 2000;

export function emptyCostLedger(): CostLedgerData {
    return { version: COST_LEDGER_VERSION, entries: [] };
}

/** 台账清洗：字段合法性白名单、时间排序、限量（尾部保留）；坏条目剔除 */
export function normalizeCostLedger(raw: unknown, cap = ENTRIES_CAP): CostLedgerData {
    const d = (raw ?? {}) as Partial<CostLedgerData>;
    const list = Array.isArray(d.entries) ? d.entries : [];
    const entries: CostEntry[] = [];
    for (const e of list) {
        const x = e as Partial<CostEntry>;
        if (typeof x?.at !== "number" || !(x.at > 0) || typeof x?.tokens !== "number" || !(x.tokens >= 0)) {
            continue;
        }
        if (x.mode !== "siyuan" && x.mode !== "custom") {
            continue;
        }
        entries.push({
            at: x.at,
            task: typeof x.task === "string" && x.task ? x.task.slice(0, 64) : "unknown",
            mode: x.mode,
            modelId: typeof x.modelId === "string" && x.modelId ? x.modelId : null,
            tokens: Math.round(x.tokens),
            est: x.est !== false,
            costUsd: typeof x.costUsd === "number" && Number.isFinite(x.costUsd) ? x.costUsd : null,
            algorithm: "chars/4",
            priceVersion: typeof x.priceVersion === "string" && x.priceVersion ? x.priceVersion.slice(0, 16) : "unknown",
        });
    }
    entries.sort((a, b) => a.at - b.at);
    return { version: COST_LEDGER_VERSION, entries: entries.slice(-cap) };
}

/** 记一笔（最新在后；上限截断） */
export function recordEntry(ledger: CostLedgerData, entry: CostEntry, cap = ENTRIES_CAP): CostLedgerData {
    return { ...ledger, entries: [...ledger.entries, entry].slice(-cap) };
}

/** 本地时区年月键（YYYY-MM） */
function monthKey(at: number): string {
    const d = new Date(at);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** 预算状态：本自然月窗口；无上限/未启用时 exceeded 恒 false（不阻断） */
export function budgetState(ledger: CostLedgerData, budget: CostBudget, now: number = Date.now()): BudgetState {
    const key = monthKey(now);
    const monthUsed = ledger.entries.filter(e => monthKey(e.at) === key).reduce((sum, e) => sum + e.tokens, 0);
    const active = budget.enabled && budget.monthlyTokenCap > 0;
    const cap = active ? budget.monthlyTokenCap : 0;
    const ratio = budget.warnRatio ?? 0.8;
    const remaining = active ? Math.max(0, cap - monthUsed) : null;
    const exceeded = active ? monthUsed >= cap : false;
    const warn = active && !exceeded && monthUsed >= cap * ratio;
    return { monthUsed, cap, remaining, warn, exceeded, active };
}

/** 聚合：按模型（null=未登记单列） */
export function aggregateByModel(ledger: CostLedgerData): { modelId: string | null; calls: number; tokens: number; costUsd: number | null }[] {
    const map = new Map<string, { modelId: string | null; calls: number; tokens: number; costUsd: number | null }>();
    for (const e of ledger.entries) {
        const key = e.modelId ?? "∅";
        const cur = map.get(key) ?? { modelId: e.modelId, calls: 0, tokens: 0, costUsd: null };
        if (cur.calls === 0) {
            cur.costUsd = e.costUsd; // 首条直接继承（可能为 null）
        } else if (e.costUsd === null || cur.costUsd === null) {
            cur.costUsd = null; // 任一未知即整组标未知（不编数字）
        } else {
            cur.costUsd += e.costUsd;
        }
        cur.calls += 1;
        cur.tokens += e.tokens;
        map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.tokens - a.tokens);
}

/** 聚合：按本地日期（YYYY-MM-DD，旧→新） */
export function aggregateByDay(ledger: CostLedgerData): { day: string; calls: number; tokens: number }[] {
    const map = new Map<string, { day: string; calls: number; tokens: number }>();
    for (const e of ledger.entries) {
        const day = new Date(e.at);
        const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
        const cur = map.get(key) ?? { day: key, calls: 0, tokens: 0 };
        cur.calls += 1;
        cur.tokens += e.tokens;
        map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
}
