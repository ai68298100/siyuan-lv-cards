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
    /** 每批拉取数量（0=跟随内核上限） */
    batchLimit: number;
    /** 打字模式：所有卡作答输入后判分（M4·FR2 全局练习模式） */
    typingEnabled: boolean;
    /** 打字判分宽松：忽略大小写/空白/标点 */
    typingStrict: boolean;
    /** 听写模式：自动朗读答案，输入听写（需打字模式+TTS） */
    dictationEnabled: boolean;
    /** 选择题练习模式：问题态可将本卡转为四选一（干扰项取自同队列） */
    choiceEnabled: boolean;
    /** 忘记卡本批重现：评 1 的卡在批尾再出现一次（会话内强化，不动内核调度） */
    requeueAgain: boolean;
    /** XP/等级激励（M8·FR3，默认关）：由本地复习日志推导 */
    xpEnabled: boolean;
    /** 标记符制卡（M2·FR4）：`术语:: 定义` 与 以「？」结尾的块可扫描成卡，命令触发 */
    markerEnabled: boolean;
    /** Gateway 探测结果落库（320）：最近一次 V2 探测状态（加载时刷新，重探即写+广播） */
    gatewayState: string;
    /** 卡面字号缩放（438）：0.85-1.25，1=跟随主题 */
    cardFontScale: number;
    /** 热力图范围（439）：周数 */
    heatmapWeeks: number;
    /** 角标刷新间隔秒（440）：0=关闭心跳 */
    badgeRefreshSec: number;
    /** 评分按钮密度（441）：cozy 舒适 / compact 紧凑 */
    ratingDensity: "cozy" | "compact";
    /** 答案揭示前隐藏卡面元信息（442）：新卡章/复习次数/卡组名 */
    hideMetaUntilAnswer: boolean;
    /** 队列倒序（431）：内核到期顺序反转（最新到期优先） */
    reverseOrder: boolean;
    /** leech 判定阈值（遗忘次数） */
    leechThreshold: number;
    /** 答案朗读（TTS，Web Speech） */
    ttsEnabled: boolean;
    /** 朗读语速 0.5-2 */
    ttsRate: number;
    /** 朗读语音名称（空=系统默认） */
    ttsVoice: string;
    /** 免打扰时段起（HH:mm），时段内不弹积压/庆祝提示 */
    quietStart: string;
    /** 免打扰时段止（HH:mm，跨午夜支持） */
    quietEnd: string;
    /** 每日到期提醒（Notification） */
    reminderEnabled: boolean;
    /** 提醒时间 HH:mm */
    reminderTime: string;
    /** 积压预警阈值（天） */
    backlogDays: number;
    /** 评分音效（Web Audio 合成，无文件依赖） */
    sfxEnabled: boolean;
    /** 音效风格（250）：chime 清音 / wood 木鱼 / bell 铃 */
    sfxStyle: "chime" | "wood" | "bell";
    /** 考试模式 */
    examEnabled: boolean;
    /** 考试日期 YYYY-MM-DD，空为未设置 */
    examDate: string;
    /** 已存筛选（管理器命名收藏，M6） */
    savedFilters: { name: string; filter: string }[];
    /** AI 配置（M2·FR7）：siyuan=思源内置 AI；custom=OpenAI 兼容端点 */
    aiMode: "siyuan" | "custom";
    aiEndpoint: string;
    aiKey: string;
    aiModel: string;
    /** AI 备用端点（300 回退链）：主端点失败自动切换（custom 模式） */
    aiFallbackEndpoint: string;
    aiFallbackKey: string;
    aiFallbackModel: string;
    /** Prompt 模板（294）：自定义 system 模板，空=内置默认；支持 ${count}/${language}/${type} 占位符 */
    aiPromptTemplate: string;
    /** 快速制卡/标记制卡落盘笔记本（605）：id，空=第一个打开的笔记本 */
    targetNotebookId: string;
    /** 每日一语（375）：完成页展示学习科学小贴士 */
    dailyTipEnabled: boolean;
    /** AnkiConnect 客户端（M9·FR1）：连本机 Anki Desktop */
    ankiClientUrl: string;
    ankiClientKey: string;
    /** 复习舞台最大宽度 px（AC） */
    cardMaxWidth: number;
    /** 记忆：上次所在中心子页 / 上次复习范围 */
    lastHubTab: string;
    lastReviewScope: string;
    /** Onboarding 已完成 */
    onboarded: boolean;
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
        batchLimit: 0,
        typingEnabled: false,
        typingStrict: true,
        dictationEnabled: false,
        choiceEnabled: false,
        requeueAgain: true,
        xpEnabled: false,
        markerEnabled: true,
        gatewayState: "",
        cardFontScale: 1,
        heatmapWeeks: 17,
        badgeRefreshSec: 60,
        ratingDensity: "cozy",
        hideMetaUntilAnswer: false,
        reverseOrder: false,
        leechThreshold: 8,
        ttsEnabled: true,
        ttsRate: 1,
        ttsVoice: "",
        quietStart: "23:00",
        quietEnd: "08:00",
        reminderEnabled: true,
        reminderTime: "20:00",
        backlogDays: 3,
        sfxEnabled: false,
        sfxStyle: "chime",
        examEnabled: false,
        examDate: "",
        savedFilters: [],
        aiMode: "siyuan",
        aiEndpoint: "",
        aiKey: "",
        aiModel: "",
        aiFallbackEndpoint: "",
        aiFallbackKey: "",
        aiFallbackModel: "",
        aiPromptTemplate: "",
        targetNotebookId: "",
        dailyTipEnabled: true,
        ankiClientUrl: "http://127.0.0.1:8765",
        ankiClientKey: "",
        cardMaxWidth: 880,
        lastHubTab: "overview",
        lastReviewScope: "all",
        onboarded: false,
    };
}

