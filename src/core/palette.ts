/**
 * T13 ⌘K 命令面板（纯逻辑，node 可单测；docs/41 P0 · docs/42 §3.10）。
 * 设计：动作/导航统一为扁平命令表，面板组件只消费过滤+分组结果；
 * 匹配口径 = label/keywords 子串包含（小写折叠），空查询保持原序全量。
 */

export interface PaletteCommand {
    /** 稳定 id（选中态/测试断言用） */
    id: string;
    /** 分组键：同组连续渲染；组顺序 = 首次出现顺序 */
    group: string;
    /** 展示文本 */
    label: string;
    /** 右侧提示（kbd 或说明），可选 */
    hint?: string;
    /** 额外匹配词（空格分隔），如英文别名，可选 */
    keywords?: string;
}

export interface PaletteGroup {
    group: string;
    items: PaletteCommand[];
}

/** 小写折叠匹配：label 或 keywords 含 query 即命中 */
export function matchPaletteCommand(cmd: PaletteCommand, query: string): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const haystack = `${cmd.label}\n${cmd.keywords ?? ""}`.toLowerCase();
    return haystack.includes(q);
}

/** 过滤 + 按组聚合（组序 = 首次出现顺序，组内保持原序）；limit 限制总条数 */
export function filterPaletteCommands(cmds: PaletteCommand[], query: string, limit = 12): PaletteGroup[] {
    const groups: PaletteGroup[] = [];
    const byGroup = new Map<string, PaletteCommand[]>();
    let total = 0;
    for (const cmd of cmds) {
        if (total >= limit) break;
        if (!matchPaletteCommand(cmd, query)) continue;
        let bucket = byGroup.get(cmd.group);
        if (!bucket) {
            bucket = [];
            byGroup.set(cmd.group, bucket);
            groups.push({ group: cmd.group, items: bucket });
        }
        bucket.push(cmd);
        total += 1;
    }
    return groups;
}

/** 扁平化（键盘上下移动的可见序 = 组序 + 组内序） */
export function flattenPaletteGroups(groups: PaletteGroup[]): PaletteCommand[] {
    return groups.flatMap(g => g.items);
}
