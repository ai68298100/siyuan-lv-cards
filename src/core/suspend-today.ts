/**
 * 「今天不学」本地屏蔽（M3·FR5）：卡片次日 0 点自动恢复，不触碰内核调度。
 * 存储：suspend-today.json（data/storage/petal/siyuan-lv-cards/）
 */
import { localDate } from "./revlog";

export interface SuspendTodayData {
    date: string;
    cardIDs: string[];
}

export function emptySuspendToday(): SuspendTodayData {
    return { date: localDate(Date.now()), cardIDs: [] };
}

export function normalizeSuspendToday(raw: unknown): SuspendTodayData {
    const data = raw && typeof raw === "object"
        ? (raw as Partial<SuspendTodayData>)
        : null;
    if (!data || !Array.isArray(data.cardIDs)) {
        return emptySuspendToday();
    }
    return { date: typeof data.date === "string" ? data.date : "", cardIDs: data.cardIDs };
}

/** 跨天时清空（返回 true 表示发生了重置，调用方需保存） */
export function rollDateIfNeeded(data: SuspendTodayData): boolean {
    const today = localDate(Date.now());
    if (data.date !== today) {
        data.date = today;
        data.cardIDs = [];
        return true;
    }
    return false;
}

export function isSuspended(data: SuspendTodayData, cardID: string): boolean {
    return data.cardIDs.includes(cardID);
}

export function suspend(data: SuspendTodayData, cardID: string): void {
    rollDateIfNeeded(data);
    if (!data.cardIDs.includes(cardID)) {
        data.cardIDs.push(cardID);
    }
}
