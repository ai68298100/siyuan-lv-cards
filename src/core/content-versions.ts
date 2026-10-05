/**
 * T05 内容版本追踪（docs/40）：块内容保存时留快照，详情抽屉可回看历史。
 * 纯模块：清洗（坏条目剔除）、追加（连续相同跳过）、上限（每块 10 版、总块 2000）。
 * 口径：只记「保存成功」的版本；版本号 = 该块快照数，不伪造。
 */

export interface ContentVersion {
    md: string;
    at: number;
    via: "editor" | "ai";
}

export interface ContentVersionBlock {
    blockID: string;
    versions: ContentVersion[];
}

export interface ContentVersionsData {
    version: 1;
    blocks: ContentVersionBlock[];
}

export const VERSIONS_PER_BLOCK = 10;
const BLOCKS_CAP = 2000;

export function emptyContentVersions(): ContentVersionsData {
    return { version: 1, blocks: [] };
}

function asVia(v: unknown): ContentVersion["via"] {
    return v === "ai" ? "ai" : "editor";
}

/** 清洗：坏条目剔除、每块限量（保留最新）、块数限量（保留最近写入） */
export function normalizeContentVersions(raw: unknown): ContentVersionsData {
    const src = (raw as ContentVersionsData | null)?.blocks;
    if (!Array.isArray(src)) return emptyContentVersions();
    const blocks: ContentVersionBlock[] = [];
    for (const b of src) {
        const blockID = typeof b?.blockID === "string" ? b.blockID : "";
        if (!blockID || !Array.isArray(b?.versions)) continue;
        const versions: ContentVersion[] = [];
        for (const v of b.versions) {
            if (typeof v?.md !== "string" || !v.md || typeof v?.at !== "number") continue;
            versions.push({ md: v.md, at: v.at, via: asVia(v.via) });
        }
        if (versions.length === 0) continue;
        versions.sort((a, b) => a.at - b.at);
        blocks.push({ blockID, versions: versions.slice(-VERSIONS_PER_BLOCK) });
    }
    blocks.sort((a, b) => {
        const la = a.versions[a.versions.length - 1]?.at ?? 0;
        const lb = b.versions[b.versions.length - 1]?.at ?? 0;
        return lb - la;
    });
    return { version: 1, blocks: blocks.slice(0, BLOCKS_CAP) };
}

/** 追加版本（不可变）：与最新快照内容相同则跳过（无变化不造假版本） */
export function appendVersion(
    data: ContentVersionsData,
    blockID: string,
    md: string,
    at: number,
    via: ContentVersion["via"],
): ContentVersionsData {
    if (!md.trim()) return data;
    const blocks = data.blocks.map((b) => ({ blockID: b.blockID, versions: [...b.versions] }));
    let block = blocks.find((b) => b.blockID === blockID);
    if (!block) {
        block = { blockID, versions: [] };
        blocks.push(block);
    }
    const last = block.versions[block.versions.length - 1];
    if (last && last.md === md) return data;
    block.versions.push({ md, at, via });
    if (block.versions.length > VERSIONS_PER_BLOCK) {
        block.versions = block.versions.slice(-VERSIONS_PER_BLOCK);
    }
    return normalizeContentVersions({ version: 1, blocks });
}

export function versionsOf(data: ContentVersionsData, blockID: string): ContentVersion[] {
    return [...(data.blocks.find((b) => b.blockID === blockID)?.versions ?? [])].reverse(); // 最新在前
}
