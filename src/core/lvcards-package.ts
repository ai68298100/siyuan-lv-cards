/**
 * 原生小驴闪卡分享包（.lvcards 单文件格式，P1 规划与生态互通）
 * 1. 结构纯净：单文件 JSON 规范（format: "lvcards.v1"），包含卡组定义、卡片正文、题型、助记便签与可选 FSRS 参数建议；
 * 2. 导入自动去重：依据正文指纹与 ID 对齐现有卡库，分类为新卡、重复项与修改项，杜绝重复导入；
 * 3. 本地优先：零云端账号依赖，支持直接文件分享、导入与离线归档。
 */

export interface LvPackageCard {
    /** 卡片唯一标识（导入时供幂等与引用对齐） */
    id: string;
    /** 卡片正文（Markdown 格式，含 ==挖空== 或 问答排版） */
    markdown: string;
    /** 卡片题型 */
    kind: "qa" | "cloze" | "code" | "list";
    /** 提炼的问题题干（可选） */
    question?: string;
    /** 提炼的参考答案（可选） */
    answer?: string;
    /** 助记便签 / 记忆线索（随卡流转） */
    memo?: string;
    /** 标签列表 */
    tags?: string[];
    /** 推荐的初始调度参数（供导入方参考） */
    fsrsParams?: {
        difficulty?: number;
        stability?: number;
    };
}

export interface LvCardsPackage {
    /** 规范版本声明 */
    format: "lvcards.v1";
    /** 规范版本号 */
    version: number;
    /** 打包时间戳（毫秒） */
    createdAt: number;
    /** 生成工具声明 */
    generator: string;
    /** 卡组定义 */
    deck: {
        id: string;
        name: string;
        description?: string;
    };
    /** 卡片清单 */
    cards: LvPackageCard[];
    /** 统计元信息 */
    metadata?: {
        cardCount: number;
        tags?: string[];
    };
}

export interface LvCardsImportPreview {
    /** 卡组名称 */
    deckName: string;
    /** 分享包卡片总数 */
    total: number;
    /** 全新卡片清单（待新增） */
    newCards: LvPackageCard[];
    /** 完全重复卡片清单（内容一致，自动去重跳过） */
    duplicateCards: LvPackageCard[];
    /** 发生变动的卡片（ID 相同但内容改变） */
    updatedCards: {
        card: LvPackageCard;
        existing: { id: string; markdown: string };
    }[];
}

/** 规范化卡片文本指纹，用于去重对比 */
export function normalizeCardFingerprint(md: string): string {
    return (md ?? "")
        .replace(/\r\n/g, "\n")
        .trim()
        .replace(/\s+/g, " ");
}

/**
 * 序列化小驴闪卡分享包为 JSON 字符串
 */
export function serializeLvCardsPackage(
    deck: { id: string; name: string; description?: string },
    cards: LvPackageCard[],
    options?: { generator?: string }
): string {
    const pkg: LvCardsPackage = {
        format: "lvcards.v1",
        version: 1,
        createdAt: Date.now(),
        generator: options?.generator ?? "siyuan-lv-cards/v0.210.3",
        deck: {
            id: deck.id,
            name: deck.name.trim(),
            description: deck.description?.trim() || undefined,
        },
        cards: cards.map(c => ({
            id: c.id,
            markdown: c.markdown.trim(),
            kind: c.kind,
            question: c.question?.trim() || undefined,
            answer: c.answer?.trim() || undefined,
            memo: c.memo?.trim() || undefined,
            tags: c.tags?.length ? [...c.tags] : undefined,
            fsrsParams: c.fsrsParams ? { ...c.fsrsParams } : undefined,
        })),
        metadata: {
            cardCount: cards.length,
            tags: [...new Set(cards.flatMap(c => c.tags ?? []))],
        },
    };
    return JSON.stringify(pkg, null, 2);
}

/**
 * 解析并校验小驴闪卡分享包
 */
