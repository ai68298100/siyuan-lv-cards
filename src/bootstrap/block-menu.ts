/**
 * 块图标与选区制卡菜单构建引擎（BlockMenu）
 * 统筹思源笔记编辑器点击块图标时弹出的菜单项构建（添加到卡组/收件箱/选区挖空/图片遮挡/从卡组移除），
 * 采用逻辑计算与原生 Menu 分离，便于离线测试。
 */

export interface BlockElementLike {
    getAttribute?(attr: string): string | null;
    dataset?: Record<string, string | undefined>;
}

/**
 * 从 DOM 元素数组中安全提取有效块 ID
 */
export function extractBlockIDs(elements?: BlockElementLike[]): string[] {
    if (!Array.isArray(elements) || elements.length === 0) {
        return [];
    }
    return elements
        .map(el => el.getAttribute?.("data-node-id") || el.dataset?.nodeId || "")
        .filter(Boolean);
}

export interface BlockMenuItemDescriptor {
    id: "add-to-deck" | "add-to-inbox" | "make-cloze" | "make-occlusion" | "remove-from-deck";
    icon: string;
    label: string;
    click: () => void | Promise<void>;
}

export interface BlockMenuConfig {
    blockIDs: string[];
    modules: {
        inbox?: boolean;
    };
    i18n: Record<string, any>;
    actions: {
        addToDeck: (blockIDs: string[]) => void;
        addToInbox?: (blockIDs: string[]) => void;
        makeCloze?: (blockID: string) => void;
        makeOcclusion?: (blockID: string) => void;
        removeFromDeck: (blockIDs: string[]) => void;
    };
}

/**
 * 计算块图标菜单项列表（纯逻辑）
 */
export function computeBlockMenuItems(config: BlockMenuConfig): BlockMenuItemDescriptor[] {
    const { blockIDs, modules, i18n, actions } = config;
    if (blockIDs.length === 0) {
        return [];
    }

    const items: BlockMenuItemDescriptor[] = [];
    const countSuffix = blockIDs.length > 1 ? ` ×${blockIDs.length}` : "";

    items.push({
        id: "add-to-deck",
        icon: "iconLvCards",
        label: (i18n.menuAddToDeck ?? "添加到卡组") + countSuffix,
        click: () => actions.addToDeck(blockIDs),
    });

    if (modules.inbox && actions.addToInbox) {
        items.push({
            id: "add-to-inbox",
            icon: "iconLvCards",
            label: (i18n.menuAddToInbox ?? "加入材料收件箱") + countSuffix,
            click: () => actions.addToInbox?.(blockIDs),
        });
    }

    if (blockIDs.length === 1) {
        if (actions.makeCloze) {
            items.push({
                id: "make-cloze",
                icon: "iconLvCards",
                label: i18n.menuMakeCloze ?? "挖空并制卡",
                click: () => actions.makeCloze?.(blockIDs[0]),
            });
        }
        if (actions.makeOcclusion) {
            items.push({
                id: "make-occlusion",
                icon: "iconLvCards",
                label: i18n.menuMakeOcclusion ?? "图片遮挡制卡",
                click: () => actions.makeOcclusion?.(blockIDs[0]),
            });
        }
    }

    items.push({
        id: "remove-from-deck",
        icon: "iconLvCards",
        label: i18n.menuRemoveFromDeck ?? "从卡组移除",
        click: () => actions.removeFromDeck(blockIDs),
    });

    return items;
}

/**
 * 包装文本为思源挖空 Markdown 语法
 */
export function formatClozeText(text: string): string {
    const trimmed = text.trim();
    return trimmed ? `==${trimmed}==` : "";
}
