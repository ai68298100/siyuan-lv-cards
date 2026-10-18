// 修复：补全代码引用但 i18n 缺失的键（zh-CN + en 同步）
import fs from "node:fs";

const zhPath = "public/i18n/zh-CN.json";
const enPath = "public/i18n/en.json";
const zh = JSON.parse(fs.readFileSync(zhPath, "utf8"));
const en = JSON.parse(fs.readFileSync(enPath, "utf8"));

const zhPatch = {
    aiKill: {
        targetDisabled: "AI 已被紧急停用（当前配置或模型已禁用），可到设置 → AI 恢复。",
        consentRevoked: "AI 使用同意已被撤销，可到设置 → AI 重新开启。",
    },
    examMilestone: "考试「${name}」还剩 ${n} 天",
    examReportWritten: "考试复盘已写入文档",
    inboxEmptySource: "收件箱来源内容为空，无法制卡",
    capability: {
        title: "能力分布",
        sub: "按知识对象的掌握阶段汇总（本地日志口径）",
    },
    aiWizard: {
        resumeCopied: "失败明细已复制到剪贴板",
        selCount: "已选 ${n}",
        accCount: "已接受 ${n}",
        acceptAll: "全部接受",
        sourceFold: "来源依据",
        lintDup: "疑似重复",
        lintLong: "答案过长",
        lintShort: "内容过短",
        reviewAccepted: "已接受",
        reviewVerified: "已核实",
        cardPreview: "卡面预览",
        acceptVer: "接受",
        markVerified: "核实通过",
        previewQLabel: "问题",
        previewALabel: "答案",
        importReviewed: "将已接受的候选落库为正式卡片（未接受候选丢弃）",
    },
};
const enPatch = {
    aiKill: {
        targetDisabled: "AI has been emergency-stopped (current config or model disabled). Restore it in Settings → AI.",
        consentRevoked: "AI consent has been revoked. Re-enable it in Settings → AI.",
    },
    examMilestone: "Exam \"${name}\": ${n} days left",
    examReportWritten: "Exam review written to document",
    inboxEmptySource: "Inbox sources are empty; nothing to create cards from",
    capability: {
        title: "Capability mix",
        sub: "Grouped by knowledge-object mastery stage (local log basis)",
    },
    aiWizard: {
        resumeCopied: "Failure details copied",
        selCount: "Selected ${n}",
        accCount: "Accepted ${n}",
        acceptAll: "Accept all",
        sourceFold: "Source evidence",
        lintDup: "Possible duplicate",
        lintLong: "Answer too long",
        lintShort: "Too short",
        reviewAccepted: "Accepted",
        reviewVerified: "Verified",
        cardPreview: "Card preview",
        acceptVer: "Accept",
        markVerified: "Mark verified",
        previewQLabel: "Question",
        previewALabel: "Answer",
        importReviewed: "Commit accepted candidates as real cards (unaccepted ones are dropped)",
    },
};

function apply(tree, patch, pathPrefix = "") {
    let added = 0;
    for (const [k, v] of Object.entries(patch)) {
        const p = pathPrefix ? pathPrefix + "." + k : k;
        if (v && typeof v === "object") {
            if (!tree[k] || typeof tree[k] !== "object") { tree[k] = {}; added++; }
            added += apply(tree[k], v, p);
        } else if (!(k in tree)) {
            tree[k] = v;
            added++;
        }
    }
    return added;
}

const az = apply(zh, zhPatch);
const ae = apply(en, enPatch);
// 检测格式（tab or spaces）
const raw = fs.readFileSync(zhPath, "utf8");
const indent = raw.includes("\n\t\"") || raw.includes("\n\t\"") ? "\t" : "    ";
fs.writeFileSync(zhPath, JSON.stringify(zh, null, indent) + "\n");
fs.writeFileSync(enPath, JSON.stringify(en, null, indent) + "\n");
console.log(`zh 新增 ${az} 键，en 新增 ${ae} 键，缩进=${indent === "\t" ? "tab" : "spaces"}`);