/** 数值字段规格（AQ-22）：[默认值, min, max]，写入前 round；浮点字段单独表 */
const INT_FIELDS: [keyof LvCardsSettings, number, number, number][] = [
    ["dailyNewTarget", 20, 0, 9999],
    ["dailyReviewTarget", 200, 0, 9999],
    ["timeoutSeconds", 60, 5, 3600],
    ["batchLimit", 0, 0, 500],
    ["leechThreshold", 8, 1, 100],
    ["backlogDays", 3, 1, 90],
    ["cardMaxWidth", 880, 320, 1600],
];
const FLOAT_FIELDS: [keyof LvCardsSettings, number, number, number][] = [
    ["cardFontScale", 1, 0.85, 1.25],
    ["ttsRate", 1, 0.5, 2],
];
/** 枚举字段规格：字符串枚举与离散数值共用白名单语义 */
const ENUM_FIELDS: [keyof LvCardsSettings, readonly string[], string][] = [
    ["ratingStyle", ["four", "three"], "four"],
    ["timeoutMode", ["off", "reveal", "forget"], "off"],
    ["ratingDensity", ["cozy", "compact"], "cozy"],
    ["sfxStyle", ["chime", "wood", "bell"], "chime"],
    ["aiMode", ["siyuan", "custom"], "siyuan"],
];
const BOOL_FIELDS: (keyof LvCardsSettings)[] = [
    "randomOrder", "typingEnabled", "typingStrict", "dictationEnabled", "choiceEnabled", "requeueAgain",
    "xpEnabled", "markerEnabled", "hideMetaUntilAnswer", "reverseOrder", "ttsEnabled", "reminderEnabled",
    "sfxEnabled", "examEnabled", "dailyTipEnabled", "onboarded",
];
const STR_FIELDS: (keyof LvCardsSettings)[] = [
    "gatewayState", "ttsVoice", "aiEndpoint", "aiKey", "aiModel", "aiFallbackEndpoint", "aiFallbackKey",
    "aiFallbackModel", "aiPromptTemplate", "targetNotebookId", "ankiClientKey", "lastHubTab", "lastReviewScope",
];

