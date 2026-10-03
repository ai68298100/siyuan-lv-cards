/**
 * BI-4 材料筛选收件箱（纯逻辑，node 可单测）。
 * 设计：材料块先进入收件箱（inbox），筛选后暂存（staged）或选中（selected），
 * 选中材料可送入制卡管线。只读收集不产生 due，批量确认可撤销。
 * 状态流转：inbox → staged → selected（正向）；任意状态 → dismissed（淘汰）。
 * 存储位置：`data/storage/petal/siyuan-lv-cards/inbox.json`（与 settings/revlog 同目录）。
 */

export const INBOX_STATUSES = ["inbox", "staged", "selected", "dismissed"] as const;
export type InboxStatus = (typeof INBOX_STATUSES)[number];

export interface InboxItem {
    blockID: string;
    status: InboxStatus;
    addedAt: number;
    updatedAt: number;
}

export interface InboxData {
    version: 1;
    items: InboxItem[];
}

export function emptyInbox(): InboxData {
    return { version: 1, items: [] };
}

export function normalizeInbox(raw: unknown): InboxData {
    const arr = (raw as any)?.items;
    if (!Array.isArray(arr)) return emptyInbox();
    const seen = new Set<string>();
    const items: InboxItem[] = [];
    for (const r of arr) {
        if (!r || typeof r !== "object") continue;
        const blockID = typeof r.blockID === "string" && r.blockID ? r.blockID : "";
        const status = INBOX_STATUSES.includes(r.status) ? (r.status as InboxStatus) : "inbox";
        if (!blockID || seen.has(blockID)) continue;
        seen.add(blockID);
        const addedAt = Number.isFinite(Number(r.addedAt)) ? Number(r.addedAt) : Date.now();
        const updatedAt = Number.isFinite(Number(r.updatedAt)) ? Number(r.updatedAt) : addedAt;
        items.push({ blockID, status, addedAt, updatedAt });
    }
    return { version: 1, items };
}

/** 添加材料到收件箱（已存在则返回 false） */
export function addInboxItem(data: InboxData, blockID: string, now: number = Date.now()): boolean {
    if (!blockID || data.items.some(i => i.blockID === blockID)) return false;
    data.items.push({ blockID, status: "inbox", addedAt: now, updatedAt: now });
    return true;
}

/** 设置单个材料状态（流转或淘汰） */
export function setInboxStatus(data: InboxData, blockID: string, status: InboxStatus, now: number = Date.now()): boolean {
    const item = data.items.find(i => i.blockID === blockID);
    if (!item || item.status === status) return false;
    item.status = status;
    item.updatedAt = now;
    return true;
}

/** 批量设置状态：返回变更数 */
export function bulkSetStatus(data: InboxData, blockIDs: string[], status: InboxStatus, now: number = Date.now()): number {
    let changed = 0;
    for (const id of blockIDs) {
        if (setInboxStatus(data, id, status, now)) changed++;
    }
    return changed;
}

/** 按状态查询（排除 dismissed） */
export function getByStatus(data: InboxData, status: InboxStatus): InboxItem[] {
    return data.items.filter(i => i.status === status).sort((a, b) => a.addedAt - b.addedAt);
}

/** 移除材料（从收件箱完全删除） */
export function removeInboxItem(data: InboxData, blockID: string): boolean {
    const before = data.items.length;
    data.items = data.items.filter(i => i.blockID !== blockID);
    return data.items.length !== before;
}

/** 撤销：将 selected 打回 staged（批量确认可撤销） */
export function undoSelection(data: InboxData, blockIDs: string[], now: number = Date.now()): number {
    let changed = 0;
    for (const id of blockIDs) {
        const item = data.items.find(i => i.blockID === id && i.status === "selected");
        if (item) {
            item.status = "staged";
            item.updatedAt = now;
            changed++;
        }
    }
    return changed;
}
