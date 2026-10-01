/**
 * 功能模块注册中心 —— 对齐 docs/11 的 M1-M12。
 * 模块声明 persona 亲和与阶段；设置面板/画像预设/入口装配全部由此驱动。
 */

export type ModulePhase = "v0.1" | "v0.9" | "v1.0" | "v1.x" | "v2.x";
export type Persona = "exam" | "notes" | "language";

export interface CardModuleDef {
    id: string;
    nameKey: string;
    descKey: string;
    defaultOn: boolean;
    phase: ModulePhase;
    /** 画像亲和；"all" = 全画像 */
    personas: Persona[] | "all";
    /** 基础设施模块（网关），不可关闭 */
    locked?: boolean;
}

export const MODULE_DEFS: CardModuleDef[] = [
    { id: "gateway", nameKey: "gateway", descKey: "gateway_desc", defaultOn: true, phase: "v0.1", personas: "all", locked: true },
    { id: "review", nameKey: "review", descKey: "review_desc", defaultOn: true, phase: "v0.1", personas: "all" },
    { id: "stats", nameKey: "stats", descKey: "stats_desc", defaultOn: true, phase: "v0.1", personas: "all" },
    { id: "manager", nameKey: "manager", descKey: "manager_desc", defaultOn: true, phase: "v0.1", personas: "all" },
    { id: "create", nameKey: "create", descKey: "create_desc", defaultOn: true, phase: "v0.9", personas: "all" },
    { id: "exam", nameKey: "exam", descKey: "exam_desc", defaultOn: false, phase: "v1.0", personas: ["exam"] },
    { id: "cardTypes", nameKey: "cardTypes", descKey: "cardTypes_desc", defaultOn: false, phase: "v1.x", personas: ["exam", "language"] },
    { id: "gamify", nameKey: "gamify", descKey: "gamify_desc", defaultOn: false, phase: "v1.x", personas: ["exam", "language"] },
    { id: "ankiBridge", nameKey: "ankiBridge", descKey: "ankiBridge_desc", defaultOn: false, phase: "v1.x", personas: ["notes"] },
    { id: "dataHealth", nameKey: "dataHealth", descKey: "dataHealth_desc", defaultOn: true, phase: "v1.x", personas: "all" },
    { id: "ecosystem", nameKey: "ecosystem", descKey: "ecosystem_desc", defaultOn: true, phase: "v1.x", personas: "all" },
];

/** 旧版模块 ID → 新 ID（settings 迁移用） */
export const LEGACY_MODULE_IDS: Record<string, string | null> = {
    dashboard: "stats",
    fsrsPanel: null,        // 并入设置的学习偏好，不再是独立模块
    dailyGoal: "gamify",
    examMode: "exam",
    ankiImport: "ankiBridge",
    aiGen: "create",
    typeAnswer: "cardTypes",
};

export const SWITCHABLE_MODULE_IDS = MODULE_DEFS.filter(m => !m.locked).map(m => m.id);
export const MODULE_IDS = MODULE_DEFS.map(m => m.id);