export function normalizeSettings(raw: unknown): LvCardsSettings {
    const def = defaultSettings();
    if (!raw || typeof raw !== "object") {
        return def;
    }
    const obj = raw as Partial<LvCardsSettings> & Record<string, unknown>;
    // 未知字段经展开保留（ADR-5：前向兼容只增不删）；已知字段逐项校验（AQ-22）
    const merged: LvCardsSettings = {
        ...def,
        ...obj,
        version: SETTINGS_VERSION,
        persona: normalizePersona(obj.persona),
        modules: normalizeModules(obj.modules, def.modules),
        heatmapWeeks: pick(obj.heatmapWeeks, [17, 26, 52], 17),
        badgeRefreshSec: toBadgeSec(obj.badgeRefreshSec),
        quietStart: toHHMM(obj.quietStart, def.quietStart),
        quietEnd: toHHMM(obj.quietEnd, def.quietEnd),
        reminderTime: toHHMM(obj.reminderTime, def.reminderTime),
        examDate: toDateStr(obj.examDate),
        savedFilters: toFilters(obj.savedFilters),
        ankiClientUrl: toStr(obj.ankiClientUrl, def.ankiClientUrl),
    } as LvCardsSettings;
    for (const [key, d, min, max] of INT_FIELDS) {
        (merged as unknown as Record<string, unknown>)[key] = toInt(obj[key], d, min, max);
    }
    for (const [key, d, min, max] of FLOAT_FIELDS) {
        (merged as unknown as Record<string, unknown>)[key] = toNum(obj[key], d, min, max);
    }
    for (const [key, allowed, d] of ENUM_FIELDS) {
        (merged as unknown as Record<string, unknown>)[key] = pickStr(obj[key], allowed, d);
    }
    for (const key of BOOL_FIELDS) {
        (merged as unknown as Record<string, unknown>)[key] = toBool(obj[key], def[key] as boolean);
    }
    for (const key of STR_FIELDS) {
        (merged as unknown as Record<string, unknown>)[key] = toStr(obj[key]);
    }
    return merged;
}

function normalizeModules(raw: unknown, defModules: Record<string, boolean>): Record<string, boolean> {
    const merged = { ...defModules };
    if (!raw || typeof raw !== "object") {
        return merged;
    }
    for (const [key, value] of Object.entries(raw)) {
        if (typeof value !== "boolean") {
            continue;
        }
        // 旧 ID 迁移；被合并的旧模块（fsrsPanel）直接丢弃
        const migrated = LEGACY_MODULE_IDS[key] === undefined ? key : LEGACY_MODULE_IDS[key];
        if (migrated && MODULE_IDS.includes(migrated)) {
            merged[migrated] = value;
        }
    }
    return merged;
}

function normalizePersona(value: unknown): PersonaId {
    return value === "exam" || value === "notes" || value === "language" || value === "custom" ? value : "custom";
}

/** 数值修复：数字/纯数字字符串收敛为有限数并钳制范围，其余回默认（AQ-22） */
function toNum(v: unknown, def: number, min: number, max: number): number {
    const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
    if (!Number.isFinite(n)) {
        return def;
    }
    return Math.min(max, Math.max(min, n));
}

function toInt(v: unknown, def: number, min: number, max: number): number {
    return Math.round(toNum(v, def, min, max));
}

/** 角标心跳：0=关闭合法；其余 5-3600 秒 */
function toBadgeSec(v: unknown): number {
    const n = toInt(v, 60, 0, 3600);
    return n === 0 ? 0 : Math.max(5, n);
}

function toBool(v: unknown, def: boolean): boolean {
    return typeof v === "boolean" ? v : def;
}

function toStr(v: unknown, def = ""): string {
    return typeof v === "string" ? v : def;
}

/** HH:mm 白名单格式（免打扰/提醒时间），非法回默认 */
function toHHMM(v: unknown, def: string): string {
    return typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : def;
}

/** 考试日期：空串或 YYYY-MM-DD，非法清空 */
function toDateStr(v: unknown): string {
    return typeof v === "string" && (/^\d{4}-\d{2}-\d{2}$/.test(v) || v === "") ? v : "";
}

/** 离散合法值（热力图周数），不在集合回默认 */
function pick(v: unknown, allowed: number[], def: number): number {
    return allowed.includes(v as number) ? (v as number) : def;
}

function pickStr<T extends string>(v: unknown, allowed: readonly T[], def: T): T {
    return allowed.includes(v as T) ? (v as T) : def;
}

/** 已存筛选：条目逐个校验 name+filter 均为字符串，上限 50 条 */
function toFilters(v: unknown): { name: string; filter: string }[] {
    if (!Array.isArray(v)) {
        return [];
    }
    return v
        .filter((f): f is { name: string; filter: string } =>
            !!f && typeof f === "object" && typeof (f as any).name === "string" && typeof (f as any).filter === "string")
        .slice(0, 50);
}
