/**
 * Anki M2：导入预览（docs/39 §3 M2）。
 * 纯模块：包（M1 解析产物）+ 每模型映射计划（M2 映射）+ 字段清洗（M2 清洗）+ 指纹查重
 * → 可导入卡清单 + 损失报告 + 包内重复组 + 统计。
 * 原则：映射/清洗不可逆处全部进 losses；媒体引用缺文件如实标注；绝不静默丢弃。
 */
import type { AnkiPackage } from "./anki-package";
import { cleanAnkiField } from "./anki-clean";
import { cardFingerprint, findInPackageDuplicates } from "./anki-dedupe";
import { planForModel } from "./anki-map";

export interface PreviewCard {
    guid: string;
    deckId: string;
    modelName: string;
    question: string;
    answer: string;
    tags: string[];
    mediaRefs: string[];
    fingerprint: string;
    /** 完形填空卡（语法已剥壳，损失报告有对应记录） */
    cloze: boolean;
    /** 附加字段并入答案尾部的内容（模型第 3+ 字段） */
    extraAnswer: string;
}

export interface PreviewLoss {
    guid: string;
    reason: string;
}

export interface ImportPreview {
    cards: PreviewCard[];
    losses: PreviewLoss[];
    /** 包内重复组（归一化问面相同）；M3 导入时可选择跳过后续张 */
    duplicates: { fingerprint: string; guids: string[] }[];
    stats: {
        models: number;
        notes: number;
        cards: number;
        importable: number;
        lost: number;
        duplicateGroups: number;
        mediaMissing: number;
    };
    /** 含完形填空语法的 note guid（语法已剥壳） */
    clozeGuids: string[];
}

export function buildImportPreview(pkg: AnkiPackage): ImportPreview {
    const cards: PreviewCard[] = [];
    const losses: PreviewLoss[] = [];
    const mediaSet = new Set(pkg.media);
    let mediaMissing = 0;
    const clozeGuids = new Set<string>();

    const modelsById = new Map(pkg.models.map((m) => [m.id, m]));
    const deckByGuid = new Map(pkg.cards.map((c) => [c.noteGuid, c.deckId]));

    for (const note of pkg.notes) {
        const model = modelsById.get(note.modelId);
        if (!model) {
            losses.push({ guid: note.guid, reason: `引用未知模型 ${note.modelId}（无法映射字段）` });
            continue;
        }
        const plan = planForModel(model);
        if (!plan.ok) {
            losses.push({ guid: note.guid, reason: plan.issue ?? "模型无法映射" });
            continue;
        }

        const cleanQ = cleanAnkiField(note.fields[plan.questionField] ?? "");
        losses.push(...cleanQ.losses.map((reason) => ({ guid: note.guid, reason: `问面：${reason}` })));

        const answerParts = [cleanAnkiField(note.fields[plan.answerField] ?? "")];
        losses.push(...answerParts[0].losses.map((reason) => ({ guid: note.guid, reason: `答面：${reason}` })));
        let extraAnswer = "";
        for (const idx of plan.extraFields) {
            const extra = cleanAnkiField(note.fields[idx] ?? "");
            losses.push(...extra.losses.map((reason) => ({ guid: note.guid, reason: `附加字段「${model.fieldNames[idx]}」：${reason}` })));
            if (extra.text) extraAnswer += (extraAnswer ? "\n" : "") + `${model.fieldNames[idx]}：${extra.text}`;
        }
        const answer = [answerParts[0].text, extraAnswer].filter(Boolean).join("\n\n");

        // 媒体核对：引用了包里不存在的文件 → 损失（卡保留但标注）
        const mediaRefs = [...new Set([...cleanQ.mediaRefs, ...answerParts[0].mediaRefs])];
        for (const ref of mediaRefs) {
            if (!mediaSet.has(ref)) {
                mediaMissing += 1;
                losses.push({ guid: note.guid, reason: `媒体缺失：包内无「${ref}」（导入后将以占位文本呈现）` });
            }
        }

        if (!cleanQ.text.trim()) {
            losses.push({ guid: note.guid, reason: "清洗后问面为空（无法成卡）" });
            continue;
        }
        if (cleanQ.cloze) clozeGuids.add(note.guid);

        cards.push({
            guid: note.guid,
            deckId: deckByGuid.get(note.guid) ?? "",
            modelName: model.name,
            question: cleanQ.text,
            answer,
            tags: note.tags,
            mediaRefs,
            fingerprint: cardFingerprint(cleanQ.text),
            cloze: cleanQ.cloze,
            extraAnswer,
        });
    }

    const duplicates = findInPackageDuplicates(cards.map((c) => ({ guid: c.guid, question: c.question })));

    return {
        cards,
        losses,
        duplicates,
        clozeGuids: [...clozeGuids],
        stats: {
            models: pkg.models.length,
            notes: pkg.notes.length,
            cards: pkg.cards.length,
            importable: cards.length,
            lost: losses.length,
            duplicateGroups: duplicates.length,
            mediaMissing,
        },
    };
}
