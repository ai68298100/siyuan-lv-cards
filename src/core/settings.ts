/**
 * 设置持久化与默认值。插件私有数据走 loadData/saveData（data/storage/petal/siyuan-lv-cards/）。
 */
import { MODULE_DEFS, MODULE_IDS, LEGACY_MODULE_IDS } from "./modules";
import type { PersonaId } from "./personas";

export interface LvCardsSettings {
    version: number;
    /** 当前画像（预设应用后用户微调即转 custom） */
    persona: PersonaId;
    /** 各功能模块开关（key 见 modules.ts） */
    modules: Record<string, boolean>;
    /** 每日目标：新卡/复习卡（本地统计与提醒用） */
    dailyNewTarget: number;
    dailyReviewTarget: number;
    /** 评分按钮风格：four=Anki 式 4 档，three=墨墨式 认识/模糊/不认识 */
    ratingStyle: "four" | "three";
    /** 超时模式：关 / 超时自动翻面 / 超时自动评遗忘 */
    timeoutMode: "off" | "reveal" | "forget";
    timeoutSeconds: number;
    /** 随机顺序 */
    randomOrder: boolean;
    /** leech 判定阈值（遗忘次数） */
    leechThreshold: number;
    /** 每日到期提醒（Notification） */
    reminderEnabled: boolean;
    /** 提醒时间 HH:mm */
    reminderTime: string;
    /** 考试模式 */
    examEnabled: boolean;
    /** 考试日期 YYYY-MM-DD，空为未设置 */
    examDate: string;
    /** AI 配置（M2·FR7）：siyuan=思源内置 AI；custom=OpenAI 兼容端点 */
    aiMode: "siyuan" | "custom";
    aiEndpoint: string;
    aiKey: string;
    aiModel: string;
}

const SETTINGS_VERSION = 1;

export function defaultSettings(): LvCardsSettings {
    const modules: Record<string, boolean> = {};
    for (const m of MODULE_DEFS) {
        modules[m.id] = m.defaultOn;
    }
    return {
        version: SETTINGS_VERSION,
        persona: "custom",
        modules,
        dailyNewTarget: 20,
        dailyReviewTarget: 200,
        ratingStyle: "four",
        timeoutMode: "off",
        timeoutSeconds: 60,
        randomOrder: false,
        leechThreshold: 8,
        reminderEnabled: true,
        reminderTime: "20:00",
        examEnabled: false,
        examDate: "",
        aiMode: "siyuan",
        aiEndpoint: "",
        aiKey: "",
        aiModel: "",
    };
}

export function normalizeSettings(raw: unknown): LvCardsSettings {
    const def = defaultSettings();
    if (!raw || typeof raw !== "object") {
        return def;
    }
    const obj = raw as Partial<LvCardsSettings> & { modules?: Record<string, unknown> };
    const merged: LvCardsSettings = {
        ...def,
        ...obj,
        version: SETTINGS_VERSION,
        persona: normalizePersona(obj.persona),
        modules: { ...def.modules },
    };
    if (obj.modules && typeof obj.modules === "object") {
        for (const [key, value] of Object.entries(obj.modules)) {
            if (typeof value !== "boolean") {
                continue;
            }
            // 旧 ID 迁移；被合并的旧模块（fsrsPanel）直接丢弃
            const migrated = LEGACY_MODULE_IDS[key] === undefined ? key : LEGACY_MODULE_IDS[key];
            if (migrated && MODULE_IDS.includes(migrated)) {
                merged.modules[migrated] = value;
            }
        }
    }
    return merged;
}

function normalizePersona(value: unknown): PersonaId {
    return value === "exam" || value === "notes" || value === "language" || value === "custom" ? value : "custom";
}