export function parseLvCardsPackage(raw: string): { ok: true; package: LvCardsPackage } | { ok: false; error: string } {
    if (!raw || typeof raw !== "string") {
        return { ok: false, error: "分享包内容为空" };
    }
    let parsed: any;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return { ok: false, error: "分享包不是合法的 JSON 格式" };
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { ok: false, error: "分享包根结构必须为 JSON 对象" };
    }

    if (parsed.format !== "lvcards.v1") {
        return { ok: false, error: `不支持的分享包格式：${String(parsed.format ?? "unknown")}` };
    }

    if (!parsed.deck || typeof parsed.deck !== "object" || typeof parsed.deck.name !== "string" || !parsed.deck.name.trim()) {
        return { ok: false, error: "分享包缺少有效的卡组名称" };
    }

    if (!Array.isArray(parsed.cards)) {
        return { ok: false, error: "分享包缺少卡片清单数据" };
    }

    const cards: LvPackageCard[] = [];
    for (const item of parsed.cards) {
        if (!item || typeof item !== "object") continue;
        const md = typeof item.markdown === "string" ? item.markdown.trim() : "";
        if (!md) continue;
        cards.push({
            id: typeof item.id === "string" ? item.id : `gen-${Math.random().toString(36).slice(2, 10)}`,
            markdown: md,
            kind: ["qa", "cloze", "code", "list"].includes(item.kind) ? item.kind : "qa",
            question: typeof item.question === "string" ? item.question : undefined,
            answer: typeof item.answer === "string" ? item.answer : undefined,
            memo: typeof item.memo === "string" ? item.memo : undefined,
            tags: Array.isArray(item.tags) ? item.tags.filter(t => typeof t === "string") : undefined,
            fsrsParams: item.fsrsParams && typeof item.fsrsParams === "object" ? {
                difficulty: typeof item.fsrsParams.difficulty === "number" ? item.fsrsParams.difficulty : undefined,
                stability: typeof item.fsrsParams.stability === "number" ? item.fsrsParams.stability : undefined,
            } : undefined,
        });
    }

    return {
        ok: true,
        package: {
            format: "lvcards.v1",
            version: typeof parsed.version === "number" ? parsed.version : 1,
            createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : Date.now(),
            generator: typeof parsed.generator === "string" ? parsed.generator : "siyuan-lv-cards",
            deck: {
                id: typeof parsed.deck.id === "string" ? parsed.deck.id : "deck-imported",
                name: parsed.deck.name.trim(),
                description: typeof parsed.deck.description === "string" ? parsed.deck.description : undefined,
            },
            cards,
            metadata: {
                cardCount: cards.length,
                tags: [...new Set(cards.flatMap(c => c.tags ?? []))],
            },
        },
    };
}

/**
 * 预览导入分享包：对比现有卡库，给出新卡、重复项与修改项分类
 */
export function previewLvCardsImport(
    pkg: LvCardsPackage,
    existingCards: { id: string; markdown: string }[]
): LvCardsImportPreview {
    const existingById = new Map<string, { id: string; markdown: string }>();
    const existingByFp = new Set<string>();

    for (const ec of existingCards) {
        existingById.set(ec.id, ec);
        existingByFp.add(normalizeCardFingerprint(ec.markdown));
    }

    const newCards: LvPackageCard[] = [];
    const duplicateCards: LvPackageCard[] = [];
    const updatedCards: LvCardsImportPreview["updatedCards"] = [];

    for (const card of pkg.cards) {
        const fp = normalizeCardFingerprint(card.markdown);
        const existing = existingById.get(card.id);

        if (existing) {
            if (normalizeCardFingerprint(existing.markdown) === fp) {
                duplicateCards.push(card);
            } else {
                updatedCards.push({ card, existing });
            }
        } else if (existingByFp.has(fp)) {
            duplicateCards.push(card);
        } else {
            newCards.push(card);
        }
    }

    return {
        deckName: pkg.deck.name,
        total: pkg.cards.length,
        newCards,
        duplicateCards,
        updatedCards,
    };
}
