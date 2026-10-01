/**
 * 画像预设包（docs/10 §2、M12·FR1）。
 * 预设只覆盖模块开关与推荐参数，应用后仍可自由微调；"custom" 表示用户手动调整过的状态。
 */
import type { Persona } from "./modules";

export type PersonaId = Persona | "custom";

export interface PersonaPreset {
    id: Exclude<PersonaId, "custom">;
    nameKey: string;
    descKey: string;
    modules: Record<string, boolean>;
    params: {
        ratingStyle?: "four" | "three";
        timeoutMode?: "off" | "reveal" | "forget";
        timeoutSeconds?: number;
        dailyNewTarget?: number;
        dailyReviewTarget?: number;
    };
}

const ALL_ON = ["gateway", "review", "stats", "manager", "create", "dataHealth", "ecosystem"];

export const PERSONA_PRESETS: PersonaPreset[] = [
    {
        id: "exam",
        nameKey: "personaExam",
        descKey: "personaExam_desc",
        modules: { ...idsOn([...ALL_ON, "exam", "cardTypes", "gamify"]), ankiBridge: false },
        params: { ratingStyle: "four", timeoutMode: "off", dailyNewTarget: 30, dailyReviewTarget: 300 },
    },
    {
        id: "notes",
        nameKey: "personaNotes",
        descKey: "personaNotes_desc",
        modules: { ...idsOn([...ALL_ON, "ankiBridge"]), exam: false, cardTypes: false, gamify: false },
        params: { ratingStyle: "four", timeoutMode: "off", dailyNewTarget: 10, dailyReviewTarget: 100 },
    },
    {
        id: "language",
        nameKey: "personaLanguage",
        descKey: "personaLanguage_desc",
        modules: { ...idsOn([...ALL_ON, "cardTypes", "gamify"]), exam: false, ankiBridge: false },
        params: { ratingStyle: "three", timeoutMode: "reveal", timeoutSeconds: 45, dailyNewTarget: 20, dailyReviewTarget: 150 },
    },
];

function idsOn(ids: string[]): Record<string, boolean> {
    const out: Record<string, boolean> = {};
    for (const id of ids) {
        out[id] = true;
    }
    return out;
}
