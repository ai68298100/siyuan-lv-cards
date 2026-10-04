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
    createdAt: number;
    updatedAt: number;
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
