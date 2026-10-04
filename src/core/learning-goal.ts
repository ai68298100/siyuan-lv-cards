/**
 * BI-1 目标启动向导——目标模型（纯逻辑，node 可单测）。
 * 向导采集：学习目的（BI-2 六目的）、截止时间、材料、每日可用时间、当前水平。
 * 验收口径：可只记录目标，不强迫建卡——本模块只存目标语义，不触发任何制卡。
 */

import { normalizePurpose, type SessionPurpose } from "./session-purpose";

export const LEVELS = ["novice", "beginner", "intermediate", "advanced"] as const;
export type LearnerLevel = (typeof LEVELS)[number];

export interface LearningGoal {
    id: string;
    /** 学习目的（BI-2 目的档案键） */
    purpose: SessionPurpose;
    /** 截止日期（本地 YYYY-MM-DD）；null = 无截止 */
    deadline: string | null;
    /** 材料块 ID 列表（来源范围，可空——先记目标后圈材料） */
    materialBlockIDs: string[];
    /** 每日可用分钟数；0 = 未设定 */
    minutesPerDay: number;
    /** 当前水平自评 */
    level: LearnerLevel;
    /** BI-11：目标优先级（主目标/维持/暂缓）；缺省=维持。排序只影响入口与建议展示，不改调度 */
    priority?: GoalPriority;
    /** BI-16：完成定义历史（旧定义保留——验收「历史记录保留当时定义」）；最新在末尾 */
    criteriaHistory?: GoalCriteria[];
    createdAt: number;
    updatedAt: number;
}

/** BI-16：用户自定义完成定义（「读完/能解释/能做题/能完成任务」等，自拟文本） */
export interface GoalCriteria {
    text: string;
    since: number;
}

const CRITERIA_TEXT_MAX = 100;
const CRITERIA_HISTORY_CAP = 20;

function asCriteriaHistory(raw: unknown): GoalCriteria[] | undefined {
    if (!Array.isArray(raw)) return undefined;
    const out: GoalCriteria[] = [];
    for (const c of raw) {
        const text = typeof (c as any)?.text === "string" ? (c as any).text.trim().slice(0, CRITERIA_TEXT_MAX) : "";
        if (!text) continue;
        const since = Number((c as any)?.since);
        out.push({ text, since: Number.isFinite(since) && since > 0 ? since : Date.now() });
        if (out.length >= CRITERIA_HISTORY_CAP) break;
    }
    return out.length > 0 ? out : undefined;
}

/** BI-16：更新完成定义——与现行定义相同则无操作；不同则追加历史（旧定义保留）；空文本忽略 */
export function setCriteria(goal: LearningGoal, text: string, now: number = Date.now()): boolean {
    const clean = (text ?? "").trim().slice(0, CRITERIA_TEXT_MAX);
    if (!clean) return false;
    const history = goal.criteriaHistory ?? [];
    const latest = history[history.length - 1];
    if (latest?.text === clean) return false;
    goal.criteriaHistory = [...history, { text: clean, since: now }].slice(-CRITERIA_HISTORY_CAP);
    return true;
}

/** BI-16：现行完成定义（无记录返回空串） */
export function currentCriteria(goal: LearningGoal): string {
    const h = goal.criteriaHistory;
    return h && h.length > 0 ? h[h.length - 1].text : "";
}

/** BI-11：目标优先级白名单（多目标取舍：主目标优先展示入口与建议） */
export const GOAL_PRIORITIES = ["primary", "keep", "pause"] as const;
export type GoalPriority = (typeof GOAL_PRIORITIES)[number];
const PRIORITY_TIER: Record<GoalPriority, number> = { primary: 0, keep: 1, pause: 2 };

function asPriority(v: unknown): GoalPriority | undefined {
    return typeof v === "string" && (GOAL_PRIORITIES as readonly string[]).includes(v) ? (v as GoalPriority) : undefined;
}

/** BI-11：按优先级分层排序（primary → keep → pause；同层保持 createdAt 升序稳定）。
 * 纯展示序：不改 due、不写内核、不改变任何调度语义（验收硬性要求）。 */
export function sortGoalsByPriority(goals: LearningGoal[]): LearningGoal[] {
    return [...goals].sort((a, b) => {
        const ta = PRIORITY_TIER[a.priority ?? "keep"];
        const tb = PRIORITY_TIER[b.priority ?? "keep"];
        return ta !== tb ? ta - tb : a.createdAt - b.createdAt;
    });
}

export interface LearningGoalsData {
    version: 1;
    goals: LearningGoal[];
}

export function emptyGoals(): LearningGoalsData {
    return { version: 1, goals: [] };
}

function asLevel(v: unknown): LearnerLevel {
    return typeof v === "string" && (LEVELS as readonly string[]).includes(v) ? (v as LearnerLevel) : "beginner";
}

function asDateOrNull(v: unknown): string | null {
    return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/** 白名单清洗：缺 id 剔除、目的非法回 review、非法材料 ID 剔除去重 */
export function normalizeGoals(raw: unknown): LearningGoalsData {
    const arr = (raw as any)?.goals;
    if (!Array.isArray(arr)) return emptyGoals();
    const seen = new Set<string>();
    const goals: LearningGoal[] = [];
    for (const g of arr) {
        if (!g || typeof g !== "object" || typeof g.id !== "string" || !g.id || seen.has(g.id)) continue;
        seen.add(g.id);
        const rawMaterials: unknown[] = Array.isArray(g.materialBlockIDs) ? g.materialBlockIDs : [];
        const materials = [...new Set(rawMaterials.filter((x): x is string => typeof x === "string" && x !== ""))];
        const createdAt = Number.isFinite(Number(g.createdAt)) ? Number(g.createdAt) : Date.now();
        goals.push({
            id: g.id,
            purpose: normalizePurpose(g.purpose) ?? "review",
            deadline: asDateOrNull(g.deadline),
            materialBlockIDs: materials,
            minutesPerDay: Number.isFinite(Number(g.minutesPerDay)) && Number(g.minutesPerDay) > 0 ? Math.floor(Number(g.minutesPerDay)) : 0,
            level: asLevel(g.level),
            priority: asPriority(g.priority),
            criteriaHistory: asCriteriaHistory(g.criteriaHistory),
            createdAt,
            updatedAt: Number.isFinite(Number(g.updatedAt)) ? Number(g.updatedAt) : createdAt,
        });
    }
    return { version: 1, goals };
}

/** 距截止日天数（同日=0；已过=负；无截止=null） */
export function daysUntilDeadline(goal: LearningGoal, today: string): number | null {
    if (!goal.deadline) return null;
    const d = (Date.parse(goal.deadline) - Date.parse(today)) / 86400000;
    return Number.isFinite(d) ? Math.round(d) : null;
}

/** 目标是否仍活跃（无截止视为活跃；截止日当天仍活跃） */
export function isGoalActive(goal: LearningGoal, today: string): boolean {
    const d = daysUntilDeadline(goal, today);
    return d === null || d >= 0;
}

/** 目标每日分钟建议（BI-2 目的 × 水平的粗略推荐，向导可用可不用） */
export function suggestedMinutes(purpose: SessionPurpose, level: LearnerLevel): number {
    const base = purpose === "review" || purpose === "maintain" ? 15 : 25;
    const factor = level === "novice" ? 1 : level === "beginner" ? 1.2 : level === "intermediate" ? 1.5 : 2;
    return Math.round((base * factor) / 5) * 5;
}
